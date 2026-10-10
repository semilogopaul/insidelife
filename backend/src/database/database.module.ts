import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';
import { resolvePostgresConnection } from './connection-options.js';
import { migrationGlobs } from './data-source.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const database = config.get('database', { infer: true });
        // The app talks to Postgres through PgBouncer (transaction mode) in production: no session state, see docs/DEPLOY.md.
        const connection = resolvePostgresConnection(database.url, database.ssl);
        return {
          type: 'postgres' as const,
          url: connection.url,
          ssl: connection.ssl,
          uuidExtension: 'pgcrypto' as const,
          autoLoadEntities: true,
          synchronize: database.synchronize,
          migrations: migrationGlobs,
          migrationsRun: database.runMigrations && !database.synchronize,
          namingStrategy: new SnakeNamingStrategy(),
          extra: { max: database.poolSize, idleTimeoutMillis: 30_000, keepAlive: true, connectionTimeoutMillis: 10_000 },
          logging: ['error', 'warn', 'migration'] as const,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
