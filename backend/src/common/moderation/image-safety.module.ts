import { Module } from '@nestjs/common';
import { ImageSafety } from './image-safety.service.js';

/** Photo screening (one classifier worker per process), for any domain that accepts player photos. */
@Module({
  providers: [ImageSafety],
  exports: [ImageSafety],
})
export class ImageSafetyModule {}
