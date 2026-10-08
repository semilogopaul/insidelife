import { PROMOTION_UPLOAD_FIELD, type ApiErrorBody } from '@insidelife/shared';
import { ApiError } from '@/common/api/api-error';
import { refreshSession } from '@/common/api/http';
import { useSession } from '@/common/auth/session-store';
import { env } from '@/config/env';

export interface UploadOptions {
  readonly onProgress?: (ratio: number) => void;
  readonly signal?: AbortSignal;
}

/**
 * Authenticated multipart upload with progress (fetch can't report upload progress, so this uses XHR). Mirrors
 * `common/api/http`: bearer token, one refresh-and-retry on 401, failures as `ApiError`.
 * Candidate for `common/api` once another feature uploads files.
 */
export async function uploadMultipart<T>(path: string, file: File, fields: Readonly<Record<string, string>>, options: UploadOptions = {}): Promise<T> {
  const session = useSession.getState();
  if (session.accessToken && session.expiresAt - Date.now() < 30_000) await refreshSession();
  const first = await send<T>(path, file, fields, options);
  if (first.status === 401 && (await refreshSession())) return unwrap(await send<T>(path, file, fields, options));
  return unwrap(first);
}

interface RawResult<T> {
  readonly status: number;
  readonly body: T | Partial<ApiErrorBody> | null;
}

function unwrap<T>(result: RawResult<T>): T {
  if (result.status >= 200 && result.status < 300) return result.body as T;
  throw new ApiError(result.status, result.body as Partial<ApiErrorBody> | null);
}

function send<T>(path: string, file: File, fields: Readonly<Record<string, string>>, { onProgress, signal }: UploadOptions): Promise<RawResult<T>> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append(PROMOTION_UPLOAD_FIELD, file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${env.apiBase}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    const token = useSession.getState().accessToken;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: T | Partial<ApiErrorBody> | null = null;
      try {
        body = xhr.responseText ? (JSON.parse(xhr.responseText) as T | Partial<ApiErrorBody>) : null;
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new ApiError(0, null));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
