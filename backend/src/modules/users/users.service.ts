import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { OnboardingDto, WelcomeReaction } from '@insidelife/shared';
import { IsNull, type Repository } from 'typeorm';
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

  create(email: string, passwordHash: string, birthDate: string): Promise<UserEntity> {
    return this.users.save(
      this.users.create({ email: email.trim().toLowerCase(), passwordHash, birthDate, emailVerifiedAt: null }),
    );
  }

  /** Mark the email confirmed (idempotent: keeps the first confirmation time). */
  async markEmailVerified(id: string): Promise<void> {
    await this.users.update({ id, emailVerifiedAt: IsNull() }, { emailVerifiedAt: new Date() });
  }

  async touchLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  async onboarding(id: string): Promise<OnboardingDto> {
    const user = await this.findById(id);
    return { welcomeSeen: (user?.welcomeSeenAt ?? null) !== null, welcomeReaction: user?.welcomeReaction ?? null, featuredSeen: (user?.featuredSeenAt ?? null) !== null };
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
}
