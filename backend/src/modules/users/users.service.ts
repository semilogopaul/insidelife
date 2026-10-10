import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { OnboardingDto, TourOutcome, WelcomeReaction } from '@insidelife/shared';
import { IsNull, type EntityManager, type Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  /** A new account; `termsVersion` is the Terms of Service and Privacy Policy version the player agreed to just now. */
  create(email: string, passwordHash: string, birthDate: string, termsVersion: string): Promise<UserEntity> {
    return this.users.save(
      this.users.create({ email: email.trim().toLowerCase(), passwordHash, birthDate, emailVerifiedAt: null, termsAcceptedAt: new Date(), termsVersion }),
    );
  }

  /** Mark the email confirmed (idempotent: keeps the first confirmation time). */
  async markEmailVerified(id: string): Promise<void> {
    await this.users.update({ id, emailVerifiedAt: IsNull() }, { emailVerifiedAt: new Date() });
  }

  /** The account's real date of birth (`YYYY-MM-DD`), or null on accounts made before it was asked. */
  async birthDate(id: string, manager?: EntityManager): Promise<string | null> {
    const repository = manager ? manager.getRepository(UserEntity) : this.users;
    const user = await repository.findOne({ where: { id }, select: { id: true, birthDate: true } });
    return user?.birthDate ?? null;
  }

  /** Record a date of birth on an account that has none. Once set it can't be changed here; false when one existed. */
  async confirmBirthDate(id: string, birthDate: string, manager?: EntityManager): Promise<boolean> {
    const repository = manager ? manager.getRepository(UserEntity) : this.users;
    const result = await repository.update({ id, birthDate: IsNull() }, { birthDate });
    return (result.affected ?? 0) > 0;
  }

  async touchLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  async onboarding(id: string): Promise<OnboardingDto> {
    const user = await this.findById(id);
    return {
      welcomeSeen: (user?.welcomeSeenAt ?? null) !== null,
      welcomeReaction: user?.welcomeReaction ?? null,
      featuredSeen: (user?.featuredSeenAt ?? null) !== null,
      tourOutcome: user?.tourCompletedAt ? (user.tourSkipped ? 'skipped' : 'completed') : null,
    };
  }

  /** Records the first answer to the welcome note; later answers (another tab or device) change nothing. */
  async answerWelcome(id: string, reaction: WelcomeReaction): Promise<OnboardingDto> {
    await this.users.update({ id, welcomeSeenAt: IsNull() }, { welcomeSeenAt: new Date(), welcomeReaction: reaction });
    return this.onboarding(id);
  }

  async markFeaturedSeen(id: string): Promise<OnboardingDto> {
    await this.users.update({ id, featuredSeenAt: IsNull() }, { featuredSeenAt: new Date() });
    return this.onboarding(id);
  }

  /** Records how the walkthrough ended; the first outcome sticks (another tab or device changes nothing). */
  async markTourDone(id: string, outcome: TourOutcome): Promise<OnboardingDto> {
    await this.users.update({ id, tourCompletedAt: IsNull() }, { tourCompletedAt: new Date(), tourSkipped: outcome === 'skipped' });
    return this.onboarding(id);
  }
}
