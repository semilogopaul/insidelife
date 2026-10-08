'use client';

import { Sparkles, type LucideIcon, type LucideProps } from 'lucide-react';
import { DynamicIcon, iconNames } from 'lucide-react/dynamic';

type IconName = (typeof iconNames)[number];
const NAMES: ReadonlySet<string> = new Set(iconNames);
const isIconName = (name: string): name is IconName => NAMES.has(name);

export interface NamedIconProps extends Omit<LucideProps, 'ref'> {
  /** Lucide icon name chosen by the server (achievements, milestones, suggestions). */
  readonly name: string;
  /** Shown for unknown names and while the icon loads (default: sparkles). */
  readonly fallback?: LucideIcon;
}

/** A lucide icon picked by name at runtime; unknown names fall back to `fallback`. */
export function NamedIcon({ name, fallback: Fallback = Sparkles, ...props }: NamedIconProps) {
  if (!isIconName(name)) return <Fallback {...props} />;
  return <DynamicIcon name={name} fallback={() => <Fallback {...props} />} {...props} />;
}
