'use client';

import dynamic from 'next/dynamic';

/** WebGL only on the client. */
export const DevAviationLoader = dynamic(() => import('./DevAviation').then((module) => module.DevAviation), { ssr: false });
