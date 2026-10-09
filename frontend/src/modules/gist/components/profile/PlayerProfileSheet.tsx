'use client';

import { Ban, Banknote, Check, Flag, GraduationCap, Heart, HeartHandshake, House, MapPin, MessageCircle, UserCheck, UserPlus, Users, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { RING_LIMITS, formatNaira, type PlayerProfileDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, HoldButton, Sheet, Spinner, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useVisitActions } from '@/common/visits';
import { useGistNav } from '../../hooks/use-gist-nav';
import { useFriendActions, usePlayerProfile, usePropose, useRelationships } from '../../hooks/use-social';
import { PlayerAvatar } from '../PlayerAvatar';
import { ReportForm } from './ReportForm';

type View = 'profile' | 'report' | 'block' | 'propose';

/** A player's public profile with everything you can do with them: friend, DM, send money, date, block, report. */
export function PlayerProfileSheet() {
  const handle = useGistNav((state) => state.profileHandle);
  const close = useGistNav((state) => state.closeProfile);
  const profile = usePlayerProfile(handle);
  const [view, setView] = useState<View>('profile');
  const data = profile.data;

  const onClose = (): void => {
    setView('profile');
    close();
  };

  return (
    <Sheet
      open={handle !== null}
      onClose={onClose}
      title={data ? `${data.firstName} ${data.lastName}` : handle ? `@${handle}` : ''}
      description={data ? `@${data.handle}` : undefined}
      size="md"
    >
      {profile.isPending && (
        <div className="grid place-items-center py-12 text-text-soft">
          <Spinner />
        </div>
      )}
      {profile.isError && <p className="py-8 text-center text-sm text-okada">{errorMessage(profile.error)}</p>}
      {data && view === 'profile' && <ProfileView profile={data} onView={setView} onDone={onClose} />}
      {data && view === 'report' && <ReportForm profile={data} onDone={() => setView('profile')} />}
      {data && view === 'block' && <BlockConfirm profile={data} onDone={() => setView('profile')} />}
      {data && view === 'propose' && <ProposeMarriage profile={data} onDone={() => setView('profile')} />}
    </Sheet>
  );
}

function ProfileView({ profile, onView, onDone }: { readonly profile: PlayerProfileDto; readonly onView: (view: View) => void; readonly onDone: () => void }) {
  const self = profile.relationship === 'self';
  const name = `${profile.firstName} ${profile.lastName}`;
  return (
    <div className="flex flex-col gap-4 pb-3">
      <div className="flex items-center gap-4">
        <PlayerAvatar name={name} handle={profile.handle} online={profile.online} size="xl" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <Badge tone="warn">{profile.statusTier.label}</Badge>
            {profile.blockedByYou && <Badge tone="bad">Blocked</Badge>}
          </p>
          <p className="mt-1 font-bold">{profile.title ?? 'Hustling'}</p>
          <p className="text-sm text-text-soft">
            {profile.age} years old, generation {profile.generation}
            {profile.online ? '' : ' — offline'}
          </p>
          {profile.locationLabel && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-text-soft">
              <MapPin size={14} aria-hidden /> {profile.locationLabel}
            </p>
          )}
        </div>
      </div>

      {profile.badges.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Badges">
          {profile.badges.map((badge) => (
            <li key={badge.id} className="rounded-full bg-paper-2 px-2.5 py-1 text-xs font-bold">
              <span aria-hidden>{badge.emoji}</span> {badge.label}
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-2">
        <Fact icon={<Wallet size={15} aria-hidden />} label="Self-made" value={profile.wealth.exact && profile.wealth.selfMade !== null ? formatNaira(profile.wealth.selfMade) : profile.wealth.selfMadeBand} />
        <Fact
          icon={<Banknote size={15} aria-hidden />}
          label="Income"
          value={profile.wealth.monthlyIncome !== null ? `${formatNaira(profile.wealth.monthlyIncome)}/mo` : (profile.wealth.incomeBand ?? 'Private')}
        />
        <Fact
          icon={<GraduationCap size={15} aria-hidden />}
          label="Education"
          value={profile.education.label ? `${profile.education.label}${profile.education.cgpa !== null ? `, ${profile.education.cgpa.toFixed(2)} CGPA` : ''}` : '—'}
        />
        <Fact
          icon={<Heart size={15} aria-hidden />}
          label="Family"
          value={`${profile.family.married ? 'Married' : 'Not married'}${profile.family.children > 0 ? `, ${profile.family.children} kid${profile.family.children > 1 ? 's' : ''}` : ''}`}
        />
        <Fact
          icon={<Users size={15} aria-hidden />}
          label="Friends"
          value={`${profile.friendCount}${profile.mutualFriends.count > 0 ? ` (${profile.mutualFriends.count} mutual)` : ''}`}
          wide
          detail={profile.mutualFriends.sample.length > 0 ? `You both know ${profile.mutualFriends.sample.map((friend) => friend.firstName).join(', ')}` : undefined}
        />
      </dl>

      {self ? <p className="rounded-card bg-paper-2 p-3 text-sm text-text-soft">This is how other players see you. Change what they see in Me → Settings → Privacy.</p> : <Actions profile={profile} onView={onView} onDone={onDone} />}
    </div>
  );
}

function Fact({ icon, label, value, detail, wide = false }: { readonly icon: ReactNode; readonly label: string; readonly value: string; readonly detail?: string; readonly wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 rounded-card bg-paper-2 p-3' : 'rounded-card bg-paper-2 p-3'}>
      <dt className="flex items-center gap-1.5 text-xs font-bold text-text-soft">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-bold leading-snug">{value}</dd>
      {detail && <dd className="text-xs text-text-soft">{detail}</dd>}
    </div>
  );
}

function Actions({ profile, onView, onDone }: { readonly profile: PlayerProfileDto; readonly onView: (view: View) => void; readonly onDone: () => void }) {
  const friends = useFriendActions();
  const propose = usePropose();
  const visits = useVisitActions();
  const relationships = useRelationships(true);
  const myAge = useSnapshot().data?.character.age ?? 18;
  const tooYoung = profile.age < 18 || myAge < 18;
  const openThread = useGistNav((state) => state.openThread);
  const openPhone = useUi((state) => state.openPhone);
  const name = `${profile.firstName} ${profile.lastName}`;
  const romance = relationships.data?.find((rel) => rel.characterId === profile.id) ?? null;
  const fail = (title: string) => (error: unknown) => {
    gameEvents.emit('sfx', { id: 'ui-error' });
    toast({ title, body: errorMessage(error), tone: 'bad' });
  };

  const friendButton = (() => {
    switch (profile.relationship) {
      case 'friends':
        return (
          <span className="flex h-11 items-center justify-center gap-2 rounded-card bg-naira-soft px-4 font-bold text-naira">
            <UserCheck size={18} aria-hidden /> Friends
          </span>
        );
      case 'request-received':
        return (
          <Button
            icon={<Check size={18} aria-hidden />}
            loading={friends.accept.isPending}
            onClick={() =>
              profile.pendingRequestId &&
              friends.accept.mutate(profile.pendingRequestId, {
                onSuccess: () => {
                  gameEvents.emit('sfx', { id: 'ui-success' });
                  toast({ title: `You and ${profile.firstName} are friends`, tone: 'good' });
                },
                onError: fail('Couldn’t accept'),
              })
            }
          >
            Accept friend request
          </Button>
        );
      case 'request-sent':
        return (
          <Button
            variant="paper"
            loading={friends.decline.isPending}
            onClick={() => profile.pendingRequestId && friends.decline.mutate(profile.pendingRequestId, { onError: fail('Couldn’t cancel') })}
          >
            Requested — cancel
          </Button>
        );
      default:
        return (
          <Button
            icon={<UserPlus size={18} aria-hidden />}
            loading={friends.request.isPending}
            disabled={profile.blockedByYou}
            onClick={() =>
              friends.request.mutate(profile.handle, {
                onSuccess: (result) => {
                  gameEvents.emit('sfx', { id: 'ui-success' });
                  toast({ title: result.state === 'accepted' ? `You and ${profile.firstName} are friends` : `Friend request sent to @${profile.handle}`, tone: 'good' });
                },
                onError: fail('Couldn’t send the request'),
              })
            }
          >
            Add friend
          </Button>
        );
    }
  })();

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {friendButton}
        <Button
          variant="ink"
          icon={<MessageCircle size={18} aria-hidden />}
          disabled={profile.blockedByYou}
          onClick={() => {
            openThread({ id: profile.id, handle: profile.handle, name });
            onDone();
          }}
        >
          Message
        </Button>
        <Button
          variant="paper"
          icon={<Banknote size={18} aria-hidden />}
          onClick={() => {
            gameEvents.emit('sfx', { id: 'ui-open' });
            openPhone('bank', profile.handle);
          }}
        >
          Send money
        </Button>
        {romance?.kind === 'partner' ? (
          <Button variant="paper" icon={<HeartHandshake size={18} aria-hidden />} onClick={() => onView('propose')}>
            Propose
          </Button>
        ) : romance && (romance.kind === 'fiance' || romance.kind === 'spouse') ? (
          <Button variant="paper" icon={<Heart size={18} aria-hidden />} onClick={() => openPhone('family')}>
            {romance.kind === 'spouse' ? 'Your spouse' : 'Your fiancé(e)'}
          </Button>
        ) : (
          <Button
            variant="paper"
            icon={<Heart size={18} aria-hidden />}
            disabled={profile.blockedByYou || tooYoung}
            loading={propose.isPending}
            onClick={() =>
              propose.mutate(
                { handle: profile.handle, body: { kind: 'date' } },
                {
                  onSuccess: () => {
                    gameEvents.emit('sfx', { id: 'ui-success' });
                    toast({ title: `Asked ${profile.firstName} out`, body: 'They’ll see it in their Family app. Fingers crossed.', tone: 'good' });
                  },
                  onError: fail('Couldn’t ask them out'),
                },
              )
            }
          >
            Ask on a date
          </Button>
        )}
      </div>
      <Button
        variant="paper"
        icon={<House size={18} aria-hidden />}
        disabled={profile.blockedByYou}
        loading={visits.invite.isPending}
        onClick={() =>
          visits.invite.mutate(profile.handle, {
            onSuccess: () => {
              gameEvents.emit('sfx', { id: 'ui-success' });
              toast({ title: `Invited ${profile.firstName} over`, body: 'Once they accept they can walk in or ride to your place. End it anytime from the visit card.', tone: 'good' });
            },
            onError: fail('Couldn’t send the invite'),
          })
        }
      >
        Invite to my place
      </Button>
      {tooYoung && !romance && <p className="text-xs text-text-soft">Dating unlocks at 18 — for both of you.</p>}
      <div className="flex justify-end gap-1 pt-1">
        {profile.relationship === 'friends' && (
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto text-text-soft hover:bg-paper-2"
            loading={friends.remove.isPending}
            onClick={() => friends.remove.mutate(profile.id, { onError: fail('Couldn’t unfriend') })}
          >
            Unfriend
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-text-soft hover:bg-paper-2" icon={<Ban size={16} aria-hidden />} onClick={() => onView('block')} disabled={profile.blockedByYou}>
          Block
        </Button>
        <Button variant="ghost" size="sm" className="text-okada hover:bg-okada-soft" icon={<Flag size={16} aria-hidden />} onClick={() => onView('report')}>
          Report
        </Button>
      </div>
    </div>
  );
}

function BlockConfirm({ profile, onDone }: { readonly profile: PlayerProfileDto; readonly onDone: () => void }) {
  const { block } = useFriendActions();
  return (
    <div className="flex flex-col gap-3 pb-3">
      <p className="text-text">
        Block <span className="font-bold">@{profile.handle}</span>? They won’t be able to message you, see your profile or find you at venues. You’ll stop being friends.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="paper" onClick={onDone}>
          Keep
        </Button>
        <Button
          variant="danger"
          loading={block.isPending}
          onClick={() =>
            block.mutate(profile.handle, {
              onSuccess: () => {
                toast({ title: `Blocked @${profile.handle}`, tone: 'neutral' });
                onDone();
              },
              onError: (error) => toast({ title: 'Couldn’t block', body: errorMessage(error), tone: 'bad' }),
            })
          }
        >
          Block
        </Button>
      </div>
    </div>
  );
}

const RING_STEPS = [150_000, 350_000, 750_000, 1_500_000, 3_000_000, 5_000_000] as const;

function ProposeMarriage({ profile, onDone }: { readonly profile: PlayerProfileDto; readonly onDone: () => void }) {
  const [ring, setRing] = useState<number>(RING_STEPS[1]);
  const propose = usePropose();
  return (
    <div className="flex flex-col gap-3 pb-3">
      <p className="text-text">
        Propose to <span className="font-bold">{profile.firstName}</span>. They decide in their Family app — if they say yes, you’re engaged.
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Engagement ring</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {RING_STEPS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={ring === value}
              onClick={() => setRing(value)}
              className={ring === value ? 'h-11 rounded-chip bg-ink text-sm font-bold text-on-ink' : 'h-11 rounded-chip bg-paper-2 text-sm font-bold'}
            >
              {formatNaira(value)}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-soft">
          Rings from {formatNaira(RING_LIMITS.min)} to {formatNaira(RING_LIMITS.max)}. Paid when you propose.
        </p>
      </fieldset>
      <HoldButton
        disabled={propose.isPending}
        onConfirm={() =>
          propose.mutate(
            { handle: profile.handle, body: { kind: 'marriage', ringValue: ring } },
            {
              onSuccess: () => {
                gameEvents.emit('sfx', { id: 'cash-out' });
                toast({ title: `You proposed to ${profile.firstName}! 💍`, body: 'Now we wait.', tone: 'good', amount: -ring });
                onDone();
              },
              onError: (error) => toast({ title: 'Couldn’t propose', body: errorMessage(error), tone: 'bad' }),
            },
          )
        }
      >
        Hold to propose with a {formatNaira(ring)} ring
      </HoldButton>
      <Button variant="ghost" className="text-text-soft hover:bg-paper-2" onClick={onDone}>
        Not yet
      </Button>
    </div>
  );
}
