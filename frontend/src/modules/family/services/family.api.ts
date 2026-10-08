import type { ChildSchoolTier, FamilyTreeDto, InteractionRequest, InteractionResultDto, ProposalDto, ProposalsDto, RelationshipDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const familyApi = {
  tree: () => api.get<FamilyTreeDto>('/family'),
  relationships: () => api.get<RelationshipDto[]>('/relationships'),
  interact: (relationshipId: string, body: InteractionRequest) => api.post<InteractionResultDto>(`/relationships/${relationshipId}/interactions`, body),
  setSchool: (childId: string, schoolTier: ChildSchoolTier) => api.patch<FamilyTreeDto>(`/family/children/${childId}`, { schoolTier }),
  proposals: () => api.get<ProposalsDto>('/proposals'),
  accept: (id: string) => api.post<ProposalDto>(`/proposals/${id}/accept`),
  decline: (id: string) => api.post<ProposalDto>(`/proposals/${id}/decline`),
};
