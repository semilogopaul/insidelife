import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountDeletionDto } from '@insidelife/shared';
import { DeleteAccount } from '../components/DeleteAccount';

const deletion = {
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
  data: undefined as AccountDeletionDto | undefined,
};
vi.mock('../hooks/use-me', () => ({ useDeleteAccount: () => deletion }));

beforeAll(() => {
  // motion's reduced-motion hook reads matchMedia, which jsdom doesn't ship.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  deletion.mutate.mockReset();
  deletion.data = undefined;
});

describe('DeleteAccount', () => {
  it('explains what happens and only deletes with the phrase and a password', () => {
    render(<DeleteAccount />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByText(/signed out on every device/)).toBeTruthy();
    expect(screen.getByText(/Real money you paid isn’t refunded by deleting/)).toBeTruthy();

    const submit = () => screen.getAllByRole('button', { name: 'Delete my account' }).at(-1) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'Jollof-rice-42' } });
    fireEvent.change(screen.getByLabelText('Type DELETE MY ACCOUNT to confirm'), { target: { value: 'delete account' } });
    expect(submit().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Type DELETE MY ACCOUNT to confirm'), { target: { value: ' delete my account ' } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    expect(deletion.mutate).toHaveBeenCalledWith({ password: 'Jollof-rice-42', confirmation: ' delete my account ' });
  });

  it('afterwards says how to get the account back and until when', () => {
    deletion.data = { deletedAt: '2026-10-09T12:00:00.000Z', restorableUntil: '2026-11-08T12:00:00.000Z' };
    render(<DeleteAccount />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByRole('dialog', { name: 'Your account is deleted' })).toBeTruthy();
    expect(screen.getByText('8 November 2026')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'hello@insidelife.online' }).getAttribute('href')).toBe('mailto:hello@insidelife.online');
  });
});
