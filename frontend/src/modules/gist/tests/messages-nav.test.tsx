import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FRIEND = { id: 'f1', handle: 'tolu', firstName: 'Tolu', lastName: 'A', wealthClass: 'lapo', online: true };
vi.mock('@/common/game/snapshot', () => ({ useSnapshot: () => ({ data: { character: { id: 'me', handle: 'me' } } }) }));
vi.mock('../hooks/use-live-chat', () => ({ useLiveChat: () => undefined }));
vi.mock('../components/profile/PlayerProfileSheet', () => ({ PlayerProfileSheet: () => null }));
vi.mock('../hooks/use-social', async (original) => ({ ...(await original<object>()), useFriends: () => ({ data: { friends: [FRIEND] } }) }));
vi.mock('../hooks/use-chat', async (original) => ({ ...(await original<object>()), useDmThreads: () => ({ data: [], isPending: false }) }));

import { useUi } from '@/common/game/ui-store';
import { MessagesApp } from '../components/MessagesApp';
import { useGistNav } from '../hooks/use-gist-nav';

function wrap(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('Messages app navigation', () => {
  beforeEach(() => useUi.setState({ phoneParam: null }));

  it('opens on the conversation list, not inside the last chat', () => {
    useGistNav.getState().openThread({ id: 'f1', handle: 'tolu', name: 'Tolu A', wealthClass: 'lapo' } as never);
    render(wrap(<MessagesApp />));
    expect(useGistNav.getState().thread).toBeNull();
    expect(screen.getByRole('list', { name: 'Conversations' })).toBeTruthy();
  });

  it('keeps Find friends on screen once you already have a friend', () => {
    const openPhone = vi.spyOn(useUi.getState(), 'openPhone');
    render(wrap(<MessagesApp />));
    expect(screen.getByText('Tolu A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Find friends/ }));
    expect(openPhone).toHaveBeenCalledWith('gist', 'friends');
  });
});
