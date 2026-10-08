import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { LoginRequest, RegisterRequest } from '@insidelife/shared';

const normaliseEmail = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);

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
}

export class LoginDto implements LoginRequest {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  readonly email: string;

  @IsString()
  @MaxLength(128)
  readonly password: string;
}
