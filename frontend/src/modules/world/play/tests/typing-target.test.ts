import { afterEach, describe, expect, it } from 'vitest';
import { restoreFocus } from '@/common/utils/focus';
import { isTypingTarget } from '../input/controls';

afterEach(() => {
  document.body.innerHTML = '';
});

const dialogWithButton = (): { dialog: HTMLElement; button: HTMLButtonElement } => {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const button = document.createElement('button');
  button.textContent = 'Close';
  dialog.append(button);
  document.body.append(dialog);
  return { dialog, button };
};

describe('movement keys after a sheet closes (W A S D stay alive)', () => {
  it('treats keys in an open dialog or a text field as not the game’s', () => {
    const { button } = dialogWithButton();
    expect(isTypingTarget(button)).toBe(true);
    const input = document.createElement('input');
    document.body.append(input);
    expect(isTypingTarget(input)).toBe(true);
  });

  it('ignores focus left on a hidden, inert or removed Close button', () => {
    const { dialog, button } = dialogWithButton();
    dialog.setAttribute('aria-hidden', 'true');
    expect(isTypingTarget(button)).toBe(false);
    dialog.removeAttribute('aria-hidden');
    dialog.setAttribute('inert', '');
    expect(isTypingTarget(button)).toBe(false);
    dialog.remove();
    expect(isTypingTarget(button)).toBe(false);
  });

  it('hands focus back to the page when the trigger is gone', () => {
    const { dialog, button } = dialogWithButton();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    button.focus();
    trigger.remove();
    restoreFocus(trigger, dialog);
    expect(document.activeElement).toBe(document.body);
    // …and to the trigger when it's still there.
    document.body.append(trigger);
    button.focus();
    restoreFocus(trigger, dialog);
    expect(document.activeElement).toBe(trigger);
  });
});
