import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_MARK_SHAPES, appMarkShapes, appMarkSvg } from '../app-mark';
import { BRAND_COLORS } from '../brand';

const read = (path: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), path), 'utf8');

describe('brand', () => {
  it('mirrors the @theme colour tokens', () => {
    const css = read('../../../styles/globals.css');
    for (const [key, hex] of Object.entries(BRAND_COLORS)) {
      const token = `--color-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
      expect(css, token).toContain(`${token}: ${hex};`);
    }
  });

  it('ships an icon.svg generated from the current mark (run `npm run icons` after editing it)', () => {
    expect(read('../../../../public/icon.svg').trim()).toBe(appMarkSvg({ colors: BRAND_COLORS, compact: true }));
  });

  it('keeps the compact mark recognisable: same silhouette, fewer details', () => {
    const compact = appMarkShapes(true);
    expect(compact.length).toBeLessThan(APP_MARK_SHAPES.length);
    expect(compact.every((shape) => !shape.detail)).toBe(true);
    expect(compact.some((shape) => shape.fill === 'danfo')).toBe(true);
  });
});
