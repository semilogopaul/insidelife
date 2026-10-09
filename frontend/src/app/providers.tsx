'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { createQueryClient } from '@/common/api/query-client';
import { useSessionBootstrap } from '@/common/auth/use-session-bootstrap';
import { Toaster } from '@/common/components';
import { usePwaBootstrap } from '@/common/pwa/use-pwa-bootstrap';

function SessionBootstrap() {
  useSessionBootstrap();
  return null;
}

function PwaBootstrap() {
  usePwaBootstrap();
  return null;
}

export function Providers({ children }: { readonly children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <SessionBootstrap />
        <PwaBootstrap />
        {children}
        <Toaster />
      </MotionConfig>
    </QueryClientProvider>
  );
}
