import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PHONE_APPS } from '@/common/game/ui-store';
import { APP_ICON_ART, AppIcon, type AppIconId } from '../app-icons';
import { PlaceIcon } from '../place-icons';

const APPS = PHONE_APPS.filter((app): app is AppIconId => app !== 'home');

describe('app icons', () => {
  it('draws an icon for every phone app', () => {
    expect(Object.keys(APP_ICON_ART).sort()).toEqual([...APPS].sort());
  });

  it('is named after its app unless decorative', () => {
    const { container } = render(
      <>
        <AppIcon app="bank" />
        <AppIcon app="gist" title="Gist (3 unread)" />
        <AppIcon app="map" decorative />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Bank' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Gist (3 unread)' })).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
  });

  it('keeps gradient and clip ids unique per icon, so a screen of icons never borrows another’s paint', () => {
    const { container } = render(
      <>
        {APPS.map((app) => (
          <AppIcon key={`${app}-big`} app={app} size={56} />
        ))}
        {APPS.map((app) => (
          <AppIcon key={`${app}-small`} app={app} size={28} />
        ))}
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const references = container.innerHTML.match(/url\(#[^)]+\)/g) ?? [];
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) expect(ids).toContain(reference.slice(5, -1));
  });
});

describe('place icon', () => {
  it('names the kind of place it shows', () => {
    render(<PlaceIcon kind="market" />);
    expect(screen.getByRole('img', { name: 'Market' })).toBeTruthy();
  });
});
