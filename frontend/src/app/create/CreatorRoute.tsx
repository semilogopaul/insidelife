'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/common/auth/session-store';
import { CharacterCreator } from '@/modules/character-creator';

/**
 * Guards the creator: anonymous → sign in; an email the server still needs confirmed → the code screen; players who
 * already have a character → the game.
 */
export function CreatorRoute() {
  const router = useRouter();
  const status = useSession((state) => state.status);
  const hasCharacter = useSession((state) => state.user?.hasCharacter ?? false);
  const mustVerifyEmail = useSession((state) => state.user?.mustVerifyEmail ?? false);
  const unreachable = useSession((state) => state.unreachable);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/sign-in?next=/create');
    if (status === 'authenticated' && mustVerifyEmail) router.replace('/verify-email');
    else if (status === 'authenticated' && hasCharacter) router.replace('/play');
  }, [status, hasCharacter, mustVerifyEmail, router]);

  return (
    <main className="min-h-dvh bg-ink text-on-ink">
      {status === 'authenticated' && !mustVerifyEmail && <CharacterCreator />}
      {status === 'unknown' && unreachable && (
        <p role="status" className="grid min-h-dvh place-items-center p-6 text-center text-on-ink-soft">
          Can’t reach Lagos right now. Retrying…
        </p>
      )}
    </main>
  );
}
