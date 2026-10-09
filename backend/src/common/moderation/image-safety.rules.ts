import { ExternalServiceException } from '../exceptions/domain.exception.js';

/**
 * Photo screening verdicts from the open-source NSFW classifier (NSFWJS MobileNetV2 "mid", MIT). Scores are class
 * probabilities in the model's order. Players can be teenagers and DMs reach strangers, so explicit content is refused
 * at a modest confidence and strongly suggestive photos are refused too; everything else goes through (players can
 * still report a photo).
 */
export const NSFW_CLASSES = ['drawing', 'hentai', 'neutral', 'porn', 'sexy'] as const;
export type NsfwClass = (typeof NSFW_CLASSES)[number];
export type NsfwScores = Readonly<Record<NsfwClass, number>>;

/** Porn + hentai at or above this is refused. */
export const EXPLICIT_THRESHOLD = 0.45;
/** "Sexy" (lingerie, poses) at or above this is refused. */
export const SUGGESTIVE_THRESHOLD = 0.8;

export type ImageVerdict =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: 'explicit' | 'suggestive' };

export function scoresFromVector(vector: ArrayLike<number>): NsfwScores {
  if (vector.length !== NSFW_CLASSES.length) throw new ExternalServiceException('Photo check');
  return Object.fromEntries(NSFW_CLASSES.map((name, index) => [name, Number(vector[index] ?? 0)])) as Record<
    NsfwClass,
    number
  >;
}

export function judgeImage(scores: NsfwScores): ImageVerdict {
  if (scores.porn + scores.hentai >= EXPLICIT_THRESHOLD) return { allowed: false, reason: 'explicit' };
  if (scores.sexy >= SUGGESTIVE_THRESHOLD) return { allowed: false, reason: 'suggestive' };
  return { allowed: true };
}

/** The classifier's square RGB input, in pixels. */
export const NSFW_INPUT_SIZE = 224;
