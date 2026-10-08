import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Compose Tailwind classes; later classes win conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
