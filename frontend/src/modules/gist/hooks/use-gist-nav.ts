'use client';

import { create } from 'zustand';

export type GistTab = 'lagos' | 'here' | 'dms' | 'friends' | 'parties';

/** Someone you have a DM thread with. */
export interface DmPartner {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
}

interface GistNavState {
  readonly tab: GistTab;
  /** Open DM thread. */
  readonly thread: DmPartner | null;
  /** Player profile sheet (by handle). */
  readonly profileHandle: string | null;
  readonly partyId: string | null;
  /** People you've messaged (or who messaged you) this session — DMs with non-friends show up here. */
  readonly partners: readonly DmPartner[];
  setTab(tab: GistTab): void;
  openThread(partner: DmPartner): void;
  closeThread(): void;
  openProfile(handle: string): void;
  closeProfile(): void;
  openParty(id: string): void;
  closeParty(): void;
  rememberPartner(partner: DmPartner): void;
}

/** Navigation inside the Gist app (client UI state). */
export const useGistNav = create<GistNavState>()((set) => ({
  tab: 'lagos',
  thread: null,
  profileHandle: null,
  partyId: null,
  partners: [],
  setTab: (tab) => set({ tab }),
  openThread: (partner) =>
    set((state) => ({
      tab: 'dms',
      thread: partner,
      profileHandle: null,
      partners: state.partners.some((item) => item.id === partner.id) ? state.partners : [partner, ...state.partners],
    })),
  closeThread: () => set({ thread: null }),
  openProfile: (handle) => set({ profileHandle: handle.replace(/^@/, '').toLowerCase() }),
  closeProfile: () => set({ profileHandle: null }),
  openParty: (id) => set({ tab: 'parties', partyId: id }),
  closeParty: () => set({ partyId: null }),
  rememberPartner: (partner) =>
    set((state) => (state.partners.some((item) => item.id === partner.id) ? state : { partners: [partner, ...state.partners].slice(0, 30) })),
}));
