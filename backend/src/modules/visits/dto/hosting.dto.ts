import { HOST_TREAT_IDS, type HostTreatId, type ServeTreatRequest } from '@insidelife/shared';
import { IsIn, IsString, Matches } from 'class-validator';

export class ServeTreatDto implements ServeTreatRequest {
  @IsIn(HOST_TREAT_IDS)
  readonly treatId: HostTreatId;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'idempotencyKey must be 8-64 letters, numbers, - or _' })
  readonly idempotencyKey: string;
}
