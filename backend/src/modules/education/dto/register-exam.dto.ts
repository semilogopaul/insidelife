import { IsIn, IsOptional } from 'class-validator';
import { COURSES, EXAM_KINDS, INSTITUTIONS, type ExamKind, type RegisterExamRequest } from '@insidelife/shared';

export class RegisterExamDto implements RegisterExamRequest {
  @IsIn(EXAM_KINDS)
  readonly kind: ExamKind;

  @IsOptional()
  @IsIn(INSTITUTIONS.map((institution) => institution.id))
  readonly institutionId?: string;

  @IsOptional()
  @IsIn(COURSES.map((course) => course.id))
  readonly courseId?: string;
}
