import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, type Repository } from 'typeorm';
import { BILLBOARD_FORMAT_SPECS, CREATIVE_MAX_BYTES, findBillboardSlot, type BillboardSlot, type CreativeDto } from '@insidelife/shared';
import { RateLimitedException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { CreativeEntity } from './entities/creative.entity.js';
import { renderCreative } from './media/image-processor.js';
import type { UploadedMedia } from './promotions.types.js';
import { InvalidMediaException, PromotionRuleException } from './promotions.errors.js';
import { isCreativeSource, sniffMedia } from '../../common/media/media-sniff.js';
import { StorageService } from '../../common/storage/storage.service.js';

/** Storage-abuse guard: processed images per account per rolling 24 h. */
const DAILY_CREATIVE_UPLOADS = 20;

const toDto = (entity: CreativeEntity): CreativeDto => ({
  creativeKey: entity.key,
  url: entity.url,
  format: entity.format,
  width: entity.width,
  height: entity.height,
  bytes: entity.bytes,
});

/** Billboard images: sniff → re-encode to the slot's exact size → store → remember who owns it. */
@Injectable()
export class CreativeService {
  constructor(
    @InjectRepository(CreativeEntity) private readonly creatives: Repository<CreativeEntity>,
    private readonly storage: StorageService,
  ) {}

  async upload(userId: string, slotId: string, file: UploadedMedia | undefined): Promise<CreativeDto> {
    const slot = this.requireSlot(slotId);
    if (!file || file.size === 0) throw new InvalidMediaException('Choose an image to upload');
    if (file.size > CREATIVE_MAX_BYTES) throw new InvalidMediaException(`Images can be at most ${CREATIVE_MAX_BYTES / 1024 / 1024} MB`);
    const sniffed = sniffMedia(file.buffer);
    if (!isCreativeSource(sniffed)) throw new InvalidMediaException('Upload a PNG, JPEG or WebP image');

    const recent = await this.creatives.count({ where: { ownerUserId: userId, createdAt: MoreThan(new Date(Date.now() - 86_400_000)) } });
    if (recent >= DAILY_CREATIVE_UPLOADS) throw new RateLimitedException('That’s a lot of uploads today — try again tomorrow');

    const spec = BILLBOARD_FORMAT_SPECS[slot.format];
    const rendered = await renderCreative(file.buffer, sniffed, spec);
    const stored = await this.storage.put(this.storage.newKey('billboards', 'webp'), rendered.buffer, 'image/webp');
    try {
      const entity = await this.creatives.save(
        this.creatives.create({ ownerUserId: userId, format: slot.format, width: rendered.width, height: rendered.height, key: stored.key, url: stored.url, bytes: stored.bytes }),
      );
      return toDto(entity);
    } catch (error) {
      await this.storage.remove(stored.key);
      throw error;
    }
  }

  /** The caller's creative, checked to fit the slot (same format → same exact pixel size). */
  async requireOwnedFor(userId: string, key: string, slot: BillboardSlot): Promise<CreativeEntity> {
    const creative = await this.creatives.findOne({ where: { key, ownerUserId: userId } });
    if (!creative) throw new ResourceNotFoundException('Creative');
    if (creative.format !== slot.format || creative.width !== slot.width || creative.height !== slot.height) {
      throw new PromotionRuleException('CREATIVE_FORMAT_MISMATCH', `This image was made for a ${creative.format} board. Upload one for ${slot.name} (${slot.format}, ${slot.width}×${slot.height})`);
    }
    return creative;
  }

  private requireSlot(slotId: string): BillboardSlot {
    const slot = findBillboardSlot(slotId);
    if (!slot) throw new ResourceNotFoundException('Billboard');
    return slot;
  }
}
