'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/common/auth/session-store';
import { CharacterCreator } from '@/modules/character-creator';

/** Guards the creator: anonymous → sign in; players who already have a character → the game. */
export function CreatorRoute() {
  const router = useRouter();
  const status = useSession((state) => state.status);
  const hasCharacter = useSession((state) => state.user?.hasCharacter ?? false);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/sign-in?next=/create');
    if (status === 'authenticated' && hasCharacter) router.replace('/play');
  }, [status, hasCharacter, router]);

  return <main className="min-h-dvh bg-ink text-on-ink">{status === 'authenticated' && <CharacterCreator />}</main>;
}
