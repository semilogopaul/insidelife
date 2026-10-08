'use client';

import { ChevronDown, MapPin, MessageCircle, UserPlus, UsersRound } from 'lucide-react';
import { useDeferredValue, useState, type ReactNode } from 'react';
import type { FriendRequestDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Section, Spinner, TextField, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useGistNav } from '../../hooks/use-gist-nav';
import { useBlocked, useFriendActions, useFriends, usePlayerSearch } from '../../hooks/use-social';
import { PlayerAvatar } from '../PlayerAvatar';

const HANDLE = /^@?[A-Za-z0-9_]{3,20}$/;

/** Friend requests in and out, your friends (online, where they are if they share it), add by @handle, blocked list. */
export function FriendsTab({ myHandle }: { readonly myHandle: string }) {
  const friends = useFriends();
  const actions = useFriendActions();
  const openProfile = useGistNav((state) => state.openProfile);
  const openThread = useGistNav((state) => state.openThread);

  if (friends.isPending) {
    return (
      <div className="grid place-items-center py-16 text-text-soft">
        <Spinner />
      </div>
    );
  }
  if (friends.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-sm text-okada">{errorMessage(friends.error)}</p>
        <Button variant="paper" size="sm" onClick={() => void friends.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const { incoming, outgoing } = friends.data;
  const list = friends.data.friends.toSorted((a, b) => Number(b.online) - Number(a.online) || a.firstName.localeCompare(b.firstName));
  const fail = (title: string) => (error: unknown) => {
    gameEvents.emit('sfx', { id: 'ui-error' });
    toast({ title, body: errorMessage(error), tone: 'bad' });
  };

  return (
    <div className="flex flex-col gap-5">
      <AddFriend myHandle={myHandle} />

      {incoming.length > 0 && (
        <Section title="Want to be your friend" aside={`${incoming.length}`}>
          <ul className="flex flex-col gap-1.5">
            {incoming.map((request) => (
              <RequestRow key={request.id} request={request} onOpen={() => openProfile(request.player.handle)}>
                <Button
                  size="sm"
                  loading={actions.accept.isPending && actions.accept.variables === request.id}
                  onClick={() =>
                    actions.accept.mutate(request.id, {
                      onSuccess: () => {
                        gameEvents.emit('sfx', { id: 'ui-success' });
                        toast({ title: `You and ${request.player.firstName} are friends`, tone: 'good' });
                      },
                      onError: fail('Couldn’t accept that'),
                    })
                  }
                >
                  Accept
                </Button>
                <Button size="sm" variant="paper" onClick={() => actions.decline.mutate(request.id, { onError: fail('Couldn’t decline that') })}>
                  Decline
                </Button>
              </RequestRow>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Friends" aside={list.length > 0 ? `${list.filter((friend) => friend.online).length} online` : undefined}>
        {list.length === 0 ? (
          <EmptyState icon={UsersRound} title="No friends yet" body="Add people by @handle, or tap a name in chat. Man know man." />
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((friend) => (
              <li key={friend.id} className="flex items-center gap-2 rounded-card bg-paper-2 py-1 pl-1 pr-1.5">
                <button type="button" onClick={() => openProfile(friend.handle)} className="flex min-w-0 flex-1 items-center gap-3 rounded-card px-2 py-1.5 text-left hover:bg-paper-3">
                  <PlayerAvatar name={`${friend.firstName} ${friend.lastName}`} handle={friend.handle} online={friend.online} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">
                      {friend.firstName} {friend.lastName}
                    </span>
                    <span className="flex items-center gap-1 truncate text-xs text-text-soft">
                      {friend.locationLabel ? (
                        <>
                          <MapPin size={12} aria-hidden className="shrink-0" />
                          <span className="truncate">{friend.locationLabel}</span>
                        </>
                      ) : (
                        <span className="truncate">{friend.title ?? `@${friend.handle}`}</span>
                      )}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openThread({ id: friend.id, handle: friend.handle, name: `${friend.firstName} ${friend.lastName}` })}
                  aria-label={`Message ${friend.firstName}`}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-paper-3"
                >
                  <MessageCircle size={20} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {outgoing.length > 0 && (
        <Section title="Requests you sent" aside={`${outgoing.length} pending`}>
          <ul className="flex flex-col gap-1.5">
            {outgoing.map((request) => (
              <RequestRow key={request.id} request={request} onOpen={() => openProfile(request.player.handle)}>
                <Button size="sm" variant="paper" onClick={() => actions.decline.mutate(request.id, { onError: fail('Couldn’t cancel that') })}>
                  Cancel
                </Button>
              </RequestRow>
            ))}
          </ul>
        </Section>
      )}

      <BlockedList />
    </div>
  );
}

function RequestRow({ request, onOpen, children }: { readonly request: FriendRequestDto; readonly onOpen: () => void; readonly children: ReactNode }) {
  const name = `${request.player.firstName} ${request.player.lastName}`;
  return (
    <li className="flex items-center gap-2 rounded-card bg-paper-2 p-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <PlayerAvatar name={name} handle={request.player.handle} online={request.player.online} />
        <span className="min-w-0">
          <span className="block truncate font-bold">{name}</span>
          <span className="block truncate text-xs text-text-soft">
            @{request.player.handle} — {request.player.statusTier.label}
          </span>
        </span>
      </button>
      <span className="flex shrink-0 gap-1.5">{children}</span>
    </li>
  );
}

function AddFriend({ myHandle }: { readonly myHandle: string }) {
  const [value, setValue] = useState('');
  const query = useDeferredValue(value);
  const search = usePlayerSearch(query);
  const { request } = useFriendActions();
  const openProfile = useGistNav((state) => state.openProfile);
  const handle = value.trim().replace(/^@/, '');
  const valid = HANDLE.test(value.trim());

  const send = (target: string): void => {
    request.mutate(target, {
      onSuccess: (result) => {
        gameEvents.emit('sfx', { id: 'ui-success' });
        toast({ title: result.state === 'accepted' ? 'You’re now friends!' : `Request sent to @${target}`, tone: 'good' });
        setValue('');
      },
      onError: (error) => toast({ title: 'Couldn’t send that request', body: errorMessage(error), tone: 'bad' }),
    });
  };

  const results = (search.data?.items ?? []).filter((player) => player.handle !== myHandle).slice(0, 5);
  return (
    <section aria-label="Add a friend" className="flex flex-col gap-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) send(handle);
        }}
      >
        <TextField
          label="Add by @handle"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="@tolu_b"
          autoComplete="off"
          autoCapitalize="none"
          className="flex-1"
        />
        <Button type="submit" disabled={!valid} loading={request.isPending} icon={<UserPlus size={18} aria-hidden />} className="h-12">
          Add
        </Button>
      </form>
      {handle.length >= 2 && results.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-card bg-paper-2 p-1.5" aria-label="Matching players">
          {results.map((player) => (
            <li key={player.id}>
              <button type="button" onClick={() => openProfile(player.handle)} className="flex w-full items-center gap-2.5 rounded-chip px-2 py-1.5 text-left hover:bg-paper-3">
                <PlayerAvatar name={`${player.firstName} ${player.lastName}`} handle={player.handle} online={player.online} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {player.firstName} {player.lastName}
                  </span>
                  <span className="block truncate text-xs text-text-soft">@{player.handle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BlockedList() {
  const [open, setOpen] = useState(false);
  const blocked = useBlocked(open);
  const { unblock } = useFriendActions();
  return (
    <section>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-1 text-sm font-bold text-text-soft hover:text-text">
        <ChevronDown size={16} aria-hidden className={open ? 'rotate-180' : undefined} />
        Blocked players
      </button>
      {open && (
        <div className="mt-2">
          {blocked.isPending ? (
            <Spinner className="text-text-soft" />
          ) : (blocked.data ?? []).length === 0 ? (
            <p className="text-sm text-text-soft">You haven’t blocked anyone.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(blocked.data ?? []).map((player) => (
                <li key={player.characterId} className="flex items-center justify-between gap-2 rounded-card bg-paper-2 px-3 py-2">
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-bold">
                      {player.firstName} {player.lastName}
                    </span>{' '}
                    <span className="text-text-soft">@{player.handle}</span>
                  </span>
                  <Button size="sm" variant="paper" loading={unblock.isPending && unblock.variables === player.characterId} onClick={() => unblock.mutate(player.characterId)}>
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
