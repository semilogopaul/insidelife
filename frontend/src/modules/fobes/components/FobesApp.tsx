'use client';

import { ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import { useState } from 'react';
import { FOBES_LISTS, formatDate, isFobesMoversList, type FobesEntryDto, type FobesListId } from '@insidelife/shared';
import { Button, EmptyState, ErrorState, FilterChips, LoadingRows, Tabs } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useFobesList, useFobesMe } from '../hooks/use-fobes';
import { sinceLabel } from '../services/fobes-format';
import { CoverStory, EntryRow } from './parts';
import { YourPosition } from './YourPosition';

type FobesTab = 'rich-list' | 'self-made' | 'under-30' | 'movers';
type Movers = 'risers' | 'fallers';

const TABS: ReadonlyArray<{ readonly id: FobesTab; readonly label: string }> = [
  { id: 'rich-list', label: 'Rich List' },
  { id: 'self-made', label: 'Self-made' },
  { id: 'under-30', label: 'Under 30' },
  { id: 'movers', label: 'Movers' },
];

/** The magazine's masthead: our own wordmark and this game week's issue date. */
function Masthead() {
  const minute = useGameMinute(60_000);
  return (
    <header className="-mx-1 rounded-card bg-noir px-4 pb-3 pt-4 text-center text-on-ink">
      <p className="type-slogan text-6xl tracking-[0.06em] text-gold">FOBES</p>
      <p className="mt-1 border-y border-gold/40 py-1 text-2xs font-bold uppercase tracking-[0.16em] text-on-ink-soft">
        The Lagos Rich List · {formatDate(minute)}
      </p>
    </header>
  );
}

/**
 * Fobes: the top 100 Lagosians by net worth, self-made worth and under 30, the week's risers and fallers, and where
 * you stand. Money follows each player's privacy setting (exact or a band). Tapping someone opens their Gist profile.
 */
export function FobesApp() {
  const [tab, setTab] = useState<FobesTab>('rich-list');
  const [movers, setMovers] = useState<Movers>('risers');
  const [page, setPage] = useState(1);
  const list: FobesListId = tab === 'movers' ? movers : tab;
  const query = useFobesList(list, page);
  const me = useFobesMe();
  const openPhone = useUi((state) => state.openPhone);
  const data = query.data?.list === list ? query.data : undefined;

  const choose = (next: FobesTab): void => {
    setTab(next);
    setPage(1);
  };
  const openProfile = (entry: FobesEntryDto): void => {
    gameEvents.emit('sfx', { id: 'ui-click' });
    openPhone('gist', `@${entry.handle}`);
  };

  const cover = data && data.page === 1 && !isFobesMoversList(list) ? data.entries[0] : undefined;
  const rows = data ? (cover ? data.entries.slice(1) : data.entries) : [];
  const since = data ? sinceLabel(data.since) : null;

  return (
    <div className="flex flex-col gap-4">
      <Masthead />
      <Tabs label="Fobes lists" value={tab} onChange={choose} items={TABS} />
      <div role="tabpanel" aria-label={FOBES_LISTS[list].title} className="flex flex-col gap-3">
        {tab === 'movers' && (
          <FilterChips<Movers>
            label="Movers"
            value={movers}
            onChange={(next) => {
              setMovers(next);
              setPage(1);
            }}
            options={[
              { id: 'risers', label: 'Risers' },
              { id: 'fallers', label: 'Fallers' },
            ]}
          />
        )}
        <div>
          <h3 className="type-title text-2xl">{FOBES_LISTS[list].title}</h3>
          <p className="text-sm text-text-soft">
            {FOBES_LISTS[list].blurb}
            {since && ` ${since}.`}
          </p>
        </div>
        {!data && !query.isError && <LoadingRows label="Loading the list" />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {data && data.entries.length === 0 && (
          <EmptyState
            icon={Crown}
            title={isFobesMoversList(list) ? 'No moves yet' : 'Nobody on this list yet'}
            body={isFobesMoversList(list) ? 'Fobes takes its snapshot at the start of each game day. Check back tomorrow.' : 'The first name here could be yours.'}
          />
        )}
        {cover && <CoverStory entry={cover} listTitle={FOBES_LISTS[list].title} onOpen={openProfile} />}
        {rows.length > 0 && (
          <ol aria-label={`${FOBES_LISTS[list].title}, page ${data?.page ?? 1}`} className="flex flex-col" aria-busy={query.isFetching || undefined}>
            {rows.map((entry) => (
              <EntryRow key={entry.characterId} entry={entry} onOpen={openProfile} />
            ))}
          </ol>
        )}
        {data && data.totalPages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-2">
            <Button variant="paper" size="sm" icon={<ChevronLeft size={16} aria-hidden />} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="tabular text-sm text-text-soft" aria-live="polite">
              Page {data.page} of {data.totalPages}
            </span>
            <Button variant="paper" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
              Next
              <ChevronRight size={16} aria-hidden />
            </Button>
          </nav>
        )}
      </div>
      {me.data && <YourPosition me={me.data} list={list} />}
    </div>
  );
}
