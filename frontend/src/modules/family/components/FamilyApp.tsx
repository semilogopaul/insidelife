'use client';

import { useState } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { Button, Spinner, Tabs } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useFamilyTree, useProposals, useRelationships } from '../hooks/use-family';
import { FamilyTree } from './FamilyTree';
import { HeirCard } from './HeirCard';
import { KidsPanel } from './KidsPanel';
import { PeopleList } from './PeopleList';
import { PersonSheet } from './PersonSheet';
import { ProposalsInbox } from './ProposalsInbox';

type FamilyTab = 'family' | 'people' | 'kids' | 'requests';

/** Family: the tree and your heir, everyone you know (with what you can do together), kids' schools, and requests. */
export function FamilyApp() {
  const { data: snapshot } = useSnapshot();
  const tree = useFamilyTree();
  const relationships = useRelationships();
  const proposals = useProposals();
  const [tab, setTab] = useState<FamilyTab>('family');
  const [openId, setOpenId] = useState<string | null>(null);
  const pendingRequests = proposals.data?.incoming.filter((proposal) => proposal.status === 'pending').length ?? 0;

  if (!snapshot) return null;
  const loading = tree.isPending || relationships.isPending;
  const error = tree.error ?? relationships.error;

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Family sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'family', label: 'Family' },
          { id: 'people', label: 'People' },
          { id: 'kids', label: 'Kids', badge: tree.data?.children.filter((child) => child.sentHome).length },
          { id: 'requests', label: 'Requests', badge: pendingRequests },
        ]}
      />
      {tab !== 'requests' && loading && (
        <div className="grid place-items-center py-16 text-text-soft">
          <Spinner />
        </div>
      )}
      {tab !== 'requests' && error && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm text-okada">{errorMessage(error)}</p>
          <Button
            variant="paper"
            size="sm"
            onClick={() => {
              void tree.refetch();
              void relationships.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {tab === 'family' && tree.data && (
        <div className="flex flex-col gap-4">
          <FamilyTree tree={tree.data} me={snapshot.character} onOpen={setOpenId} />
          <HeirCard tree={tree.data} />
        </div>
      )}
      {tab === 'people' && relationships.data && <PeopleList relationships={relationships.data} onOpen={setOpenId} />}
      {tab === 'kids' && tree.data && <KidsPanel kids={tree.data.children} household={tree.data.household} onOpen={setOpenId} />}
      {tab === 'requests' && <ProposalsInbox />}
      <PersonSheet relationships={relationships.data ?? []} relationshipId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
