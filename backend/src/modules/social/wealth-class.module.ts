import { Module } from '@nestjs/common';
import { WealthClassService } from './wealth-class.service.js';

/** Exposes `WealthClassService` (nepo/lapo) to other domains without pulling in the rest of social. */
@Module({ providers: [WealthClassService], exports: [WealthClassService] })
export class WealthClassModule {}
