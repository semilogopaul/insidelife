import type { ComponentType } from 'react';
import type { PhoneApp } from './ui-store';

/**
 * A phone app as the phone shell renders it. The composition root supplies the list (features can't import each
 * other); its icon is the app's illustrated tile, `<AppIcon app={id} />` from `common/brand/app-icons`.
 */
export interface PhoneAppDefinition {
  readonly id: Exclude<PhoneApp, 'home'>;
  readonly name: string;
  readonly component: ComponentType;
}
