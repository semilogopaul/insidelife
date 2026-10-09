'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { createRng, type Appearance, type BackgroundId } from '@insidelife/shared';
import { ApiError, errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { useSignOut } from '@/common/auth/use-sign-out';
import { Button, ConfirmSheet } from '@/common/components';
import { randomAppearance } from '@/common/three/avatar';
import { useHandleAvailability } from '../hooks/useHandleAvailability';
import { presetOutfit, type OutfitPreset } from '../lib/presets';
import { creatorApi } from '../services/creator.api';
import { BirthLottery, type LotteryStatus } from './BirthLottery';
import { StepRoute } from './controls';
import { CreatorStage } from './CreatorStage';
import { FateStep } from './FateStep';
import { IdentityStep, type IdentityValues } from './IdentityStep';
import { LookStep } from './LookStep';

const DEFAULT_APPEARANCE: Appearance = { bodyType: 'average', height: 1, skinTone: 2, hairStyle: 'braids', hairColor: 0, facialHair: 'none', eyeStyle: 'almond' };
const STEPS = ['Who you are', 'Your look', 'Fate'] as const;
const TITLES = ['Who you be?', 'Your look', 'Fate decides'] as const;
const MIN_SHUFFLE_MS = 2300;

type Step = 0 | 1 | 2;

/**
 * Three steps — who you are, how you look, and fate (the birth lottery) — with a live 3D turntable that waves at
 * every change. Phones: preview on top, controls in a bottom sheet. Desktop: side by side.
 */
export function CharacterCreator() {
  const router = useRouter();
  const client = useQueryClient();
  const reducedMotion = useReducedMotion() ?? false;
  const [step, setStep] = useState<Step>(0);
  const [identity, setIdentity] = useState<IdentityValues>({ firstName: '', lastName: '', handle: '', gender: 'female', stateOfOrigin: 'lagos' });
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [preset, setPreset] = useState<OutfitPreset>('everyday');
  const [changeTick, setChangeTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lottery, setLottery] = useState<{ readonly status: LotteryStatus; readonly background: BackgroundId | null } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const signOut = useSignOut('/sign-in');
  const rolls = useRef(0);
  const handleStatus = useHandleAvailability(identity.handle);
  const outfit = useMemo(() => presetOutfit(preset, identity.gender), [preset, identity.gender]);

  const identityValid = identity.firstName.trim().length >= 2 && identity.lastName.trim().length >= 2 && identity.handle.length >= 3 && handleStatus !== 'taken';

  const changeLook = (patch: Partial<Appearance>): void => {
    setAppearance((current) => ({ ...current, ...patch }));
    setChangeTick((tick) => tick + 1);
  };

  const changeIdentity = (patch: Partial<IdentityValues>): void => {
    setIdentity((current) => ({ ...current, ...patch }));
    if (patch.gender) {
      setAppearance((current) => ({ ...current, facialHair: patch.gender === 'female' ? 'none' : current.facialHair }));
      setChangeTick((tick) => tick + 1);
    }
  };

  const randomise = (): void => {
    rolls.current += 1;
    const rng = createRng(`creator-look:${Date.now()}:${rolls.current}`);
    changeLook(randomAppearance(rng, identity.gender));
  };

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    const started = performance.now();
    if (!reducedMotion) setLottery({ status: 'shuffling', background: null });
    try {
      const snapshot = await creatorApi.create({ ...identity, firstName: identity.firstName.trim(), lastName: identity.lastName.trim(), handle: identity.handle.toLowerCase(), appearance });
      client.setQueryData(queryKeys.snapshot, snapshot);
      const wait = reducedMotion ? 0 : Math.max(0, MIN_SHUFFLE_MS - (performance.now() - started));
      window.setTimeout(() => setLottery({ status: 'revealed', background: snapshot.character.background }), wait);
    } catch (caught) {
      setLottery(null);
      if (caught instanceof ApiError && caught.isEmailUnverified) {
        router.replace('/verify-email');
        return;
      }
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  const enterLagos = (): void => {
    // Flip the session flag only now, so the route guard doesn't whisk the player away mid-reveal.
    const user = useSession.getState().user;
    if (user) useSession.getState().setUser({ ...user, hasCharacter: true });
    router.replace('/play');
  };

  const displayName = [identity.firstName.trim(), identity.lastName.trim()].filter(Boolean).join(' ');

  return (
    <div className="flex h-dvh flex-col bg-ink lg:flex-row">
      <CreatorStage
        appearance={appearance}
        gender={identity.gender}
        outfit={outfit}
        changeTick={changeTick}
        displayName={displayName}
        handle={identity.handle}
        animation="idle"
        reducedMotion={reducedMotion}
        onRandomise={step === 1 ? randomise : undefined}
      />

      <section aria-labelledby="creator-step-title" className="relative z-10 -mt-5 flex min-h-0 flex-1 flex-col rounded-t-sheet bg-paper text-text shadow-[0_-12px_30px_rgb(4_18_24/0.35)] lg:mt-0 lg:w-[460px] lg:flex-none lg:rounded-none lg:shadow-none">
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line lg:hidden" aria-hidden />
        <header className="shrink-0 px-5 pb-3 pt-4 lg:px-8 lg:pt-8">
          <StepRoute steps={STEPS} current={step} />
          <h1 id="creator-step-title" className="type-slogan mt-5 text-[2.6rem] uppercase text-ink">
            {TITLES[step]}
          </h1>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 lg:px-8">
          {step === 0 && <IdentityStep values={identity} handleStatus={handleStatus} onChange={changeIdentity} />}
          {step === 1 && (
            <LookStep
              appearance={appearance}
              preset={preset}
              onChange={changeLook}
              onPreset={(next) => {
                setPreset(next);
                setChangeTick((tick) => tick + 1);
              }}
            />
          )}
          {step === 2 && <FateStep error={error} />}
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-line bg-paper px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 lg:px-8 lg:pb-8">
          {step > 0 ? (
            <Button variant="paper" size="lg" onClick={() => setStep((step - 1) as Step)}>
              Back
            </Button>
          ) : (
            <Button variant="paper" size="lg" aria-label="Back to sign in" onClick={() => setLeaving(true)}>
              Back
            </Button>
          )}
          {step === 0 && (
            <Button size="lg" className="flex-1" disabled={!identityValid} onClick={() => setStep(1)}>
              Next: your look
            </Button>
          )}
          {step === 1 && (
            <Button size="lg" className="flex-1" onClick={() => setStep(2)}>
              Next: meet your fate
            </Button>
          )}
          {step === 2 && (
            <Button size="lg" className="flex-1" loading={pending} onClick={() => void submit()}>
              Be born
            </Button>
          )}
        </footer>
      </section>

      <ConfirmSheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Back to sign in?"
        description="You’ll be signed out. Your account is saved: sign in any time to make your character."
        confirmLabel="Sign out"
        cancelLabel="Keep creating"
        tone="danfo"
        loading={signOut.isPending}
        onConfirm={() => signOut.mutate()}
      />

      {lottery && <BirthLottery status={lottery.status} background={lottery.background} reducedMotion={reducedMotion} onEnter={enterLagos} />}
    </div>
  );
}
