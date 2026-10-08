/** Player @handles: what people type ("@Tolu_9 ") vs what the API matches ("tolu_9"). */

const HANDLE = /^[a-z0-9_]{3,20}$/;

export function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE.test(handle);
}

/** Two-letter monogram for the avatar-less recipient card. */
export function initials(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}
