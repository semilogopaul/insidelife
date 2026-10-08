import { COMMON_FIRST_NAMES, ETHNICITIES, NAME_POOLS, createRng, ethnicityOfState, generateName } from '@insidelife/shared';

describe('NPC name generation', () => {
  it('is deterministic for the same seed', () => {
    for (const ethnicity of ETHNICITIES) {
      const a = generateName(createRng(`seed:${ethnicity}`), ethnicity, 'female');
      const b = generateName(createRng(`seed:${ethnicity}`), ethnicity, 'female');
      expect(a).toEqual(b);
    }
  });

  it('draws first names from the ethnicity (or the common church-English pool) and surnames from the ethnicity', () => {
    for (const ethnicity of ETHNICITIES) {
      for (let i = 0; i < 40; i++) {
        const gender = i % 2 === 0 ? 'male' : 'female';
        const name = generateName(createRng(`pool:${ethnicity}:${i}`), ethnicity, gender);
        expect([...NAME_POOLS[ethnicity][gender], ...COMMON_FIRST_NAMES[gender]]).toContain(name.firstName);
        expect(NAME_POOLS[ethnicity].surnames).toContain(name.lastName);
      }
    }
  });

  it('never gives Hausa NPCs church-English names', () => {
    for (let i = 0; i < 200; i++) {
      const name = generateName(createRng(`hausa:${i}`), 'hausa', 'male');
      expect(NAME_POOLS.hausa.male).toContain(name.firstName);
    }
  });

  it('keeps a family surname and avoids names already used by siblings', () => {
    const avoid = new Set(NAME_POOLS.igbo.female.slice(0, 5));
    for (let i = 0; i < 50; i++) {
      const name = generateName(createRng(`sibling:${i}`), 'igbo', 'female', { surname: 'Okafor', avoid });
      expect(name.lastName).toBe('Okafor');
    }
    const clashes = Array.from({ length: 50 }, (_, i) => generateName(createRng(`sibling:${i}`), 'igbo', 'female', { avoid }).firstName).filter((first) =>
      avoid.has(first),
    );
    expect(clashes).toEqual([]);
  });

  it('maps states of origin to their people', () => {
    expect(ethnicityOfState('lagos')).toBe('yoruba');
    expect(ethnicityOfState('anambra')).toBe('igbo');
    expect(ethnicityOfState('kano')).toBe('hausa');
    expect(ethnicityOfState('benue')).toBe('tiv');
    expect(ethnicityOfState('atlantis')).toBe('other');
  });
});
