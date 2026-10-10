import type { PhoneApp, StickSide } from '@/common/game/ui-store';

export interface TourContext {
  /** A touch screen (the stick ring and the drive buttons are on screen). */
  readonly touch: boolean;
  readonly stickSide: StickSide | null;
}

export interface TourStep {
  readonly id: string;
  /** `data-tour` values to point at, first one on screen wins. None on screen: the card is centred. */
  readonly targets: readonly string[];
  readonly title: string;
  readonly body: (context: TourContext) => string;
  /** Where the phone should be for this step: closed (default) or open on an app (never buys anything). */
  readonly phone?: { readonly app: PhoneApp; readonly param?: string };
  /** The HUD must be hidden for this step (the clean screen); every other step needs it shown. */
  readonly hudHidden?: boolean;
}

const thumb = (context: TourContext): string => (context.stickSide === 'left' ? 'left' : 'right');
const otherThumb = (context: TourContext): string => (context.stickSide === 'left' ? 'right' : 'left');

/** The walkthrough, in order. Copy adapts to touch or keyboard; each step names the real control it points at. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'move',
    targets: ['stick-ring'],
    title: 'How to move',
    body: (context) =>
      context.touch
        ? `Put your ${thumb(context)} thumb on the ring and drag to walk; push to the edge to jog. Inside a place, tap a spot to walk there. Your ${otherThumb(context)} thumb looks around.`
        : 'Walk with W A S D or the arrow keys, and hold Shift to run. Inside a place, click a spot to walk there. Drag the mouse to look around.',
  },
  {
    id: 'car',
    // Only the car's own button: the context button may be offering something else (e.g. Bath) to players without a car.
    targets: ['car-exit'],
    title: 'Cars: in and out',
    body: (context) =>
      context.touch
        ? 'Tap your car (or walk up to it and tap "Get in car"). At the wheel, "Get out" parks it.'
        : 'Click your car, or walk up to it and press E. At the wheel, press F (or click Get out) to park and step out.',
  },
  {
    id: 'goals-pill',
    targets: ['goals-pill'],
    title: 'Your next goal',
    body: () => 'When a goal is close, a yellow pill shows it on the HUD. Tap it for the details and a shortcut. If you don’t see one now, it appears as you play.',
  },
  {
    id: 'goals-app',
    targets: ['app-goals'],
    title: 'The Goals app',
    body: () => 'Every goal, your chapter and your achievements live in the Goals app on your phone.',
    phone: { app: 'home' },
  },
  {
    id: 'clean-hide',
    targets: ['hud-hide'],
    title: 'Clean screen',
    body: (context) => (context.touch ? 'Tap the eye to hide the HUD for an unobstructed view.' : 'Click the eye, or press H, to hide the HUD for an unobstructed view.'),
  },
  {
    id: 'clean-show',
    targets: ['hud-show'],
    title: 'Bringing the HUD back',
    body: (context) =>
      `The HUD is hidden now. A small Show button stays top-right${context.touch ? '' : ' (H works too)'}. It also comes back by itself when you enter a place or get in or out of a car.`,
    hudHidden: true,
  },
  {
    id: 'motors',
    targets: ['motors-tabs'],
    title: 'Buy a car',
    body: () => 'Open the Motors app. "Buy a car" lists the dealers’ cars; you always see the price and confirm before anything is bought. "Licence" is your driving licence.',
    phone: { app: 'motors', param: 'dealer' },
  },
  {
    id: 'homes',
    targets: ['homes-tabs'],
    title: 'Rent or buy a home',
    body: () => 'In the Homes app, rent a flat, buy land, or buy a ready-built house. Nothing is charged until you confirm.',
    phone: { app: 'homes', param: 'rent' },
  },
  {
    id: 'promote',
    targets: ['promote-tabs'],
    title: 'Promote',
    body: () => 'Billboards puts your ad on billboards and screens (book a spot, then follow it under My campaigns). Club DJ gets your song played in the clubs. You can replay this walkthrough in Me, then Settings.',
    phone: { app: 'promote' },
  },
];
