import { Injectable } from '@nestjs/common';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { CertificationEntity } from '../entities/certification.entity.js';
import { EDUCATION_MEMO, EducationStore } from './education-store.service.js';

/** Codes are short slugs (`bar`, `ican`, `drivers-licence`). */
const CODE_PATTERN = /^[a-z0-9-]{2,32}$/;

/** Licences and certificates held by the character, from programmes or granted by other domains. */
@Injectable()
export class CertificationsService {
  constructor(private readonly store: EducationStore) {}

  async codes(ctx: SimulationContext): Promise<string[]> {
    return (await this.store.certifications(ctx)).map((certification) => certification.code);
  }

  async has(ctx: SimulationContext, code: string): Promise<boolean> {
    return (await this.store.certifications(ctx)).some((certification) => certification.code === code);
  }

  /**
   * Idempotent: granting a held certification is a no-op, except scored exams keep the better score (IELTS retakes).
   * Returns true when something changed.
   */
  async grant(ctx: SimulationContext, code: string, source: string, score: number | null = null): Promise<boolean> {
    const normalised = code.trim().toLowerCase();
    if (!CODE_PATTERN.test(normalised)) return false;
    const existing = (await this.store.certifications(ctx)).find((certification) => certification.code === normalised);
    if (existing) {
      if (score === null || (existing.score !== null && existing.score >= score)) return false;
      existing.score = score;
      existing.grantedAt = ctx.time;
      await this.store.save(ctx, existing);
      return true;
    }
    await this.store.insert(
      ctx,
      EDUCATION_MEMO.certifications,
      ctx.manager.create(CertificationEntity, { characterId: ctx.character.id, code: normalised, score, source, grantedAt: ctx.time }),
    );
    return true;
  }
}
