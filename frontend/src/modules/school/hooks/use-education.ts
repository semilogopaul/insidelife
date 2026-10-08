'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplyForAdmissionRequest, EducationOverviewDto, RegisterExamRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { schoolApi } from '../services/school.api';

export const educationKey = queryKeys.domain('education');

/** The whole School view (WAEC, JAMB, admissions, enrolment, NYSC, programmes, catalogue). */
export function useEducation() {
  return useQuery({ queryKey: educationKey, queryFn: schoolApi.overview, refetchInterval: 30_000 });
}

/** Commands answer with a fresh overview: write it into the cache and refresh the wallet/HUD snapshot. */
export function useEducationCommands() {
  const client = useQueryClient();
  const onSuccess = (overview: EducationOverviewDto): void => {
    client.setQueryData(educationKey, overview);
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
  };
  return {
    registerExam: useMutation({
      mutationFn: (body: RegisterExamRequest) => schoolApi.registerExam(body),
      onSuccess,
    }),
    sitExam: useMutation({ mutationFn: schoolApi.sitExam, onSuccess }),
    apply: useMutation({ mutationFn: (body: ApplyForAdmissionRequest) => schoolApi.apply(body), onSuccess }),
    accept: useMutation({ mutationFn: schoolApi.accept, onSuccess }),
    payFees: useMutation({ mutationFn: schoolApi.payFees, onSuccess }),
    dropOut: useMutation({ mutationFn: schoolApi.dropOut, onSuccess }),
    registerNysc: useMutation({ mutationFn: schoolApi.registerNysc, onSuccess }),
    enrolProgramme: useMutation({ mutationFn: schoolApi.enrolProgramme, onSuccess }),
  };
}

/** Start a study session (home or campus). */
export function useStudy() {
  const client = useQueryClient();
  const mutation = useSnapshotMutation((minutes: number) => schoolApi.study(minutes));
  return {
    ...mutation,
    mutate: (minutes: number, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate(minutes, {
        ...options,
        onSuccess: (...args) => {
          void client.invalidateQueries({ queryKey: educationKey });
          options?.onSuccess?.(...args);
        },
      }),
  };
}
