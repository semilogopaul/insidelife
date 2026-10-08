import type {
  ApplyForAdmissionRequest,
  CharacterSnapshotDto,
  EducationOverviewDto,
  RegisterExamRequest,
} from '@insidelife/shared';
import { api } from '@/common/api/http';

const id = (value: string): string => encodeURIComponent(value);

/** Education endpoints: every command answers with the fresh School overview. */
export const schoolApi = {
  overview: () => api.get<EducationOverviewDto>('/education'),
  registerExam: (body: RegisterExamRequest) => api.post<EducationOverviewDto>('/education/exams', body),
  sitExam: (registrationId: string) =>
    api.post<EducationOverviewDto>(`/education/exams/${id(registrationId)}/sittings`),
  apply: (body: ApplyForAdmissionRequest) => api.post<EducationOverviewDto>('/education/applications', body),
  accept: (applicationId: string) =>
    api.post<EducationOverviewDto>(`/education/applications/${id(applicationId)}/acceptance`),
  payFees: () => api.post<EducationOverviewDto>('/education/enrolments/current/fees'),
  dropOut: () => api.delete<EducationOverviewDto>('/education/enrolments/current'),
  registerNysc: () => api.post<EducationOverviewDto>('/education/nysc'),
  enrolProgramme: (programmeId: string) =>
    api.post<EducationOverviewDto>(`/education/programmes/${id(programmeId)}/enrolments`),
  /** Read your books (home or campus) — answers with a fresh snapshot. */
  study: (durationMinutes: number) =>
    api.post<CharacterSnapshotDto>('/characters/me/actions', { actionId: 'study', durationMinutes }),
};
