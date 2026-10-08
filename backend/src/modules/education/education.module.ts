import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CREDENTIALS_PORT } from '../../common/ports/credentials.port.js';
import { EventsModule } from '../events/events.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { EducationController } from './education.controller.js';
import { EducationService } from './education.service.js';
import { EducationSystem } from './education.system.js';
import { AdmissionApplicationEntity } from './entities/admission-application.entity.js';
import { CertificationEntity } from './entities/certification.entity.js';
import { EnrolmentEntity } from './entities/enrolment.entity.js';
import { ExamRegistrationEntity } from './entities/exam-registration.entity.js';
import { NyscServiceEntity } from './entities/nysc-service.entity.js';
import { ProgrammeEnrolmentEntity } from './entities/programme-enrolment.entity.js';
import { WaecResultEntity } from './entities/waec-result.entity.js';
import { AdmissionsService } from './services/admissions.service.js';
import { CertificationsService } from './services/certifications.service.js';
import { EducationStore } from './services/education-store.service.js';
import { EnrolmentService } from './services/enrolment.service.js';
import { NyscService } from './services/nysc.service.js';
import { EducationOverviewService } from './services/overview.service.js';
import { ProgrammesService } from './services/programmes.service.js';
import { WaecJambService } from './services/waec-jamb.service.js';

/**
 * Education: WAEC → JAMB → admission → university/polytechnic → NYSC → professional programmes.
 * Exposes `CREDENTIALS_PORT` (implemented by `EducationService`) for careers, vehicles and other domains.
 */
@Module({
  imports: [
    SimulationModule,
    EventsModule,
    TypeOrmModule.forFeature([
      WaecResultEntity,
      ExamRegistrationEntity,
      AdmissionApplicationEntity,
      EnrolmentEntity,
      NyscServiceEntity,
      CertificationEntity,
      ProgrammeEnrolmentEntity,
    ]),
  ],
  controllers: [EducationController],
  providers: [
    EducationStore,
    WaecJambService,
    CertificationsService,
    EnrolmentService,
    AdmissionsService,
    NyscService,
    ProgrammesService,
    EducationOverviewService,
    EducationSystem,
    EducationService,
    { provide: CREDENTIALS_PORT, useExisting: EducationService },
  ],
  exports: [EducationService, CREDENTIALS_PORT],
})
export class EducationModule {}
