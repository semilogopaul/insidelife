import { IsIn } from 'class-validator';
import { COURSES, INSTITUTIONS, type ApplyForAdmissionRequest } from '@insidelife/shared';

export class ApplyForAdmissionDto implements ApplyForAdmissionRequest {
  @IsIn(INSTITUTIONS.map((institution) => institution.id))
  readonly institutionId: string;

  @IsIn(COURSES.map((course) => course.id))
  readonly courseId: string;
}
