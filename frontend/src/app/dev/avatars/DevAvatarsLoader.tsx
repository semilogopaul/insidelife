'use client';

import dynamic from 'next/dynamic';

/** WebGL only on the client. */
export const DevAvatarsLoader = dynamic(() => import('./DevAvatars').then((module) => module.DevAvatars), { ssr: false });
