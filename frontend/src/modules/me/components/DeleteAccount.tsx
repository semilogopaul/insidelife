'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ACCOUNT_DELETION_PHRASE, ACCOUNT_RESTORE_WINDOW_DAYS, isAccountDeletionPhrase } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Sheet, TextField } from '@/common/components';
import { useDeleteAccount } from '../hooks/use-me';

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Me → Settings → Delete my account. Explains what happens, then asks for the confirmation phrase and the password.
 * The server soft-deletes the account (support can restore it for a while) and ends every session.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const deletion = useDeleteAccount();
  const done = deletion.data;
  const ready = isAccountDeletionPhrase(phrase) && password.length > 0;

  const close = (): void => {
    if (done) {
      window.location.replace('/');
      return;
    }
    if (deletion.isPending) return;
    setOpen(false);
    setPhrase('');
    setPassword('');
    deletion.reset();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-soft">
        Delete your account and leave Lagos. You can ask us to bring it back within {ACCOUNT_RESTORE_WINDOW_DAYS} days.
      </p>
      <Button variant="paper" icon={<Trash2 size={18} aria-hidden />} onClick={() => setOpen(true)} className="text-okada">
        Delete my account
      </Button>

      <Sheet
        open={open}
        onClose={close}
        title={done ? 'Your account is deleted' : 'Delete your account?'}
        description={done ? undefined : 'Read this first. It affects everything you own in the game.'}
        size="sm"
      >
        {done ? (
          <div className="flex flex-col gap-4 pb-1">
            <p>
              You’ve been signed out everywhere. If you change your mind, email{' '}
              <a className="font-bold underline underline-offset-4" href="mailto:hello@insidelife.online">
                hello@insidelife.online
              </a>{' '}
              from this address before <strong>{dateFormat.format(new Date(done.restorableUntil))}</strong>.
            </p>
            <Button variant="ink" size="lg" block onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4 pb-1"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (ready && !deletion.isPending) deletion.mutate({ password, confirmation: phrase });
            }}
          >
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              <li>You’re signed out on every device and can’t sign in again.</li>
              <li>Your character disappears from Lagos: nobody can find, message, visit or send money to you.</li>
              <li>
                For {ACCOUNT_RESTORE_WINDOW_DAYS} days your email and @handle stay reserved and support can restore
                everything. After that your email, password, date of birth, names and handle are erased for good.
              </li>
              <li>
                Real money you paid isn’t refunded by deleting. Records of payments and in-game transactions are kept, as
                the law requires, without your personal details.
              </li>
            </ul>
            <TextField
              label={`Type ${ACCOUNT_DELETION_PHRASE} to confirm`}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <TextField
              label="Your password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            {deletion.isError && (
              <p role="alert" className="rounded-card bg-okada-soft px-3 py-2 text-sm font-bold text-okada">
                {errorMessage(deletion.error)}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button type="submit" variant="danger" size="lg" block loading={deletion.isPending} disabled={!ready}>
                Delete my account
              </Button>
              <Button variant="paper" block onClick={close} disabled={deletion.isPending}>
                Keep my account
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
