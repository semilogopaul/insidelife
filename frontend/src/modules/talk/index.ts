/**
 * Talk: say something out loud to the people near you. `TalkButton` goes on the HUD; `TalkLayer` (mounted once in the
 * game root) holds the Talk box, the Nearby feed and log, the screen-reader announcer and the T key. The bubbles over
 * heads are the world's; the realtime feed is `useSpeechFeed` in `@/common/speech`.
 */
export { TalkButton } from './components/TalkButton';
export { TalkFeed, TalkLayer } from './components/TalkLayer';
