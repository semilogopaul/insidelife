import 'reflect-metadata';
import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { AddressInfo } from 'node:net';
import type { DataSource } from 'typeorm';
import { TestClock } from './clock.js';
import { applyE2eEnv } from './env.js';
import { MemoryStorage } from './memory-storage.js';

export interface E2eApp {
  readonly app: NestExpressApplication;
  readonly dataSource: DataSource;
  readonly clock: TestClock;
  readonly storage: MemoryStorage;
  /** `http://127.0.0.1:<port>` of the listening app (for sockets). */
  readonly baseUrl: string;
  get<T>(token: Type<T> | string | symbol): T;
  close(): Promise<void>;
}

export interface BootOptions {
  /** Extra environment for this app (e.g. a Flutterwave key for the gateway spec). */
  readonly env?: Readonly<Record<string, string>>;
  /** Further provider overrides on top of the in-memory storage. */
  readonly override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Boot the real `AppModule` in-process: every module, guard, pipe, queue worker and the HTTP pipeline of `main.ts`
 * (`configureApp`), on an ephemeral port on 127.0.0.1. Only object storage is replaced (in memory), and sockets use
 * the in-process adapter instead of the Redis one (one node; it also keeps the suite's socket traffic off any dev
 * server sharing the Redis instance). The env is applied before AppModule is imported (ConfigModule reads it then).
 */
export async function bootApp(options: BootOptions = {}): Promise<E2eApp> {
  applyE2eEnv(options.env);
  const [{ AppModule }, { configureApp }, { StorageService }, { WorldService }, { Logger }] = await Promise.all([
    import('../../src/app.module.js'),
    import('../../src/app.setup.js'),
    import('../../src/common/storage/storage.service.js'),
    import('../../src/modules/world/world.service.js'),
    import('nestjs-pino'),
  ]);

  const storage = new MemoryStorage();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(storage);
  if (options.override) builder = options.override(builder);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.useWebSocketAdapter(new IoAdapter(app as INestApplication));
  const clock = new TestClock(app.get(WorldService));
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    dataSource: app.get<DataSource>(getDataSourceToken()),
    clock,
    storage,
    baseUrl: `http://127.0.0.1:${address.port}`,
    get: <T>(token: Type<T> | string | symbol): T => app.get<T>(token as Type<T>, { strict: false }),
    close: () => app.close(),
  };
}
