import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import sharp from 'sharp';
import { Worker } from 'node:worker_threads';
import { ExternalServiceException } from '../exceptions/domain.exception.js';
import { judgeImage, NSFW_INPUT_SIZE, scoresFromVector, type ImageVerdict } from './image-safety.rules.js';

/** First call includes loading the model and WebAssembly; later checks take ~40 ms. */
const CHECK_TIMEOUT_MS = 15_000;
const MAX_INPUT_PIXELS = 40_000_000;

interface Pending {
  readonly resolve: (scores: number[]) => void;
  readonly reject: (error: ExternalServiceException) => void;
  readonly timer: NodeJS.Timeout;
}

type WorkerReply =
  { readonly id: number; readonly scores: number[] } | { readonly id: number; readonly error: string };

/**
 * Screens photos for nudity before anyone else sees them. Inference runs in a worker thread (started on first use,
 * restarted if it dies). Fails closed: if the check can't run, the upload is refused with a friendly 502.
 */
@Injectable()
export class ImageSafety implements OnModuleDestroy {
  private readonly logger = new Logger(ImageSafety.name);
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  async check(image: Buffer): Promise<ImageVerdict> {
    let pixels: Buffer;
    try {
      pixels = await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS, autoOrient: true })
        .removeAlpha()
        .resize(NSFW_INPUT_SIZE, NSFW_INPUT_SIZE, { fit: 'fill' })
        .raw()
        .toBuffer();
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not decode a photo for screening');
      throw new ExternalServiceException('Photo check');
    }
    const scores = await this.classify(new Uint8Array(pixels));
    return judgeImage(scoresFromVector(scores));
  }

  onModuleDestroy(): void {
    this.failAll(new ExternalServiceException('Photo check'));
    void this.worker?.terminate();
    this.worker = null;
  }

  private classify(pixels: Uint8Array): Promise<number[]> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ExternalServiceException('Photo check'));
      }, CHECK_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, pixels }, [pixels.buffer as ArrayBuffer]);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./image-safety.worker.js', import.meta.url));
    worker.unref();
    worker.on('message', (reply: WorkerReply) => {
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      clearTimeout(pending.timer);
      if ('scores' in reply) pending.resolve(reply.scores);
      else {
        this.logger.error({ error: reply.error }, 'Photo screening failed');
        pending.reject(new ExternalServiceException('Photo check'));
      }
    });
    const onDeath = (error: unknown): void => {
      this.logger.error({ err: error }, 'Photo screening worker stopped; it restarts on the next photo');
      if (this.worker === worker) this.worker = null;
      this.failAll(new ExternalServiceException('Photo check'));
    };
    worker.on('error', onDeath);
    worker.on('exit', (code) => code !== 0 && onDeath(`exit ${code}`));
    this.worker = worker;
    return worker;
  }

  private failAll(error: ExternalServiceException): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
