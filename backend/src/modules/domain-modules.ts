import type { Type } from '@nestjs/common';
import { BusinessesModule } from './businesses/businesses.module.js';
import { CareersModule } from './careers/careers.module.js';
import { EducationModule } from './education/education.module.js';
import { EventsModule } from './events/events.module.js';
import { FamilyModule } from './family/family.module.js';
import { HealthModule } from './health/health.module.js';
import { HousingModule } from './housing/housing.module.js';
import { InvestmentsModule } from './investments/investments.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ProgressionModule } from './progression/progression.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import { ShopModule } from './shop/shop.module.js';
import { SocialModule } from './social/social.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { WalletModule } from './wallet/wallet.module.js';

/**
 * Gameplay domain modules. Each registers its simulation system (and life-event cards) on startup.
 * Listed here so domain work never has to touch app.module.ts.
 */
export const DOMAIN_MODULES: Type[] = [
  EventsModule,
  EducationModule,
  CareersModule,
  BusinessesModule,
  ShopModule,
  HousingModule,
  VehiclesModule,
  HealthModule,
  FamilyModule,
  WalletModule,
  PaymentsModule,
  InvestmentsModule,
  SocialModule,
  PromotionsModule,
  ProgressionModule,
];
