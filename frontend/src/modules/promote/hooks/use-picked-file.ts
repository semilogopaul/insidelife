'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PickedFile {
  readonly file: File;
  /** Object URL for previews (revoked when replaced or on unmount). */
  readonly url: string;
}

/**
 * A file chosen in an `<input type="file">` plus a preview URL. The URL is created in the event handler (not an
 * effect) so StrictMode's double effects can never revoke a URL that is still on screen.
 */
export function usePickedFile() {
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const latest = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (latest.current) URL.revokeObjectURL(latest.current);
    },
    [],
  );
  const pick = useCallback((file: File | null) => {
    if (latest.current) URL.revokeObjectURL(latest.current);
    const url = file ? URL.createObjectURL(file) : null;
    latest.current = url;
    setPicked(file && url ? { file, url } : null);
  }, []);
  return [picked, pick] as const;
}
