'use client';

import { AtSign, Search, UserX } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '@/common/api/api-error';
import { Button, Spinner } from '@/common/components';
import { usePlayerSearch, useRecipient } from '../../hooks/use-recipient';
import { isValidHandle, normaliseHandle } from '../../services/handles';
import { Monogram, RecipientCard } from './RecipientCard';

export interface RecipientStepProps {
  /** Handle already chosen (coming back from the amount step). */
  readonly initialHandle: string | null;
  readonly onConfirm: (handle: string) => void;
  readonly onSavings: () => void;
}

/** Type a name or @handle → pick from suggestions → confirm the recipient card. */
export function RecipientStep({ initialHandle, onConfirm, onSavings }: RecipientStepProps) {
  const [input, setInput] = useState(initialHandle ? `@${initialHandle}` : '');
  const [chosen, setChosen] = useState<string | null>(initialHandle);
  const search = usePlayerSearch(chosen ? '' : input);
  const recipient = useRecipient(chosen);
  const listId = useId();
  const handle = normaliseHandle(input);

  const choose = (event?: FormEvent): void => {
    event?.preventDefault();
    if (isValidHandle(handle)) setChosen(handle);
  };

  if (chosen) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-soft">Check this is the right person. Money sent to the wrong handle can’t be pulled back.</p>
        {recipient.isPending ? (
          <div className="grid h-24 place-items-center rounded-sheet bg-paper-2 text-text-soft">
            <Spinner />
          </div>
        ) : recipient.isError ? (
          <NotFound handle={chosen} error={recipient.error} onRetry={() => void recipient.refetch()} />
        ) : recipient.data ? (
          <>
            <RecipientCard person={recipient.data} />
            {recipient.data.relationship === 'self' ? (
              <Blocker text="That’s you! To put money aside, use Savings instead." action={{ label: 'Go to Savings', onClick: onSavings }} />
            ) : recipient.data.blockedByYou ? (
              <Blocker text={`You blocked @${recipient.data.handle}. Unblock them in Gist before sending money.`} />
            ) : (
              <Button size="lg" block onClick={() => onConfirm(recipient.data.handle)}>
                Pay {recipient.data.firstName}
              </Button>
            )}
          </>
        ) : null}
        <Button variant="paper" block onClick={() => setChosen(null)}>
          Choose someone else
        </Button>
      </div>
    );
  }

  const suggestions = search.data?.items ?? [];
  return (
    <form onSubmit={choose} className="flex flex-col gap-3" role="search" aria-label="Find who to pay">
      <label htmlFor={`${listId}-input`} className="text-sm font-bold">
        Who are you paying?
      </label>
      <div className="flex h-13 items-center gap-2 rounded-card bg-paper-2 px-3.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink">
        <AtSign size={18} aria-hidden className="shrink-0 text-text-soft" />
        <input
          id={`${listId}-input`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="handle or name"
          aria-describedby={`${listId}-hint`}
          className="h-full min-w-0 flex-1 bg-transparent text-[1.05rem] font-bold placeholder:font-normal placeholder:text-text-faint focus:outline-none"
        />
        {search.isFetching && <Spinner size={16} className="text-text-faint" />}
      </div>
      <p id={`${listId}-hint`} className="text-xs text-text-soft">
        Handles are 3–20 letters, numbers or _. You’ll see who it is before you type an amount.
      </p>

      {suggestions.length > 0 && (
        <ul aria-label="Matching players" className="flex flex-col gap-1">
          {suggestions.slice(0, 6).map((player) => (
            <li key={player.id}>
              <button type="button" onClick={() => setChosen(player.handle)} className="flex w-full items-center gap-3 rounded-card px-2 py-2 text-left hover:bg-paper-2">
                <Monogram person={player} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {player.firstName} {player.lastName}
                  </span>
                  <span className="block truncate text-xs text-text-soft">
                    @{player.handle} · {player.statusTier.label}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {handle.length >= 2 && !search.isFetching && search.isSuccess && suggestions.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-text-soft">
          <Search size={16} aria-hidden /> No one matches “{input.trim()}” yet.
        </p>
      )}
      <Button type="submit" size="lg" block disabled={!isValidHandle(handle)}>
        {isValidHandle(handle) ? `Continue with @${handle}` : 'Continue'}
      </Button>
    </form>
  );
}

function NotFound({ handle, error, onRetry }: { readonly handle: string; readonly error: unknown; readonly onRetry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <div className="flex items-start gap-3 rounded-sheet bg-okada-soft p-4">
      <UserX size={22} aria-hidden className="mt-0.5 shrink-0 text-okada" />
      <div className="min-w-0">
        <p className="font-bold text-okada">{missing ? `No player called @${handle}` : 'Couldn’t check that handle'}</p>
        <p className="mt-0.5 text-sm text-text-soft">{missing ? 'Check the spelling, or search by their name.' : errorMessage(error)}</p>
        {!missing && (
          <Button variant="paper" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

function Blocker({ text, action }: { readonly text: string; readonly action?: { readonly label: string; readonly onClick: () => void } }) {
  return (
    <div role="status" className="rounded-card bg-danfo-soft p-3.5 text-sm">
      <p>{text}</p>
      {action && (
        <Button variant="ink" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
