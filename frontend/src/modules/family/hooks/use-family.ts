'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { findVenue, isRomanticKind, type ChildSchoolTier, type FamilyTreeDto, type InteractionRequest, type InteractionResultDto, type RelationshipDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useSnapshot } from '@/common/game/snapshot';
import { useGameMinute, useWorldState } from '@/common/game/use-game-clock';
import { familyApi } from '../services/family.api';
import type { PreviewContext } from '../services/interaction-preview';

export const familyKeys = {
  tree: queryKeys.domain('family', 'tree'),
  proposals: queryKeys.domain('family', 'proposals'),
  /** Shared with the Gist app's profile sheet. */
  relationships: queryKeys.domain('relationships'),
};

export function useFamilyTree() {
  return useQuery({ queryKey: familyKeys.tree, queryFn: familyApi.tree, staleTime: 20_000 });
}

export function useRelationships() {
  return useQuery({ queryKey: familyKeys.relationships, queryFn: familyApi.relationships, staleTime: 20_000 });
}

export function useProposals() {
  return useQuery({ queryKey: familyKeys.proposals, queryFn: familyApi.proposals, staleTime: 15_000, refetchInterval: 45_000 });
}

/** Interact with someone; the fresh relationship is written into the list, the rest refetches. */
export function useInteract() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ relationshipId, request }: { readonly relationshipId: string; readonly request: InteractionRequest }) => familyApi.interact(relationshipId, request),
    onSuccess: (result: InteractionResultDto) => {
      client.setQueryData<RelationshipDto[]>(familyKeys.relationships, (list) => list?.map((rel) => (rel.id === result.relationship.id ? result.relationship : rel)));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: familyKeys.relationships });
      void client.invalidateQueries({ queryKey: familyKeys.tree });
      void client.invalidateQueries({ queryKey: familyKeys.proposals });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}

export function useSetSchool() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ childId, tier }: { readonly childId: string; readonly tier: ChildSchoolTier }) => familyApi.setSchool(childId, tier),
    onSuccess: (tree: FamilyTreeDto) => client.setQueryData(familyKeys.tree, tree),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.snapshot }),
  });
}

export function useRespondProposal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { readonly id: string; readonly accept: boolean }) => (accept ? familyApi.accept(id) : familyApi.decline(id)),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: familyKeys.proposals });
      void client.invalidateQueries({ queryKey: familyKeys.relationships });
      void client.invalidateQueries({ queryKey: familyKeys.tree });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}

/** Everything the interaction preview needs about you, for one person (`forId`). */
export function usePreviewContext(relationships: readonly RelationshipDto[] | undefined, forId: string | null): PreviewContext | null {
  const { data: snapshot } = useSnapshot();
  const { data: world } = useWorldState();
  const now = useGameMinute(15_000);
  if (!snapshot) return null;
  const venue = snapshot.travel === null ? findVenue(snapshot.character.locationId) : undefined;
  return {
    now,
    selfAge: snapshot.character.age,
    selfGender: snapshot.character.gender,
    selfStateOfOrigin: snapshot.character.stateOfOrigin,
    charisma: snapshot.character.skills.charisma,
    status: snapshot.character.status,
    priceIndex: world?.economy.priceIndex ?? 1,
    venueType: venue?.type ?? null,
    committedElsewhere: (relationships ?? []).some((rel) => rel.id !== forId && rel.alive && isRomanticKind(rel.kind)),
  };
}
