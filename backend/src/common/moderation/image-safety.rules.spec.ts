import { describe, expect, it } from 'vitest';
import { judgeImage, scoresFromVector } from './image-safety.rules.js';

const scores = (drawing: number, hentai: number, neutral: number, porn: number, sexy: number) =>
  scoresFromVector([drawing, hentai, neutral, porn, sexy]);

describe('judgeImage', () => {
  it('lets everyday photos and drawings through', () => {
    expect(judgeImage(scores(0.03, 0.01, 0.95, 0, 0.01))).toEqual({ allowed: true });
    expect(judgeImage(scores(0.67, 0.004, 0.33, 0.001, 0.001))).toEqual({ allowed: true });
  });

  it('refuses explicit content, including when it is split between porn and hentai', () => {
    expect(judgeImage(scores(0, 0, 0.1, 0.9, 0))).toEqual({ allowed: false, reason: 'explicit' });
    expect(judgeImage(scores(0.1, 0.25, 0.2, 0.25, 0.2))).toEqual({ allowed: false, reason: 'explicit' });
  });

  it('refuses strongly suggestive photos but not mildly suggestive ones', () => {
    expect(judgeImage(scores(0, 0, 0.1, 0.05, 0.85))).toEqual({ allowed: false, reason: 'suggestive' });
    expect(judgeImage(scores(0, 0, 0.5, 0.05, 0.45))).toEqual({ allowed: true });
  });

  it('rejects malformed classifier output', () => {
    expect(() => scoresFromVector([0.5, 0.5])).toThrow(/Photo check/);
  });
});
