/**
 * Speech bubbles: talking out loud to the people around you (`chat:say` → `chat:said`). The store holds the bubbles and
 * the Nearby log; `modules/talk` owns the Talk box and the log, `modules/world` draws bubbles over avatars.
 */
export { useSpeech, type Bubble, type HeardLine } from './speech-store';
export { useSpeechFeed } from './use-speech-feed';
export { sayOutLoud, draftToLine, SpeechError } from './say';
export {
  audible,
  bubbleDurationMs,
  earshotOf,
  BUBBLE_MAX_MS,
  BUBBLE_MIN_MS,
  FEED_MAX_LINES,
  FEED_MS,
  NEARBY_KEEP_MS,
  NEARBY_MAX_LINES,
  type Earshot,
} from './speech-rules';
