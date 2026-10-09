import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';
import * as tf from '@tensorflow/tfjs-core';
// oxlint-disable-next-line import/no-unassigned-import -- importing it registers the 'wasm' backend with tfjs-core
import '@tensorflow/tfjs-backend-wasm';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';
import { ExternalServiceException } from '../exceptions/domain.exception.js';
import { NSFW_INPUT_SIZE } from './image-safety.rules.js';

/**
 * Worker thread that runs the NSFW classifier (TensorFlow.js on WebAssembly, ~40 ms a photo) so inference never
 * blocks the API's event loop. Messages in: `{ id, pixels }` (224×224 RGB bytes); out: `{ id, scores }` or
 * `{ id, error }`. The model ships in `backend/assets/moderation` (MIT, from NSFWJS).
 */

interface ClassifyRequest {
  readonly id: number;
  readonly pixels: Uint8Array;
}

const MODEL_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'assets',
  'moderation',
  'nsfw-mobilenet-v2-mid',
);

interface ModelJson {
  readonly modelTopology: object;
  readonly weightsManifest: readonly {
    readonly paths: readonly string[];
    readonly weights: tf.io.WeightsManifestEntry[];
  }[];
}

async function loadModel(): Promise<GraphModel> {
  tf.enableProdMode();
  await tf.setBackend('wasm');
  await tf.ready();
  const json = JSON.parse(await readFile(join(MODEL_DIR, 'model.json'), 'utf8')) as ModelJson;
  const group = json.weightsManifest[0];
  if (!group) throw new ExternalServiceException('Photo check');
  const shards = await Promise.all(group.paths.map((path) => readFile(join(MODEL_DIR, path))));
  const weights = Buffer.concat(shards);
  return loadGraphModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: group.weights,
      weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.length),
    }),
  );
}

const model = loadModel();

const reply = (message: {
  readonly id: number;
  readonly scores?: number[];
  readonly error?: string;
}): void => {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads port, not a window
  parentPort?.postMessage(message);
};

parentPort?.on('message', (request: ClassifyRequest) => {
  void (async () => {
    try {
      const loaded = await model;
      const scores = tf.tidy(() => {
        const input = tf.tensor4d(
          Float32Array.from(request.pixels, (value) => value / 255),
          [1, NSFW_INPUT_SIZE, NSFW_INPUT_SIZE, 3],
        );
        return Array.from((loaded.predict(input) as tf.Tensor).dataSync());
      });
      reply({ id: request.id, scores });
    } catch (error) {
      reply({ id: request.id, error: error instanceof Error ? error.message : String(error) });
    }
  })();
});
