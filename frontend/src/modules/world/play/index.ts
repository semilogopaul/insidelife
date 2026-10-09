/**
 * Play layer (owned by the play engineer): player controller, cameras, enter/exit flow, rides, traffic, pedestrians,
 * other players, billboard taps and impressions. `PlayLayer` renders inside the world <Canvas> while outside;
 * `PlayOverlay` is its DOM half (touch controls, name tags, sponsor sheet, door fade) and `usePlayBridge` its
 * always-on part (stepping outside, context-button keys) — both mounted by `WorldCanvas`.
 */
export { PlayLayer, PLAY_LAYER_OWNS_CAMERA, type PlayLayerProps } from './PlayLayer';
export { PlayOverlay } from './overlay/PlayOverlay';
export { usePlayBridge, type WorldPresence } from './flow/use-play-bridge';
export { InteriorSpray } from './effects/InteriorSpray';
export { InteriorMoments } from './effects/InteriorMoments';
export type { SandboxStart } from './flow/start-pose';
