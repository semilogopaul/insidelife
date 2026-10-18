'use client';

import { Navigation } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { CITIES, DISTRICTS, type CityId, type DistrictId } from '@insidelife/shared';
import { PlaceIcon, venuePlaceKind } from '@/common/brand/place-icons';
import { formatHour } from '@/common/places';
import {
  closedNote,
  distanceLabel,
  SEARCH_SUGGESTIONS,
  type SearchGroups,
  type SearchResult,
} from '../services/search';

interface Props {
  readonly query: string;
  readonly groups: SearchGroups;
  readonly cityId: CityId;
  readonly fromDistrict: DistrictId;
  readonly hour: number;
  /** The active category chip's name when it narrows the search; null when searching everything. */
  readonly scopeLabel: string | null;
  readonly onSelect: (venueId: string) => void;
  readonly onSuggest: (query: string) => void;
  readonly onSearchAll: () => void;
  readonly onFly: () => void;
}

/** Arrow keys walk the result buttons; Up from the first returns to the search box. */
function onListKey(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-result]'));
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  event.preventDefault();
  if (event.key === 'ArrowDown') buttons[Math.min(at + 1, buttons.length - 1)]?.focus();
  else if (at === 0) document.getElementById('map-search')?.focus();
  else buttons[at - 1]?.focus();
}

function Row({
  result,
  fromDistrict,
  hour,
  showDistance,
  onSelect,
}: {
  readonly result: SearchResult;
  readonly fromDistrict: DistrictId;
  readonly hour: number;
  readonly showDistance: boolean;
  readonly onSelect: (id: string) => void;
}) {
  const { venue } = result;
  const closed = closedNote(venue, hour, formatHour);
  return (
    <li>
      <button
        type="button"
        data-result
        onClick={() => onSelect(venue.id)}
        className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left"
      >
        <PlaceIcon kind={venuePlaceKind(venue)} size={36} decorative />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{venue.name}</span>
          <span className="block truncate text-sm text-text-soft">{DISTRICTS[venue.districtId].name}</span>
          {closed && <span className="block truncate text-sm font-bold text-okada">{closed}</span>}
        </span>
        {showDistance && (
          <span className="shrink-0 text-xs font-bold text-text-soft">
            {distanceLabel(fromDistrict, venue)}
          </span>
        )}
        <Navigation size={18} aria-hidden className="shrink-0 text-text-faint" />
      </button>
    </li>
  );
}

/** What the search found: your city first, then the other city with a way to get there. */
export function MapSearchResults({
  query,
  groups,
  cityId,
  fromDistrict,
  hour,
  scopeLabel,
  onSelect,
  onSuggest,
  onSearchAll,
  onFly,
}: Props) {
  const list = useRef<HTMLDivElement>(null);
  const total = groups.here.length + groups.elsewhere.length;
  const otherCity = cityId === 'lagos' ? 'abuja' : 'lagos';
  const summary =
    total === 0
      ? `No places match ${query}`
      : `${total} ${total === 1 ? 'place' : 'places'} found${groups.elsewhere.length > 0 ? `, ${groups.elsewhere.length} in ${CITIES[otherCity].name}` : ''}`;

  return (
    <div ref={list} onKeyDown={onListKey} className="flex flex-col gap-3" data-testid="map-search-results">
      <p role="status" aria-live="polite" className="sr-only">
        {summary}
      </p>
      {total === 0 && (
        <div
          className="flex flex-col items-start gap-3 rounded-card bg-paper-2 p-4"
          data-testid="map-search-empty"
        >
          <p className="font-bold">
            No places match “{query.trim()}”{scopeLabel ? ` in ${scopeLabel}` : ''}.
          </p>
          {scopeLabel ? (
            <button
              type="button"
              onClick={onSearchAll}
              className="h-9 rounded-full bg-ink px-3.5 text-sm font-bold text-on-ink"
            >
              Search all places
            </button>
          ) : (
            <Suggestions onSuggest={onSuggest} label="Try one of these" />
          )}
        </div>
      )}
      {groups.here.length > 0 && (
        <section aria-label={`In ${CITIES[cityId].name}`}>
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-text-soft">
            In {CITIES[cityId].name}
          </h4>
          <ul className="flex flex-col divide-y divide-line" data-testid="map-search-here">
            {groups.here.map((result) => (
              <Row
                key={result.venue.id}
                result={result}
                fromDistrict={fromDistrict}
                hour={hour}
                showDistance
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      )}
      {groups.elsewhere.length > 0 && (
        <section
          aria-label={`In ${CITIES[otherCity].name}`}
          className="rounded-card bg-paper-2 px-3 pb-1 pt-3"
          data-testid="map-search-other"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-text-soft">
              In {CITIES[otherCity].name}
            </h4>
            <button
              type="button"
              onClick={onFly}
              className="shrink-0 rounded-full bg-danfo px-3 py-1.5 text-sm font-bold text-ink hover:brightness-95"
            >
              Fly or take the bus
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {groups.elsewhere.map((result) => (
              <Row
                key={result.venue.id}
                result={result}
                fromDistrict={fromDistrict}
                hour={hour}
                showDistance={false}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Suggestions({
  onSuggest,
  label,
}: {
  readonly onSuggest: (query: string) => void;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-soft">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {SEARCH_SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => onSuggest(suggestion)}
              className="h-9 rounded-full bg-paper px-3.5 text-sm font-bold text-text-soft ring-1 ring-line hover:bg-paper-3"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shown under the empty search box: one scrolling line of words worth typing. */
export function MapSearchHints({ onSuggest }: { readonly onSuggest: (query: string) => void }) {
  return (
    <ul
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      aria-label="Try searching for"
      data-testid="map-search-hints"
    >
      {SEARCH_SUGGESTIONS.map((suggestion) => (
        <li key={suggestion} className="shrink-0">
          <button
            type="button"
            onClick={() => onSuggest(suggestion)}
            className="h-8 rounded-full bg-paper px-3 text-sm font-bold text-text-soft ring-1 ring-line hover:bg-paper-3"
          >
            {suggestion}
          </button>
        </li>
      ))}
    </ul>
  );
}
