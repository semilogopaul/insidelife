/**
 * Test helpers for pointer input in jsdom: a `PointerEvent` with `pointerId`/`pointerType` (jsdom has none, so
 * testing-library would fall back to a plain event without them) and a fake layout box for an element.
 */

export function installPointerEvents(): void {
  if (typeof window === 'undefined') return;
  const current = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent;
  if (current && 'pointerId' in current.prototype) return;
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true, writable: true });
  // jsdom has no pointer capture.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.hasPointerCapture ??= () => false;
}

/** Give an element a layout box (jsdom lays nothing out). */
export function rect(element: Element, box: { left: number; top: number; width: number; height: number }): void {
  element.getBoundingClientRect = () =>
    ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => box }) as DOMRect;
}
