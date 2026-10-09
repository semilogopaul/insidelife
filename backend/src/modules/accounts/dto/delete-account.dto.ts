import { IsString, MaxLength, MinLength } from 'class-validator';
import type { DeleteAccountRequest } from '@insidelife/shared';

export class DeleteAccountDto implements DeleteAccountRequest {
  @IsString({ message: 'Enter your password' })
  @MinLength(1, { message: 'Enter your password' })
  @MaxLength(128)
  readonly password: string;

  @IsString()
  @MaxLength(40)
  readonly confirmation: string;
}
