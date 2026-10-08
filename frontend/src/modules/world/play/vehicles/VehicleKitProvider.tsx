'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useVehicleKit, type VehicleKit } from './vehicle-kit';

const VehicleKitContext = createContext<VehicleKit | null>(null);

/** Loads the vehicle kit once (suspends) and shares it with every vehicle renderer below. */
export function VehicleKitProvider({ children }: { readonly children: ReactNode }) {
  const kit = useVehicleKit();
  return <VehicleKitContext.Provider value={kit}>{children}</VehicleKitContext.Provider>;
}

export function useKit(): VehicleKit {
  const kit = useContext(VehicleKitContext);
  if (!kit) throw new Error('useKit() must be used inside <VehicleKitProvider>');
  return kit;
}
