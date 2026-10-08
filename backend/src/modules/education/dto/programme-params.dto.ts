import { IsIn } from 'class-validator';
import { PROGRAMMES } from '@insidelife/shared';

/** Route params for `/education/programmes/:id/...`. */
export class ProgrammeParamsDto {
  @IsIn(PROGRAMMES.map((programme) => programme.id))
  readonly id: string;
}
