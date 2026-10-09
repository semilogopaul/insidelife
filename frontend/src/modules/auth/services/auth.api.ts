import type { AuthSessionDto, AuthUserDto, LoginRequest, RegisterRequest, RegisterResponseDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const authApi = {
  register: (body: RegisterRequest) => api.post<RegisterResponseDto>('/auth/register', body, { anonymous: true }),
  login: (body: LoginRequest) => api.post<AuthSessionDto>('/auth/login', body, { anonymous: true }),
  logout: () => api.post<void>('/auth/logout', undefined, { anonymous: true }),
  me: () => api.get<AuthUserDto>('/auth/me'),
};
