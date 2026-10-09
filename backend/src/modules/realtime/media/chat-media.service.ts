import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseBuffer } from 'music-metadata';
import sharp, { type OutputInfo } from 'sharp';
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MAX_EDGE,
  CHAT_VOICE_MAX_BYTES,
  type ChatMediaDto,
  type ChatMediaKind,
  type ChatVoiceType,
} from '@insidelife/shared';
import { GameRuleException } from '../../../common/exceptions/domain.exception.js';
import { isChatVoiceType, isCreativeSource, sniffMedia } from '../../../common/media/media-sniff.js';
import { ImageSafety } from '../../../common/moderation/image-safety.service.js';
import { StorageService, type StoredStream } from '../../../common/storage/storage.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import {
  linkExpiry,
  signMediaLink,
  VOICE_EXTENSION,
  verifyMediaLink,
  voiceLengthProblem,
} from './chat-media.rules.js';
import { mp4DurationMs, webmDurationMs } from './voice-duration.js';

export interface UploadedChatFile {
  readonly buffer: Buffer;
  readonly size: number;
}

/** A validated, stored voice note or photo, ready to attach to a message. */
export interface PreparedMedia {
  readonly kind: ChatMediaKind;
  readonly key: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface MediaColumns {
  readonly id: string;
  readonly mediaKey: string | null;
  readonly mediaType: string | null;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

const MAX_INPUT_PIXELS = 40_000_000;
const MEDIA_ROUTE = '/api/v1/chat/media';
/** The parser's view must agree with the magic bytes. Chrome's fragmented MP4 doesn't expose its codec, so MP4 only
 * has to be audio-only. */
const PLAYABLE_VOICE: Readonly<Record<ChatVoiceType, (container: string, codec: string) => boolean>> = {
  'audio/webm': (container, codec) => container.includes('webm') && codec.toUpperCase().includes('OPUS'),
  'audio/ogg': (container, codec) => container === 'Ogg' && codec === 'Opus',
  'audio/mp4': (_container, codec) => codec === '' || /aac|mp4a|opus/i.test(codec),
};

const invalid = (message: string): GameRuleException => new GameRuleException('INVALID_MEDIA', message);

/**
 * Chat voice notes and photos. Uploads are identified by their bytes (never the declared type), checked, stored in the
 * private bucket and only ever served through short-lived signed links handed to the people in the chat.
 * - Voice notes: WebM/Opus, Ogg/Opus or MP4/AAC as recorded by the browser, stored as-is after the length check.
 * - Photos: re-encoded to WebP (auto-orient, ≤1600 px, metadata stripped) and screened for nudity first.
 */
@Injectable()
export class ChatMediaService {
  private readonly secret: string;

  constructor(
    private readonly storage: StorageService,
    private readonly safety: ImageSafety,
    config: ConfigService<AppConfig, true>,
  ) {
    this.secret = config.get('auth', { infer: true }).accessSecret;
  }

  async prepare(kind: ChatMediaKind, file: UploadedChatFile | undefined): Promise<PreparedMedia> {
    if (!file || file.size === 0)
      throw invalid(kind === 'voice' ? 'Record a voice note first' : 'Pick a photo first');
    return kind === 'voice' ? this.prepareVoice(file) : this.preparePhoto(file);
  }

  /** Best effort, for a message that failed to save after its media was stored. */
  async discard(key: string): Promise<void> {
    await this.storage.remove(key, 'private');
  }

  async discardMany(keys: readonly string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += 1000)
      await this.storage.removeMany(keys.slice(start, start + 1000), 'private');
  }

  open(key: string): Promise<StoredStream | null> {
    return this.storage.open(key, 'private');
  }

  /** The DTO part of a stored message (a fresh signed link), or null for text. */
  toDto(message: MediaColumns, now = Date.now()): ChatMediaDto | null {
    if (!message.mediaKey || !message.mediaType) return null;
    const expiresAt = linkExpiry(now);
    const signature = signMediaLink(this.secret, message.id, expiresAt);
    return {
      url: `${MEDIA_ROUTE}/${message.id}?exp=${expiresAt}&sig=${signature}`,
      contentType: message.mediaType,
      durationMs: message.durationMs,
      width: message.width,
      height: message.height,
    };
  }

  verifyLink(messageId: string, expiresAt: number, signature: string, now = Date.now()): boolean {
    return verifyMediaLink(this.secret, messageId, expiresAt, signature, now);
  }

  private async prepareVoice(file: UploadedChatFile): Promise<PreparedMedia> {
    if (file.size > CHAT_VOICE_MAX_BYTES) throw invalid('That voice note is too big. Keep it under 1:30');
    const sniffed = sniffMedia(file.buffer.subarray(0, 16));
    if (!isChatVoiceType(sniffed)) throw invalid('That isn’t a voice recording we can play');

    const bytes = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.length);
    let format: { container?: string; codec?: string; duration?: number; hasVideo?: boolean };
    try {
      ({ format } = await parseBuffer(
        bytes,
        { mimeType: sniffed, size: file.size },
        { duration: sniffed === 'audio/ogg', skipCovers: true },
      ));
    } catch {
      throw invalid('We couldn’t read that voice note. Record it again');
    }
    if (format.hasVideo === true || !PLAYABLE_VOICE[sniffed](format.container ?? '', format.codec ?? ''))
      throw invalid('That isn’t a voice recording we can play');

    const durationMs =
      sniffed === 'audio/webm'
        ? webmDurationMs(bytes)
        : sniffed === 'audio/mp4'
          ? mp4DurationMs(bytes)
          : format.duration !== undefined
            ? Math.round(format.duration * 1000)
            : null;
    const problem = voiceLengthProblem(durationMs);
    if (problem) throw invalid(problem);

    const stored = await this.storage.put(
      this.storage.newKey('chat', VOICE_EXTENSION[sniffed]),
      file.buffer,
      sniffed,
      'private',
    );
    return {
      kind: 'voice',
      key: stored.key,
      contentType: sniffed,
      bytes: stored.bytes,
      durationMs,
      width: null,
      height: null,
    };
  }

  private async preparePhoto(file: UploadedChatFile): Promise<PreparedMedia> {
    if (file.size > CHAT_IMAGE_MAX_BYTES) throw invalid('That photo is too big. Try a smaller one');
    const sniffed = sniffMedia(file.buffer.subarray(0, 16));
    if (!isCreativeSource(sniffed)) throw invalid('Send a JPEG, PNG or WebP photo');

    let rendered: { data: Buffer; info: OutputInfo };
    try {
      rendered = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS,
        animated: false,
        autoOrient: true,
      })
        .resize(CHAT_IMAGE_MAX_EDGE, CHAT_IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .webp({ quality: 80, effort: 4 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw invalid('We couldn’t open that photo. Try another one');
    }

    const verdict = await this.safety.check(rendered.data);
    if (!verdict.allowed)
      throw new GameRuleException(
        'PHOTO_NOT_ALLOWED',
        'That photo can’t be sent. Nudity and sexual content aren’t allowed in Inside Life',
      );

    const stored = await this.storage.put(
      this.storage.newKey('chat', 'webp'),
      rendered.data,
      'image/webp',
      'private',
    );
    return {
      kind: 'image',
      key: stored.key,
      contentType: 'image/webp',
      bytes: stored.bytes,
      durationMs: null,
      width: rendered.info.width,
      height: rendered.info.height,
    };
  }
}
