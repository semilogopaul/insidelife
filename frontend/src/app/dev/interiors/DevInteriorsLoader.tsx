'use client';

import dynamic from 'next/dynamic';

/** WebGL only on the client. */
export const DevInteriorsLoader = dynamic(() => import('./DevInteriors').then((module) => module.DevInteriors), { ssr: false });
