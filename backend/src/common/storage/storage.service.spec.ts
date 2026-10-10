import { S3ServiceException } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service.js';

function build(bootstrap: boolean) {
  const storage = {
    endpoint: 'https://acct.r2.cloudflarestorage.com',
    region: 'auto',
    accessKey: 'key',
    secretKey: 'secret-secret',
    bucket: 'media',
    privateBucket: 'private',
    publicBaseUrl: 'https://media.example.com',
    bootstrap,
  };
  const service = new StorageService({ get: () => storage } as never);
  const sent: string[] = [];
  const send = vi.fn(async (command: { constructor: { name: string } }) => {
    sent.push(command.constructor.name);
    if (command.constructor.name === 'HeadBucketCommand') {
      throw new S3ServiceException({ name: 'NotFound', $fault: 'client', $metadata: { httpStatusCode: 404 } });
    }
    return {};
  });
  (service as unknown as { client: { send: typeof send } }).client.send = send;
  return { service, sent };
}

describe('StorageService bucket bootstrap', () => {
  it('S3_BOOTSTRAP=false: no HeadBucket / CreateBucket at boot or before an upload (R2: buckets exist already)', async () => {
    const { service, sent } = build(false);
    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await service.put('billboards/a.webp', Buffer.from('x'), 'image/webp');
    await service.put('chat/b.webp', Buffer.from('x'), 'image/webp', 'private');
    expect(sent).toEqual(['PutObjectCommand', 'PutObjectCommand']);
    service.onApplicationShutdown();
  });

  it('S3_BOOTSTRAP=true (local SeaweedFS): creates the missing buckets', async () => {
    const { service, sent } = build(true);
    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent.filter((name) => name === 'CreateBucketCommand')).toHaveLength(2);
    service.onApplicationShutdown();
  });

  it('builds public URLs from the public base URL', () => {
    const { service } = build(false);
    expect(service.publicUrl('tracks/x.mp3')).toBe('https://media.example.com/tracks/x.mp3');
    service.onApplicationShutdown();
  });
});
