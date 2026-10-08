'use client';

import { useMemo, useState } from 'react';
import { Tabs } from '@/common/components';
import { useStatement } from '../../hooks/use-wallet';
import { filterEntries, type StatementFilter } from '../../services/statement';
import { ScreenHeader } from '../ScreenHeader';
import { StatementList } from './StatementList';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Money in' },
  { id: 'out', label: 'Money out' },
] as const;

/** Full statement with infinite scroll. Filters apply to what's loaded; scrolling loads older pages. */
export function StatementScreen({ onBack }: { readonly onBack: () => void }) {
  const statement = useStatement();
  const [filter, setFilter] = useState<StatementFilter>('all');
  const entries = useMemo(() => filterEntries(statement.entries, filter), [statement.entries, filter]);
  return (
    <div className="flex flex-col gap-3">
      <ScreenHeader title="Statement" onBack={onBack} backLabel="Back to Bank" />
      <Tabs items={FILTERS} value={filter} onChange={setFilter} label="Filter transactions" />
      <div role="tabpanel" aria-label={FILTERS.find((item) => item.id === filter)?.label}>
        <StatementList
          entries={entries}
          isPending={statement.isPending}
          error={statement.error}
          hasNextPage={statement.hasNextPage}
          isFetchingNextPage={statement.isFetchingNextPage}
          fetchNextPage={() => void statement.fetchNextPage()}
          refetch={() => void statement.refetch()}
          emptyHint={filter === 'in' ? 'Salary, gifts and transfers to you land here.' : filter === 'out' ? 'Spending, bills and transfers you send show here.' : undefined}
        />
      </div>
    </div>
  );
}
