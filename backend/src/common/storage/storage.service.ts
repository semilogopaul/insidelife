import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { ExternalServiceException } from '../exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';

export type MediaFolder = 'billboards' | 'tracks' | 'chat';
export type MediaExtension = 'webp' | 'mp3' | 'ogg' | 'webm' | 'm4a';
/** `public` objects are readable anonymously through the gateway (`/media`); `private` ones only via the API. */
export type MediaVisibility = 'public' | 'private';

export interface StoredStream {
  readonly body: Readable;
  readonly contentType: string;
  readonly bytes: number | null;
}

export interface StoredObject {
  readonly key: string;
  readonly url: string;
  readonly bytes: number;
}

/** Keys are immutable (fresh UUID per upload), so browsers and the gateway may cache them forever. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** Storage often comes up after the API (containers start in parallel): keep checking the bucket for ~2 minutes. */
const BOOT_ATTEMPTS = 7;
const MAX_BACKOFF_MS = 30_000;

/**
 * S3-compatible object storage (SeaweedFS locally, any S3 in production). Only the API writes, with credentials.
 * Two buckets: public media (approved billboard creatives, club tracks) that players read anonymously via
 * `storage.publicBaseUrl`, and private media (chat voice notes and photos) that the API streams after an access
 * check (S3_BOOTSTRAP=false skips all of this: R2 buckets are made in advance). Buckets are created on boot when missing (retrying while storage starts up, and again before an upload if
 * that never confirmed); if storage is down the API still boots and uploads fail with a friendly 502.
 */
@Injectable()
export class StorageService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly buckets: Readonly<Record<MediaVisibility, string>>;
  private readonly publicBaseUrl: string;
  private readonly bootstrap: boolean;
  private ready: Record<MediaVisibility, boolean> = { public: false, private: false };
  private closed = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    const storage = config.get('storage', { infer: true });
    this.buckets = { public: storage.bucket, private: storage.privateBucket };
    this.publicBaseUrl = storage.publicBaseUrl.replace(/\/+$/, '');
    this.bootstrap = storage.bootstrap;
    // Buckets already exist (Cloudflare R2, managed S3): never call HeadBucket / CreateBucket.
    if (!this.bootstrap) this.ready = { public: true, private: true };
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: true,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
      maxAttempts: 2,
      // Cloudflare R2 (and older S3-compatibles) reject the SDK's default CRC32 trailer checksums.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: { connectionTimeout: 2_000, requestTimeout: 15_000 },
    });
  }

  onModuleInit(): void {
    // Never block boot on storage; keep trying in the background.
    if (!this.bootstrap) return;
    void this.ensureBucketWithRetry(1);
  }

  onApplicationShutdown(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.client.destroy();
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /** `folder/<uuid>.<extension>` — unguessable, collision-free, never derived from user input. */
  newKey(folder: MediaFolder, extension: MediaExtension): string {
    return `${folder}/${randomUUID()}.${extension}`;
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    visibility: MediaVisibility = 'public',
  ): Promise<StoredObject> {
    if (!this.ready[visibility]) await this.ensureBucket(visibility, false);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.buckets[visibility],
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
          CacheControl: visibility === 'public' ? IMMUTABLE_CACHE : 'private, max-age=86400',
          ContentDisposition: 'inline',
        }),
      );
    } catch (error) {
      this.logger.error({ err: error, key }, 'Media upload failed');
      throw new ExternalServiceException('Media storage');
    }
    return { key, url: visibility === 'public' ? this.publicUrl(key) : '', bytes: body.length };
  }

  /** Stream an object (private media goes through the API after an access check). Null when it's gone. */
  async open(key: string, visibility: MediaVisibility = 'private'): Promise<StoredStream | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.buckets[visibility], Key: key }),
      );
      if (!result.Body) return null;
      return {
        body: result.Body as Readable,
        contentType: result.ContentType ?? 'application/octet-stream',
        bytes: result.ContentLength ?? null,
      };
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
      this.logger.error({ err: error, key }, 'Media read failed');
      throw new ExternalServiceException('Media storage');
    }
  }

  /** Best effort (rejected media, failed bookings). Never throws. */
  async remove(key: string, visibility: MediaVisibility = 'public'): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.buckets[visibility], Key: key }));
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Media delete failed; leaving the object behind');
    }
  }

  /** Best-effort batch delete (retention sweeps), at most 1000 keys per call. Never throws. */
  async removeMany(keys: readonly string[], visibility: MediaVisibility): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.buckets[visibility],
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    } catch (error) {
      this.logger.warn(
        { err: error, count: keys.length },
        'Media batch delete failed; leaving the objects behind',
      );
    }
  }

  private async ensureBucketWithRetry(attempt: number): Promise<void> {
    if (this.closed) return;
    const warn = attempt === BOOT_ATTEMPTS;
    const [publicReady, privateReady] = await Promise.all([
      this.ensureBucket('public', warn),
      this.ensureBucket('private', warn),
    ]);
    if (publicReady && privateReady) return;
    if (attempt >= BOOT_ATTEMPTS) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt);
    this.retryTimer = setTimeout(() => void this.ensureBucketWithRetry(attempt + 1), delay);
    this.retryTimer.unref();
  }

  /** Make sure a bucket exists. Returns whether it's ready; `warn` logs when storage can't be reached. */
  private async ensureBucket(visibility: MediaVisibility, warn = true): Promise<boolean> {
    if (this.ready[visibility]) return true;
    const bucket = this.buckets[visibility];
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      this.logger.log(`Media bucket "${bucket}" ready`);
      this.ready[visibility] = true;
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
        return this.createBucket(visibility);
      if (warn)
        this.logger.warn({ err: error }, `Media storage unreachable; uploads will fail until it is back`);
    }
    return this.ready[visibility];
  }

  private async createBucket(visibility: MediaVisibility): Promise<boolean> {
    const bucket = this.buckets[visibility];
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Created media bucket "${bucket}"`);
      this.ready[visibility] = true;
    } catch (error) {
      this.logger.warn({ err: error }, `Could not create media bucket "${bucket}"`);
    }
    return this.ready[visibility];
  }
}
