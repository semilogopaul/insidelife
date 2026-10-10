/**
 * Focus housekeeping for overlays over the game. When a sheet or the phone closes, focus must not stay on a button
 * that is going away (or already hidden): the game's movement keys ignore keystrokes aimed at dialogs, so a stale
 * focus would leave W A S D dead until the player clicks the world.
 */

/** Is this element really on screen for the keyboard: connected, not hidden, inert or aria-hidden, and rendered? */
export function isShownForKeyboard(element: Element): boolean {
  if (!element.isConnected) return false;
  if (element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
  // `checkVisibility` (display: none, content-visibility, visibility: hidden) where the browser has it.
  const check = (element as Element & { checkVisibility?: (options?: { visibilityProperty?: boolean }) => boolean }).checkVisibility;
  return typeof check === 'function' ? check.call(element, { visibilityProperty: true }) : true;
}

/** Drop focus that sits inside `container` (a closing sheet, the phone), handing the keyboard back to the game. */
export function releaseFocusFrom(container: Element | null): void {
  const active = document.activeElement;
  if (container && active instanceof HTMLElement && container.contains(active)) active.blur();
}

/**
 * Give focus back to what had it before an overlay opened, if that is still on screen; otherwise let it go (to the
 * page, where the game's keys work) rather than leave it on a vanishing button.
 */
export function restoreFocus(previous: HTMLElement | null, closing: Element | null): void {
  releaseFocusFrom(closing);
  if (previous && previous !== document.body && isShownForKeyboard(previous) && !closing?.contains(previous)) previous.focus();
}
