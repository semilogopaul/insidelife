import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMPLOYMENT_PORT } from '../../common/ports/employment.port.js';
import { EducationModule } from '../education/education.module.js';
import { EventsModule } from '../events/events.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { ApplicationsService } from './applications.service.js';
import { AttendanceService } from './attendance.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { CareerEventsRegistrar } from './career-events.registrar.js';
import { CareerStore } from './career.store.js';
import { CareersSystem } from './careers.system.js';
import { EmploymentPortService } from './employment-port.service.js';
import { EmploymentViewService } from './employment-view.service.js';
import { EmploymentController } from './employment.controller.js';
import { EmploymentService } from './employment.service.js';
import { EmploymentHistoryEntity } from './entities/employment-history.entity.js';
import { EmploymentEntity } from './entities/employment.entity.js';
import { JobApplicationEntity } from './entities/job-application.entity.js';
import { FreelanceService } from './freelance.service.js';
import { IncomeSourcesRegistry } from './income-sources.registry.js';
import { JobBoardService } from './job-board.service.js';
import { JobsController } from './jobs.controller.js';
import { PayrollService } from './payroll.service.js';
import { PromotionsService } from './promotions.service.js';

/**
 * Careers: the job board, applications, employment (routine, attendance, payroll, promotions, leave), freelance
 * gigs and career life events. Implements `EMPLOYMENT_PORT`; consumes `CREDENTIALS_PORT` and `INVENTORY_PORT`.
 * Higher domains add recurring income through `IncomeSourcesRegistry`.
 */
@Module({
  imports: [
    SimulationModule,
    EventsModule,
    EducationModule,
    ShopModule,
    TypeOrmModule.forFeature([EmploymentEntity, EmploymentHistoryEntity, JobApplicationEntity]),
  ],
  controllers: [JobsController, EmploymentController],
  providers: [
    CareerStore,
    CandidateProfileService,
    PayrollService,
    EmploymentService,
    PromotionsService,
    AttendanceService,
    ApplicationsService,
    FreelanceService,
    EmploymentViewService,
    JobBoardService,
    IncomeSourcesRegistry,
    EmploymentPortService,
    CareersSystem,
    CareerEventsRegistrar,
    { provide: EMPLOYMENT_PORT, useExisting: EmploymentPortService },
  ],
  exports: [EMPLOYMENT_PORT, IncomeSourcesRegistry],
})
export class CareersModule {}
