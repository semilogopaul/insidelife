import type { Type } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AviationModule } from './aviation/aviation.module.js';
import { BettingModule } from './betting/betting.module.js';
import { BusinessesModule } from './businesses/businesses.module.js';
import { CareersModule } from './careers/careers.module.js';
import { DecorModule } from './decor/decor.module.js';
import { EducationModule } from './education/education.module.js';
import { EventsModule } from './events/events.module.js';
import { FamilyModule } from './family/family.module.js';
import { HealthModule } from './health/health.module.js';
import { HousingModule } from './housing/housing.module.js';
import { InvestmentsModule } from './investments/investments.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ProgressionModule } from './progression/progression.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import { RacesModule } from './races/races.module.js';
import { ShopModule } from './shop/shop.module.js';
import { SocialModule } from './social/social.module.js';
import { TravelModule } from './travel/travel.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { VisitsModule } from './visits/visits.module.js';
import { WalletModule } from './wallet/wallet.module.js';

/**
 * Gameplay domain modules. Each registers its simulation system (and life-event cards) on startup.
 * Listed here so domain work never has to touch app.module.ts. Also the account lifecycle, the audit log (global) and
 * the admin API, which sits on top of everything else.
 */
export const DOMAIN_MODULES: Type[] = [
  AuditModule,
  EventsModule,
  EducationModule,
  CareersModule,
  BusinessesModule,
  ShopModule,
  HousingModule,
  DecorModule,
  VehiclesModule,
  AviationModule,
  HealthModule,
  FamilyModule,
  WalletModule,
  PaymentsModule,
  InvestmentsModule,
  SocialModule,
  VisitsModule,
  TravelModule,
  RacesModule,
  PromotionsModule,
  BettingModule,
  ProgressionModule,
  AccountsModule,
  AdminModule,
];
