import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RegisterDto } from './credentials.dto.js';

const VALID = { email: 'ada@example.com', password: 'Passw0rd-1', birthDate: '1999-01-01', acceptTerms: true };

async function problems(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(RegisterDto, body));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('RegisterDto terms acceptance', () => {
  it('accepts a sign-up that ticked the terms', async () => {
    expect(await problems(VALID)).toEqual([]);
  });

  it.each([undefined, false, 'true', 1])('refuses acceptTerms = %s', async (acceptTerms) => {
    expect(await problems({ ...VALID, acceptTerms })).toEqual(['Tick the box to agree to the Terms of Service and Privacy Policy']);
  });
});
