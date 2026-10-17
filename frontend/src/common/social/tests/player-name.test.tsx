import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerName } from '../PlayerName';
import { WealthBadge } from '../WealthBadge';
import { rememberWealthClass, useWealthClasses, wealthNameClass } from '../wealth-class';

afterEach(() => useWealthClasses.setState({ byId: {} }));

describe('PlayerName', () => {
  it('writes nepo names in gold and says so', () => {
    render(<PlayerName wealthClass="nepo">Ada</PlayerName>);
    const name = screen.getByText('Ada', { exact: false });
    expect(name.className).toContain('text-nepo');
    expect(name.textContent).toContain('(Nepo)');
  });

  it('writes lapo names in blue', () => {
    render(<PlayerName wealthClass="lapo">Tobi</PlayerName>);
    expect(screen.getByText('Tobi', { exact: false }).className).toContain('text-lapo');
  });

  it('uses the lighter shades on dark surfaces', () => {
    expect(wealthNameClass('nepo', true)).toBe('text-nepo-on-dark');
    expect(wealthNameClass('lapo', true)).toBe('text-lapo-on-dark');
  });

  it('renders plain until the class is known', () => {
    render(<PlayerName wealthClass={undefined}>Zed</PlayerName>);
    expect(screen.getByText('Zed').className).toBe('');
  });

  it('remembers what the server said', () => {
    rememberWealthClass('c1', 'nepo');
    rememberWealthClass('c2', undefined);
    expect(useWealthClasses.getState().byId).toEqual({ c1: 'nepo' });
  });
});

describe('WealthBadge', () => {
  it('explains why the name is gold', () => {
    render(<WealthBadge wealthClass="nepo" />);
    expect(screen.getByText('Nepo 👑 — over ₦100M in the bank')).toBeTruthy();
    expect(screen.getByText(/Gold names belong to nepos/)).toBeTruthy();
  });

  it('explains blue for lapo', () => {
    render(<WealthBadge wealthClass="lapo" />);
    expect(screen.getByText('Lapo — under ₦100M')).toBeTruthy();
    expect(screen.getByText(/Blue names belong to lapos/)).toBeTruthy();
  });
});
