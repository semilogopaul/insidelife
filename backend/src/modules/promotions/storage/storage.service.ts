import { CreateBucketCommand, DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ExternalServiceException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';

export type MediaFolder = 'billboards' | 'tracks';

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
 * S3-compatible object storage for promotion media (SeaweedFS locally, any S3 in production). Only the API writes,
 * with credentials; players read approved media anonymously via `storage.publicBaseUrl`. The bucket is created on
 * boot when missing (retrying while storage starts up, and again before an upload if it never confirmed); if storage
 * is down the API still boots and uploads fail with a friendly 502.
 */
@Injectable()
export class StorageService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private bucketReady = false;
  private closed = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    const storage = config.get('storage', { infer: true });
    this.bucket = storage.bucket;
    this.publicBaseUrl = storage.publicBaseUrl.replace(/\/+$/, '');
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: true,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 2_000, requestTimeout: 15_000 },
    });
  }

  onModuleInit(): void {
    // Never block boot on storage; keep trying in the background.
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
  newKey(folder: MediaFolder, extension: 'webp' | 'mp3' | 'ogg'): string {
    return `${folder}/${randomUUID()}.${extension}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    if (!this.bucketReady) await this.ensureBucket(false);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
          CacheControl: IMMUTABLE_CACHE,
          ContentDisposition: 'inline',
        }),
      );
    } catch (error) {
      this.logger.error({ err: error, key }, 'Media upload failed');
      throw new ExternalServiceException('Media storage');
    }
    return { key, url: this.publicUrl(key), bytes: body.length };
  }

  /** Best effort (rejected media, failed bookings). Never throws. */
  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Media delete failed; leaving the object behind');
    }
  }

  private async ensureBucketWithRetry(attempt: number): Promise<void> {
    if (this.closed || (await this.ensureBucket(attempt === BOOT_ATTEMPTS))) return;
    if (attempt >= BOOT_ATTEMPTS) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt);
    this.retryTimer = setTimeout(() => void this.ensureBucketWithRetry(attempt + 1), delay);
    this.retryTimer.unref();
  }

  /** Make sure the bucket exists. Returns whether it's ready; `warn` logs when storage can't be reached. */
  private async ensureBucket(warn = true): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Media bucket "${this.bucket}" ready`);
      this.bucketReady = true;
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return this.createBucket();
      if (warn) this.logger.warn({ err: error }, `Media storage unreachable; uploads will fail until it is back`);
    }
    return this.bucketReady;
  }

  private async createBucket(): Promise<boolean> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created media bucket "${this.bucket}"`);
      this.bucketReady = true;
    } catch (error) {
      this.logger.warn({ err: error }, `Could not create media bucket "${this.bucket}"`);
    }
    return this.bucketReady;
  }
}
