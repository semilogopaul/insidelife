import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signUp = { mutate: vi.fn(), isPending: false, isError: false, error: null };
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../hooks/use-auth', () => ({ useSignIn: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }), useSignUp: () => signUp }));

import { AuthForm } from '../components/AuthForm';

function fillSignUp() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Passw0rd-1' } });
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1996' } });
}

describe('sign-up terms consent', () => {
  beforeEach(() => signUp.mutate.mockReset());

  it('links the Terms of Service and Privacy Policy', () => {
    render(<AuthForm mode="sign-up" />);
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
  });

  it('will not create the account until the box is ticked, then sends the acceptance', () => {
    render(<AuthForm mode="sign-up" />);
    fillSignUp();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(signUp.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Tick the box to agree to the Terms of Service and Privacy Policy.')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(signUp.mutate).toHaveBeenCalledWith(expect.objectContaining({ acceptTerms: true, email: 'ada@example.com' }));
  });

  it('shows no checkbox on sign-in', () => {
    render(<AuthForm mode="sign-in" />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
