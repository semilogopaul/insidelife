import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES, AIRCRAFT_CLASS_OF, AIRCRAFT_IDS, AIRCRAFT_NAME_MAX, isRegistration } from '../contract';
import { AIRCRAFT_SPECS, doorPoint } from '../model/aircraft-spec';
import { buildAircraft } from '../model/build-aircraft';
import { DECAL_TEXTURE_SIZE, buildDecalGeometry, decalQuads, inkFor, paintDecals } from '../model/decals';

const LIVERY = { base: '#f4f2ec', accent: '#0a7d3c', name: 'AIR TOLU', registration: '5N-TOL' };

describe('aircraft contract', () => {
  it('maps the eight aircraft to the seven classes, every class used', () => {
    expect(AIRCRAFT_IDS).toHaveLength(8);
    expect(new Set(Object.values(AIRCRAFT_CLASS_OF))).toEqual(new Set(AIRCRAFT_CLASSES));
    expect(AIRCRAFT_CLASSES).toHaveLength(7);
  });

  it('knows a Nigerian registration', () => {
    expect(isRegistration('5N-TOL')).toBe(true);
    expect(isRegistration('N-TOL')).toBe(false);
    expect(isRegistration('5N-TO')).toBe(false);
    expect(isRegistration('5n-tol')).toBe(false);
  });
});

describe('aircraft exterior models', () => {
  const built = AIRCRAFT_CLASSES.map((cls) => ({ cls, model: buildAircraft(cls, LIVERY) }));

  it('builds each class at its real size, nose at +z', () => {
    for (const { cls, model } of built) {
      const spec = AIRCRAFT_SPECS[cls];
      model.body.computeBoundingBox();
      const box = model.body.boundingBox!;
      // Nose and tail within a few percent of the real length; wing tips of the real span.
      expect(box.max.z - box.min.z, `${cls} length`).toBeGreaterThan(spec.length * 0.97);
      expect(box.max.z - box.min.z, `${cls} length`).toBeLessThan(spec.length * 1.12);
      expect(box.max.x - box.min.x, `${cls} span`).toBeGreaterThan(spec.span * 0.9);
      expect(box.max.x - box.min.x, `${cls} span`).toBeLessThan(spec.span * 1.05);
      expect(box.min.y, `${cls} sits on the ground`).toBeGreaterThanOrEqual(-0.01);
      expect(box.min.y, `${cls} sits on the ground`).toBeLessThan(0.1);
      // Mirrored left and right.
      expect(Math.abs(box.max.x + box.min.x), `${cls} symmetric`).toBeLessThan(0.3);
    }
  });

  it('keeps each plane in one draw call and a phone-friendly triangle budget', () => {
    for (const { cls, model } of built) {
      expect(model.body.groups, cls).toHaveLength(1);
      expect(model.triangles, cls).toBeLessThan(7000);
      expect(model.body.getAttribute('position').count, cls).toBeGreaterThan(200);
      for (const attribute of ['position', 'normal', 'color', 'surface']) expect(model.body.getAttribute(attribute), `${cls} ${attribute}`).toBeDefined();
    }
  });

  it('makes the classes recognisably different: size, engines and tail', () => {
    const lengths = built.map(({ cls }) => AIRCRAFT_SPECS[cls].length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(new Set(lengths).size).toBe(7);
    const props = Object.fromEntries(built.map(({ cls, model }) => [cls, model.propellers.length]));
    expect(props).toEqual({ 'piston-single': 1, 'piston-twin': 2, turboprop: 2, 'light-jet': 0, 'midsize-jet': 0, 'long-range-jet': 0, 'airliner-jet': 0 });
    expect(AIRCRAFT_SPECS['piston-single'].wing.position).toBe('high');
    expect(AIRCRAFT_SPECS['piston-twin'].wing.position).toBe('low');
    expect(AIRCRAFT_SPECS['light-jet'].engine.kind).toBe('jet-rear');
    expect(AIRCRAFT_SPECS['airliner-jet'].engine.kind).toBe('jet-under');
    expect(AIRCRAFT_SPECS['airliner-jet'].tail.tType).toBe(false);
    expect(AIRCRAFT_SPECS['long-range-jet'].tail.tType).toBe(true);
    // No two classes share the same silhouette (length, span, vertex count).
    const silhouettes = new Set(built.map(({ cls, model }) => `${AIRCRAFT_SPECS[cls].length}|${AIRCRAFT_SPECS[cls].span}|${model.body.getAttribute('position').count}`));
    expect(silhouettes.size).toBe(7);
    // Windows grow with the cabin.
    expect(AIRCRAFT_SPECS['airliner-jet'].windows.count).toBeGreaterThan(AIRCRAFT_SPECS['light-jet'].windows.count);
  });

  it('paints the livery: the same class in two liveries differs only in colour', () => {
    const a = buildAircraft('midsize-jet', { base: '#ffffff', accent: '#ff0000' });
    const b = buildAircraft('midsize-jet', { base: '#111111', accent: '#00ff00' });
    expect(a.body.getAttribute('position').count).toBe(b.body.getAttribute('position').count);
    const ca = a.body.getAttribute('color').array as Uint8Array;
    const cb = b.body.getAttribute('color').array as Uint8Array;
    let different = 0;
    for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) different++;
    expect(different).toBeGreaterThan(ca.length * 0.3);
  });

  it('puts the boarding door on the left side, on the ground side of the fuselage', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      const spec = AIRCRAFT_SPECS[cls];
      const [x, y, z] = doorPoint(spec);
      expect(x).toBeCloseTo(spec.fuselage.w / 2);
      expect(y).toBeGreaterThan(spec.clearance);
      expect(Math.abs(z)).toBeLessThan(spec.length / 2);
    }
  });
});

describe('livery decals', () => {
  it('places the name forward and the registration aft, on both sides', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      const spec = AIRCRAFT_SPECS[cls];
      const quads = decalQuads(spec, LIVERY);
      expect(quads, cls).toHaveLength(4);
      for (const side of ['left', 'right'] as const) {
        const name = quads.find((q) => q.kind === 'name' && q.side === side)!;
        const reg = quads.find((q) => q.kind === 'registration' && q.side === side)!;
        expect(name.z, cls).toBeGreaterThan(reg.z);
        expect(Math.sign(name.x)).toBe(side === 'left' ? 1 : -1);
        expect(Math.abs(name.x)).toBeGreaterThan(spec.fuselage.w / 2);
        // Never run past the nose or tail, and never on top of each other.
        for (const q of [name, reg]) expect(Math.abs(q.z) + q.width / 2, `${cls} ${q.kind}`).toBeLessThan(spec.length / 2);
        expect(Math.abs(name.z - reg.z), cls).toBeGreaterThan((name.width + reg.width) / 2);
      }
    }
  });

  it('leaves the name off when there is none, and builds one textured geometry', () => {
    const spec = AIRCRAFT_SPECS['light-jet'];
    const quads = decalQuads(spec, { name: '  ', registration: '5N-TOL' });
    expect(quads.map((q) => q.kind)).toEqual(['registration', 'registration']);
    const geometry = buildDecalGeometry(decalQuads(spec, LIVERY));
    expect(geometry.getAttribute('position').count).toBe(16);
    expect(geometry.getIndex()?.count).toBe(24);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
    }
  });

  it('reads nose to tail on the left and tail to nose on the right (u runs the right way)', () => {
    const spec = AIRCRAFT_SPECS['midsize-jet'];
    const geometry = buildDecalGeometry(decalQuads(spec, { name: 'X', registration: '' }));
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    // Quad 0 is the left side: u = 0 at the nose end (larger z), u = 1 at the tail end.
    expect(uv.getX(0)).toBe(0);
    expect(position.getZ(0)).toBeGreaterThan(position.getZ(1));
    // Quad 1 is the right side: u = 0 at the tail end.
    expect(uv.getX(4)).toBe(0);
    expect(position.getZ(4)).toBeLessThan(position.getZ(5));
  });

  it('paints the name (upper case, at most 16 characters) and the registration with readable ink', () => {
    const calls: Array<{ text: string; y: number }> = [];
    const ctx = {
      clearRect: () => undefined,
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: (text: string, _x: number, y: number) => calls.push({ text, y }),
      font: '',
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
    paintDecals(ctx, { ...LIVERY, name: 'air tolu supreme jets extra' });
    expect(calls.map((c) => c.text)).toEqual(['AIR TOLU SUPREME', '5N-TOL']);
    expect('AIR TOLU SUPREME').toHaveLength(AIRCRAFT_NAME_MAX);
    expect(calls[0]!.y).toBeLessThan(DECAL_TEXTURE_SIZE.height / 2);
    expect(calls[1]!.y).toBeGreaterThan(DECAL_TEXTURE_SIZE.height / 2);
    expect(inkFor('#ffffff')).toBe('#111418');
    expect(inkFor('#101820')).toBe('#fbfbf7');
  });
});
