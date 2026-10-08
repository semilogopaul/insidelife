import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareersModule } from '../careers/careers.module.js';
import { EducationModule } from '../education/education.module.js';
import { FamilyModule } from '../family/family.module.js';
import { HealthModule } from '../health/health.module.js';
import { HousingModule } from '../housing/housing.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { AchievementUnlockEntity } from './entities/achievement-unlock.entity.js';
import { DailyWelcomeClaimEntity } from './entities/daily-welcome-claim.entity.js';
import { LifeGoalProgressEntity } from './entities/life-goal-progress.entity.js';
import { MilestoneMomentEntity } from './entities/milestone-moment.entity.js';
import { ProgressionCounterEntity } from './entities/progression-counter.entity.js';
import { ProgressionProfileEntity } from './entities/progression-profile.entity.js';
import { ProgressionController } from './progression.controller.js';
import { ProgressionService } from './progression.service.js';
import { ProgressionSystem } from './progression.system.js';
import { AchievementsService } from './services/achievements.service.js';
import { DailyWelcomeClaimStore } from './services/daily-welcome-claims.store.js';
import { DailyWelcomeService } from './services/daily-welcome.service.js';
import { FactsService } from './services/facts.service.js';
import { GoalsService } from './services/goals.service.js';
import { MilestonesService } from './services/milestones.service.js';
import { ProfilesService } from './services/profiles.service.js';
import { RewardsService } from './services/rewards.service.js';
import { SuggestionsService } from './services/suggestions.service.js';
import { ProgressionCountersModule } from './signals/progression-counters.module.js';

/**
 * Progression: Life Goals (chapters of guided quests), achievements, milestone moments, the daily welcome and HUD
 * suggestions. Reads other domains only through their ports; nobody imports this module (other domains report
 * signals through the global `PROGRESSION_SIGNALS_PORT`).
 */
@Module({
  imports: [
    SimulationModule,
    EducationModule,
    CareersModule,
    ShopModule,
    HousingModule,
    FamilyModule,
    HealthModule,
    ProgressionCountersModule,
    TypeOrmModule.forFeature([
      ProgressionProfileEntity,
      LifeGoalProgressEntity,
      AchievementUnlockEntity,
      ProgressionCounterEntity,
      MilestoneMomentEntity,
      DailyWelcomeClaimEntity,
    ]),
  ],
  controllers: [ProgressionController],
  providers: [
    ProfilesService,
    FactsService,
    MilestonesService,
    RewardsService,
    GoalsService,
    AchievementsService,
    DailyWelcomeClaimStore,
    DailyWelcomeService,
    SuggestionsService,
    ProgressionSystem,
    ProgressionService,
  ],
  exports: [],
})
export class ProgressionModule {}
