import type { PromotionStatus } from '@insidelife/shared';

/** One paid billboard campaign or club order in the moderation history. */
export interface AdminPromotionRowDto {
  readonly type: 'campaign' | 'club-order';
  readonly id: string;
  /** Campaign title, or the song title. */
  readonly title: string;
  /** Slot name for campaigns; artist and package for club orders. */
  readonly subtitle: string;
  readonly status: PromotionStatus;
  readonly amountKobo: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly paymentReference: string | null;
  readonly paidAt: string | null;
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
  readonly rejectionReason: string | null;
  readonly createdAt: string;
  readonly owner: { readonly userId: string; readonly email: string | null; readonly handle: string | null };
  /** Creative image (campaigns) or audio (club orders); may be relative to the API origin (`/media/...`). */
  readonly mediaUrl: string | null;
  readonly mediaType: 'image' | 'audio';
  readonly linkUrl: string | null;
}
