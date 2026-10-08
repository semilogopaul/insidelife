import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';
import { migrationGlobs } from './data-source.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const database = config.get('database', { infer: true });
        return {
          type: 'postgres' as const,
          url: database.url,
          uuidExtension: 'pgcrypto' as const,
          autoLoadEntities: true,
          synchronize: database.synchronize,
          migrations: migrationGlobs,
          migrationsRun: database.runMigrations && !database.synchronize,
          namingStrategy: new SnakeNamingStrategy(),
          extra: { max: database.poolSize, idleTimeoutMillis: 30_000 },
          logging: ['error', 'warn', 'migration'] as const,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
