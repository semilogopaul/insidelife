import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { MediaExtension, MediaFolder, MediaVisibility, StoredObject, StoredStream } from '../../src/common/storage/storage.service.js';

interface StoredFile {
  readonly body: Buffer;
  readonly contentType: string;
  readonly visibility: MediaVisibility;
}

/**
 * In-memory stand-in for `StorageService` (S3). Same surface and key/url conventions, so promotions and chat media run
 * unchanged; nothing leaves the test process and CI needs no object store.
 */
export class MemoryStorage {
  readonly files = new Map<string, StoredFile>();

  publicUrl(key: string): string {
    return `/media/${key}`;
  }

  newKey(folder: MediaFolder, extension: MediaExtension): string {
    return `${folder}/${randomUUID()}.${extension}`;
  }

  async put(key: string, body: Buffer, contentType: string, visibility: MediaVisibility = 'public'): Promise<StoredObject> {
    this.files.set(key, { body: Buffer.from(body), contentType, visibility });
    return { key, url: visibility === 'public' ? this.publicUrl(key) : '', bytes: body.length };
  }

  async open(key: string, visibility: MediaVisibility = 'private'): Promise<StoredStream | null> {
    const file = this.files.get(key);
    if (!file || file.visibility !== visibility) return null;
    return { body: Readable.from(file.body), contentType: file.contentType, bytes: file.body.length };
  }

  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }

  async removeMany(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.files.delete(key);
  }

  onModuleInit(): void {}

  onApplicationShutdown(): void {}
}
