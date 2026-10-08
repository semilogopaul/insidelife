// Control and bidi-override characters (they can spoof or break text in other players' UIs).
// oxlint-disable-next-line no-control-regex -- matching control characters is the point of this pattern
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e<>]/g;

/** Player-written text shown to others (party titles, report details): strip unsafe characters, collapse spaces, cap length. */
export function sanitisePlayerText(raw: string | undefined, maxLength: number): string {
  return (raw ?? '').replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
