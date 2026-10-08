import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HEALTH_PORT } from '../../common/ports/health.port.js';
import { EventsModule } from '../events/events.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { AdmissionsService } from './admissions.service.js';
import { ConditionsService } from './conditions.service.js';
import { HealthConditionEntity } from './entities/health-condition.entity.js';
import { HealthProfileEntity } from './entities/health-profile.entity.js';
import { HmoMembershipEntity } from './entities/hmo-membership.entity.js';
import { HospitalAdmissionEntity } from './entities/hospital-admission.entity.js';
import { MedicalRecordEntity } from './entities/medical-record.entity.js';
import { PregnancyEntity } from './entities/pregnancy.entity.js';
import { HealthProfileService } from './health-profile.service.js';
import { HealthController } from './health.controller.js';
import { HealthEvents } from './health.events.js';
import { HealthService } from './health.service.js';
import { HealthSystem } from './health.system.js';
import { InsuranceService } from './insurance.service.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { MortalityService } from './mortality.service.js';
import { PregnancyService } from './pregnancy.service.js';
import { TreatmentService } from './treatment.service.js';

/**
 * Health domain: conditions, treatment, HMO plans, pregnancy and childbirth, ageing and death.
 *
 * Uses INVENTORY_PORT (ShopModule) for mosquito nets. FAMILY_PORT (births) is resolved lazily inside PregnancyService
 * because FamilyModule sits above health in the dependency order and imports this module for `conceive`.
 */
@Module({
  imports: [
    SimulationModule,
    EventsModule,
    ShopModule,
    TypeOrmModule.forFeature([
      HealthConditionEntity,
      HealthProfileEntity,
      HmoMembershipEntity,
      HospitalAdmissionEntity,
      MedicalRecordEntity,
      PregnancyEntity,
    ]),
  ],
  controllers: [HealthController],
  providers: [
    MedicalHistoryService,
    HealthProfileService,
    ConditionsService,
    InsuranceService,
    AdmissionsService,
    PregnancyService,
    TreatmentService,
    MortalityService,
    HealthSystem,
    HealthEvents,
    HealthService,
    { provide: HEALTH_PORT, useExisting: HealthService },
  ],
  exports: [HealthService, HEALTH_PORT],
})
export class HealthModule {}
