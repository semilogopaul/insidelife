import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const digitsOnly = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.replace(/\D/g, '') : value);

export class AdminSignInDto {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  readonly email: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  @MaxLength(128)
  readonly password: string;
}

export class AdminMfaSetupDto {
  @IsString()
  @MaxLength(2048)
  readonly challengeToken: string;

  @Transform(digitsOnly)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  readonly code: string;
}

export class AdminMfaVerifyDto {
  @IsString()
  @MaxLength(2048)
  readonly challengeToken: string;

  /** The 6-digit authenticator code… */
  @IsOptional()
  @Transform(digitsOnly)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  readonly code?: string;

  /** …or one of the recovery codes. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(24)
  readonly recoveryCode?: string;
}

export class AdminCodeDto {
  @Transform(digitsOnly)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  readonly code: string;
}
