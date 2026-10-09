'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { SocialMomentDto } from '@insidelife/shared';
import { npcLook } from '@/common/three/avatar';

const MomentScene = dynamic(() => import('@/modules/moments').then((module) => module.MomentScene), {
  ssr: false,
});

export function DevMoments() {
  const params = useSearchParams();
  const kind = params.get('kind') === 'kiss' ? 'kiss' : 'hug';
  const me = npcLook(params.get('me') ?? 'dev-me-7', 'casual', 'male');
  const moment: SocialMomentDto = {
    kind,
    with: {
      name: 'Ada',
      gender: 'female',
      seed: params.get('seed') ?? 'dev-ada',
      appearance: null,
      outfit: null,
    },
  };
  return (
    <main className="grid min-h-dvh place-items-center bg-[#ffe3ea] p-4">
      <div className="aspect-[4/5] w-full max-w-sm">
        <MomentScene moment={moment} me={{ appearance: me.appearance, outfit: {}, gender: 'male' }} />
      </div>
    </main>
  );
}
