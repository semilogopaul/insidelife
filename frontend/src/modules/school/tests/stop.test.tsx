import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stop } from '../components/stages/Stop';

describe('Stop', () => {
  it('opens the stop you are in, and follows when the road moves on', () => {
    const { rerender } = render(
      <ul>
        <Stop index={1} status="todo" title="JAMB" summary="later">body-text</Stop>
      </ul>,
    );
    expect(screen.queryByText('body-text')).toBeNull();
    rerender(
      <ul>
        <Stop index={1} status="current" title="JAMB" summary="now">body-text</Stop>
      </ul>,
    );
    expect(screen.getByText('body-text')).toBeTruthy();
    rerender(
      <ul>
        <Stop index={1} status="done" title="JAMB" summary="done">body-text</Stop>
      </ul>,
    );
    expect(screen.queryByText('body-text')).toBeNull();
  });
});
