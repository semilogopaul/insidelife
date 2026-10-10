'use client';

import type { BettingClubDto, FormResult } from '@insidelife/shared';
import { ErrorState, LoadingRows } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useLeagueTable } from '../hooks/use-betting';
import { ClubBadge } from './parts';

const FORM_STYLES: Readonly<Record<FormResult, string>> = { W: 'bg-naira text-white', D: 'bg-paper-3 text-text', L: 'bg-okada text-white' };
const FORM_WORDS: Readonly<Record<FormResult, string>> = { W: 'won', D: 'drew', L: 'lost' };

/** This season's table: points, goal difference and the last five results. */
export function TableTab({ clubs }: { readonly clubs: ReadonlyMap<string, BettingClubDto> }) {
  const table = useLeagueTable();
  if (table.isError) return <ErrorState error={table.error} onRetry={() => void table.refetch()} />;
  if (!table.data) return <LoadingRows label="Loading the table" />;
  const { season, weeksPlayed, rows } = table.data;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-soft">
        Season {season + 1} after {weeksPlayed} of 30 weeks. Three points for a win, one for a draw.
      </p>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-separate border-spacing-y-1 text-sm">
          <caption className="sr-only">The Lagos League table, season {season + 1}</caption>
          <thead>
            <tr className="text-2xs uppercase text-text-soft">
              <th scope="col" className="w-6 text-left font-bold">
                #
              </th>
              <th scope="col" className="text-left font-bold">
                Club
              </th>
              <th scope="col" className="w-6 font-bold">
                <abbr title="Played">P</abbr>
              </th>
              <th scope="col" className="w-8 font-bold">
                <abbr title="Goal difference">GD</abbr>
              </th>
              <th scope="col" className="w-8 font-bold">
                <abbr title="Points">Pts</abbr>
              </th>
              <th scope="col" className="w-[5.5rem] text-right font-bold">
                Form
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const club = clubs.get(row.clubId);
              const gd = row.goalsFor - row.goalsAgainst;
              return (
                <tr key={row.clubId} className={cn(row.position <= 3 && 'font-bold')}>
                  <td className="tabular text-text-soft">{row.position}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <ClubBadge club={club} size={22} />
                      <span className="truncate">{club?.name ?? row.clubId}</span>
                    </span>
                  </td>
                  <td className="tabular text-center">{row.played}</td>
                  <td className="tabular text-center">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="tabular text-center font-black">{row.points}</td>
                  <td>
                    <span className="flex justify-end gap-0.5" aria-label={row.form.length > 0 ? `Last ${row.form.length}: ${row.form.map((f) => FORM_WORDS[f]).join(', ')}` : 'No games yet'}>
                      {row.form.map((result, index) => (
                        <span key={index} aria-hidden className={cn('grid size-4 place-items-center rounded-[3px] text-[0.55rem] font-black', FORM_STYLES[result])}>
                          {result}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
