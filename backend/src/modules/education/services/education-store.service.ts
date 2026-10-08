import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { AdmissionApplicationEntity } from '../entities/admission-application.entity.js';
import { CertificationEntity } from '../entities/certification.entity.js';
import { EnrolmentEntity } from '../entities/enrolment.entity.js';
import { ExamRegistrationEntity } from '../entities/exam-registration.entity.js';
import { NyscServiceEntity } from '../entities/nysc-service.entity.js';
import { ProgrammeEnrolmentEntity } from '../entities/programme-enrolment.entity.js';
import { WaecResultEntity } from '../entities/waec-result.entity.js';

/** Memo keys for education state inside one character transaction (`ctx.invalidate('education')` drops them all). */
export const EDUCATION_MEMO = {
  root: 'education',
  waec: 'education:waec',
  exams: 'education:exams',
  applications: 'education:applications',
  enrolments: 'education:enrolments',
  nysc: 'education:nysc',
  certifications: 'education:certifications',
  programmes: 'education:programmes',
} as const;

type MemoKey = (typeof EDUCATION_MEMO)[keyof typeof EDUCATION_MEMO];

/** Statuses of a degree enrolment that still belongs to the student (not finished, not abandoned). */
export const CURRENT_ENROLMENT_STATUSES = ['admitted', 'active', 'suspended'] as const;

/**
 * Loads a character's education records once per transaction (memoised on the simulation context) and writes them
 * back. Entities are shared by reference, so in-place updates followed by `save` keep the memo consistent; inserts
 * drop the memo so the next read sees the new row.
 */
@Injectable()
export class EducationStore {
  waecResults(ctx: SimulationContext): Promise<WaecResultEntity[]> {
    return ctx.memo(EDUCATION_MEMO.waec, () =>
      ctx.manager.find(WaecResultEntity, { where: { characterId: ctx.character.id }, order: { sitting: 'ASC' } }),
    );
  }

  exams(ctx: SimulationContext): Promise<ExamRegistrationEntity[]> {
    return ctx.memo(EDUCATION_MEMO.exams, () =>
      ctx.manager.find(ExamRegistrationEntity, { where: { characterId: ctx.character.id }, order: { registeredAt: 'ASC' } }),
    );
  }

  applications(ctx: SimulationContext): Promise<AdmissionApplicationEntity[]> {
    return ctx.memo(EDUCATION_MEMO.applications, () =>
      ctx.manager.find(AdmissionApplicationEntity, { where: { characterId: ctx.character.id }, order: { appliedAt: 'ASC' } }),
    );
  }

  enrolments(ctx: SimulationContext): Promise<EnrolmentEntity[]> {
    return ctx.memo(EDUCATION_MEMO.enrolments, () =>
      ctx.manager.find(EnrolmentEntity, { where: { characterId: ctx.character.id }, order: { startsAt: 'ASC' } }),
    );
  }

  /** The degree programme the character is admitted to, studying in, or suspended from. */
  async currentEnrolment(ctx: SimulationContext): Promise<EnrolmentEntity | null> {
    const enrolments = await this.enrolments(ctx);
    return enrolments.find((enrolment) => (CURRENT_ENROLMENT_STATUSES as readonly string[]).includes(enrolment.status)) ?? null;
  }

  /** Completed qualifications, oldest first. */
  async graduated(ctx: SimulationContext): Promise<EnrolmentEntity[]> {
    return (await this.enrolments(ctx)).filter((enrolment) => enrolment.status === 'graduated');
  }

  nysc(ctx: SimulationContext): Promise<NyscServiceEntity | null> {
    return ctx.memo(EDUCATION_MEMO.nysc, () => ctx.manager.findOne(NyscServiceEntity, { where: { characterId: ctx.character.id } }));
  }

  certifications(ctx: SimulationContext): Promise<CertificationEntity[]> {
    return ctx.memo(EDUCATION_MEMO.certifications, () =>
      ctx.manager.find(CertificationEntity, { where: { characterId: ctx.character.id }, order: { grantedAt: 'ASC' } }),
    );
  }

  programmes(ctx: SimulationContext): Promise<ProgrammeEnrolmentEntity[]> {
    return ctx.memo(EDUCATION_MEMO.programmes, () =>
      ctx.manager.find(ProgrammeEnrolmentEntity, { where: { characterId: ctx.character.id }, order: { startedAt: 'ASC' } }),
    );
  }

  async activeProgrammes(ctx: SimulationContext): Promise<ProgrammeEnrolmentEntity[]> {
    return (await this.programmes(ctx)).filter((programme) => programme.status === 'active');
  }

  /** Insert a new row and drop the memoised list it belongs to. */
  async insert<T extends object>(ctx: SimulationContext, key: MemoKey, entity: T): Promise<T> {
    const saved = await ctx.manager.save(entity);
    ctx.invalidate(key);
    return saved;
  }

  /** Persist in-place changes to memoised rows. */
  async save<T extends object>(ctx: SimulationContext, ...entities: readonly T[]): Promise<void> {
    if (entities.length > 0) await ctx.manager.save([...entities]);
  }

  /** Mark applications other than `keepId` as declined once an offer is accepted. */
  async declineOthers(ctx: SimulationContext, keepId: string): Promise<void> {
    const open = (await this.applications(ctx)).filter((application) => application.id !== keepId && ['screening', 'offered'].includes(application.status));
    for (const application of open) application.status = 'declined';
    if (open.length > 0) {
      await ctx.manager.update(AdmissionApplicationEntity, { id: In(open.map((application) => application.id)) }, { status: 'declined' });
    }
  }
}
