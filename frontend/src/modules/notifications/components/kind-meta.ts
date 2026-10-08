import {
  Banknote,
  BriefcaseBusiness,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  Info,
  Megaphone,
  Newspaper,
  PartyPopper,
  Receipt,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationKind } from '@insidelife/shared';

export interface KindMeta {
  readonly label: string;
  readonly icon: LucideIcon;
  /** Tailwind classes for the icon tile. */
  readonly tile: string;
}

/** How each kind of notification looks in the list. Icons always pair with words. */
export const KIND_META: Readonly<Record<NotificationKind, KindMeta>> = {
  'money-received': { label: 'Money in', icon: Banknote, tile: 'bg-naira-soft text-naira' },
  salary: { label: 'Salary', icon: Wallet, tile: 'bg-naira-soft text-naira' },
  bill: { label: 'Bill', icon: Receipt, tile: 'bg-okada-soft text-okada' },
  education: { label: 'School', icon: GraduationCap, tile: 'bg-cobalt-soft text-cobalt' },
  career: { label: 'Work', icon: BriefcaseBusiness, tile: 'bg-cobalt-soft text-cobalt' },
  health: { label: 'Health', icon: HeartPulse, tile: 'bg-okada-soft text-okada' },
  relationship: { label: 'Love', icon: Heart, tile: 'bg-ankara-soft text-ankara' },
  family: { label: 'Family', icon: Users, tile: 'bg-danfo-soft text-[#7a5600]' },
  property: { label: 'Property', icon: House, tile: 'bg-paper-3 text-ink' },
  investment: { label: 'Investments', icon: TrendingUp, tile: 'bg-naira-soft text-naira' },
  world: { label: 'Lagos', icon: Newspaper, tile: 'bg-paper-3 text-ink' },
  social: { label: 'Social', icon: PartyPopper, tile: 'bg-ankara-soft text-ankara' },
  system: { label: 'Inside Life', icon: Info, tile: 'bg-paper-3 text-text-soft' },
  achievement: { label: 'Achievement', icon: Trophy, tile: 'bg-danfo text-ink' },
  promotion: { label: 'Promotion', icon: Megaphone, tile: 'bg-danfo-soft text-[#7a5600]' },
};

/** "just now", "4m ago", "3h ago", "2d ago" from an ISO time. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
