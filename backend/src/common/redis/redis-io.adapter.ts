import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/** Socket.IO adapter backed by Redis pub/sub so rooms and broadcasts span every API instance. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private readonly clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly corsOrigins: readonly string[],
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new Redis(this.redisUrl, { lazyConnect: true });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.clients.push(pub, sub);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const merged = {
      ...options,
      cors: { origin: [...this.corsOrigins], credentials: true },
      pingInterval: 20_000,
      pingTimeout: 20_000,
      maxHttpBufferSize: 16_384,
    } as ServerOptions;
    const server = super.createIOServer(port, merged) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(this.clients.map((client) => client.quit()));
  }
}
