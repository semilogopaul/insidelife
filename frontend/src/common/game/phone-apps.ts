import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { PhoneApp } from './ui-store';

/** A phone app as the phone shell renders it. The composition root supplies the list (features can't import each other). */
export interface PhoneAppDefinition {
  readonly id: Exclude<PhoneApp, 'home'>;
  readonly name: string;
  readonly icon: LucideIcon;
  /** Tile background colour. */
  readonly tint: string;
  readonly component: ComponentType;
}
