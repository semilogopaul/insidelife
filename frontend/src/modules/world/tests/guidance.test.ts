import { findRoute, turnByTurn, venueEntrance } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { etaSeconds, instructionText, projectOnRoute, spokenDistance, upcomingManeuver, VoicePrompter } from '../navigation/guidance';

const route = findRoute(venueEntrance('unilag')!.position, venueEntrance('eko-hotel')!.position)!;
const maneuvers = turnByTurn(route, { destinationName: 'Eko Hotel & Suites' });

describe('GPS guidance', () => {
  it('projects the player onto the route and measures off-route distance', () => {
    const p = route.points[3]!;
    const progress = projectOnRoute(route, { x: p.x + 1, z: p.z }, 0);
    expect(progress.along).toBeCloseTo(route.cumulative[3]!, 0);
    expect(progress.offRoute).toBeLessThan(1.5);
    expect(projectOnRoute(route, { x: p.x + 60, z: p.z + 60 }, 0).offRoute).toBeGreaterThan(25);
  });

  it('picks the next maneuver ahead and ends with arrival', () => {
    expect(upcomingManeuver(maneuvers, 0)?.kind).toBe('depart');
    const second = maneuvers[1]!;
    expect(upcomingManeuver(maneuvers, second.at - 30)).toBe(second);
    expect(upcomingManeuver(maneuvers, route.length)?.kind).toBe('arrive');
  });

  it('speaks each prompt once, inside its band', () => {
    const prompter = new VoicePrompter();
    const turn = maneuvers.find((m) => m.kind === 'left' || m.kind === 'right')!;
    expect(prompter.next(turn, 400, 'drive')).toBeNull();
    expect(prompter.next(turn, 190, 'drive')).toMatch(/^In 200 metres, turn (left|right)/);
    expect(prompter.next(turn, 180, 'drive')).toBeNull();
    expect(prompter.next(turn, 48, 'drive')).toMatch(/^In 50 metres/);
    expect(prompter.next(turn, 10, 'drive')).toBe(turn.text);
    expect(prompter.next(turn, 5, 'drive')).toBeNull();
    // Walking only has the 50 m and "now" prompts.
    const walker = new VoicePrompter();
    expect(walker.next(turn, 190, 'walk')).toBeNull();
    expect(walker.next(turn, 45, 'walk')).toMatch(/^In 50 metres/);
  });

  it('formats spoken distances and ETAs', () => {
    expect(spokenDistance(213)).toBe('200 metres');
    expect(spokenDistance(1240)).toBe('1.2 kilometres');
    expect(spokenDistance(4)).toBe('10 metres');
    expect(etaSeconds(120, 0, 'drive')).toBeCloseTo(10);
    expect(etaSeconds(120, 20, 'drive')).toBeCloseTo(6);
  });

  it('says the destination is ahead on the last stretch, not that you have arrived', () => {
    const route = findRoute(venueEntrance('unilag')!.position, venueEntrance('luth')!.position)!;
    const maneuvers = turnByTurn(route, { destinationName: 'LUTH' });
    const arrive = maneuvers.at(-1)!;
    expect(arrive.kind).toBe('arrive');
    expect(instructionText(arrive, 'LUTH')).toBe('LUTH is ahead');
    const turn = maneuvers.find((maneuver) => maneuver.kind === 'left' || maneuver.kind === 'right');
    if (turn) expect(instructionText(turn, 'LUTH')).toBe(turn.text);
  });
});
