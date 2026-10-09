import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { ConfirmEmailRequest, LoginRequest, RegisterRequest } from '@insidelife/shared';

const normaliseEmail = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);
/** Codes get pasted with spaces or dashes ("123 456"): keep the digits only. */
const digitsOnly = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.replace(/\D/g, '') : value);

export class RegisterDto implements RegisterRequest {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  readonly email: string;

  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters for your password' })
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Your password needs at least one letter and one number' })
  readonly password: string;

  /** Shape only here; AuthService applies the age rules (a real date, 13 or older) with the shared `birthDateProblem`. */
  @IsString({ message: 'Enter your date of birth' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter your date of birth' })
  readonly birthDate: string;
}

export class LoginDto implements LoginRequest {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  readonly email: string;

  @IsString()
  @MaxLength(128)
  readonly password: string;
}

export class ConfirmEmailDto implements ConfirmEmailRequest {
  @Transform(digitsOnly)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email' })
  readonly code: string;
}
