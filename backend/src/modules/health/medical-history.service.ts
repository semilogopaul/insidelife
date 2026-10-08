import { Injectable } from '@nestjs/common';
import type { MedicalRecordKind } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { MedicalRecordEntity } from './entities/medical-record.entity.js';

export interface MedicalRecordDraft {
  readonly kind: MedicalRecordKind;
  readonly summary: string;
  readonly conditionId?: string | null;
  readonly cost?: number;
  readonly venueId?: string | null;
}

/** Append-only medical history (what the Health app shows under "History"). */
@Injectable()
export class MedicalHistoryService {
  async record(ctx: SimulationContext, draft: MedicalRecordDraft): Promise<void> {
    await ctx.manager.insert(MedicalRecordEntity, {
      characterId: ctx.character.id,
      kind: draft.kind,
      conditionId: draft.conditionId ?? null,
      summary: draft.summary.slice(0, 240),
      cost: Math.max(0, Math.round(draft.cost ?? 0)),
      venueId: draft.venueId ?? null,
      gameMinute: ctx.time,
    });
  }

  async recent(ctx: SimulationContext, limit: number): Promise<MedicalRecordEntity[]> {
    return ctx.manager.find(MedicalRecordEntity, {
      where: { characterId: ctx.character.id },
      order: { gameMinute: 'DESC', createdAt: 'DESC' },
      take: limit,
    });
  }
}
