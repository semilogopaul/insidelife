import {
  districtBounds,
  doorStepFor,
  isVehicleModel,
  nearestRoadPoint,
  streetDistrict,
  venueEntrance,
  type CharacterSnapshotDto,
  type DrivenVehicleDto,
  type Entrance,
  type WorldPoint,
} from '@insidelife/shared';
import { LANE_OFFSET, PAVEMENT_OFFSET, surfaceAt } from '../physics/surface';

/** The kerbside lane, as a share of the way from the centreline to the pavement. */
const KERB_LANE = LANE_OFFSET / PAVEMENT_OFFSET;
import type { SavedPose, SpawnOffer } from './spawn-handoff';

/** Where the play layer starts: the door just used, the pose before a reload, or a pavement in the district. */
export interface StartPose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly car: { readonly vehicle: DrivenVehicleDto; readonly x: number; readonly z: number; readonly heading: number } | null;
  /** The car is unknown (derived spawn or reload): ask the garage. */
  readonly lookupCar: boolean;
  /** Parking spot to use for a looked-up car. */
  readonly parking: { readonly x: number; readonly z: number; readonly heading: number };
  /** Came out of a door (play the door sound). */
  readonly fromDoor: boolean;
  readonly driving: boolean;
}

export interface SandboxStart {
  readonly at: string;
  readonly carModel: string | null;
}

/**
 * Doors sit on the apron right against the facade: step out onto the pavement, at your own spot beside the door
 * (`key`: the character id) so two players leaving together don't stand inside each other.
 */
export function stepOut(entrance: Entrance, key: string): { x: number; z: number } {
  return doorStepFor(entrance, key);
}

function fromEntrance(entrance: Entrance, car: DrivenVehicleDto | null, lookupCar: boolean, key: string): StartPose {
  const { heading, parking } = entrance;
  const position = stepOut(entrance, key);
  return {
    x: position.x,
    z: position.z,
    heading,
    car: car ? { vehicle: car, x: parking.x, z: parking.z, heading: parking.heading } : null,
    lookupCar,
    parking,
    fromDoor: true,
    driving: false,
  };
}

/** A pavement spot beside the road nearest to `point`, facing along the road. */
export function pavementNear(point: WorldPoint): { x: number; z: number; heading: number; road: WorldPoint } {
  const snap = nearestRoadPoint(point);
  if (!snap) return { x: point.x, z: point.z, heading: 0, road: point };
  // The snapped edge is axis-aligned: step to the pavement on the side facing the query point (else the other side).
  const along = Math.abs(snap.point.x - point.x) < Math.abs(snap.point.z - point.z) ? 'x' : 'z';
  const sides = along === 'x' ? [Math.sign(point.z - snap.point.z) || 1, -(Math.sign(point.z - snap.point.z) || 1)] : [Math.sign(point.x - snap.point.x) || 1, -(Math.sign(point.x - snap.point.x) || 1)];
  for (const side of sides) {
    const x = along === 'x' ? snap.point.x : snap.point.x + side * PAVEMENT_OFFSET;
    const z = along === 'x' ? snap.point.z + side * PAVEMENT_OFFSET : snap.point.z;
    if (surfaceAt(x, z) !== 'water') return { x, z, heading: along === 'x' ? 0 : Math.PI / 2, road: snap.point };
  }
  return { x: snap.point.x, z: snap.point.z, heading: 0, road: snap.point };
}

export function resolveStart(snapshot: CharacterSnapshotDto | undefined, offer: SpawnOffer | null, saved: SavedPose | null, sandbox: SandboxStart | null): StartPose {
  if (sandbox) {
    const entrance = venueEntrance(sandbox.at) ?? venueEntrance('unilag');
    const car: DrivenVehicleDto | null = sandbox.carModel && isVehicleModel(sandbox.carModel)
      ? { ownedVehicleId: 'sandbox', vehicleId: 'toyota-corolla-2008', name: 'Sandbox car', model: sandbox.carModel, color: '#c0392b', plate: 'DEV-001-IL', fuelType: 'petrol', fuelEconomyKmPerLitre: 12, fuelLitres: 45, tankLitres: 60, condition: 90, brokenDown: false }
      : null;
    if (entrance) return fromEntrance(entrance, car, false, 'sandbox');
  }
  if (offer) return fromEntrance(offer.spawn.entrance, offer.spawn.car, !offer.fromServer, snapshot?.character.id ?? '');
  if (saved) {
    return {
      x: saved.x,
      z: saved.z,
      heading: saved.heading,
      car: saved.car ? { vehicle: saved.car.vehicle, x: saved.car.x, z: saved.car.z, heading: saved.car.heading } : null,
      lookupCar: saved.car === null,
      parking: saved.car ? { x: saved.car.x, z: saved.car.z, heading: saved.car.heading } : { x: saved.x, z: saved.z, heading: saved.heading },
      fromDoor: false,
      driving: saved.driving && saved.car !== null,
    };
  }
  // A reload without a saved pose: resume where the server last accepted us (also where its anti-teleport check
  // expects us). On foot, stand exactly there; if we were driving, step out onto the nearest pavement.
  const resume = snapshot?.openWorld;
  if (resume) {
    const { spot, parking } = streetSpotNear(resume.position);
    const onFoot = resume.mode === 'walk';
    return {
      x: onFoot ? resume.position.x : spot.x,
      z: onFoot ? resume.position.z : spot.z,
      heading: onFoot ? resume.heading : spot.heading,
      car: null,
      lookupCar: true,
      parking,
      fromDoor: false,
      driving: false,
    };
  }
  // Nothing known: a pavement near the middle of the district we're in.
  const district = snapshot ? streetDistrict(snapshot.character.locationId) : null;
  const centre = district ? districtBounds(district).centre : (venueEntrance('unilag')?.position ?? { x: 0, z: 0 });
  const { spot, parking } = streetSpotNear(centre);
  return { x: spot.x, z: spot.z, heading: spot.heading, car: null, lookupCar: true, parking, fromDoor: false, driving: false };
}

/** A pavement spot near `point`, and a kerbside parking place beside it facing that side's traffic. */
function streetSpotNear(point: WorldPoint): { readonly spot: ReturnType<typeof pavementNear>; readonly parking: StartPose['parking'] } {
  const spot = pavementNear(point);
  const ox = spot.x - spot.road.x;
  const oz = spot.z - spot.road.z;
  // Right-hand traffic: the kerb is on the right.
  const facesRight = ox * -Math.sin(spot.heading) + oz * Math.cos(spot.heading) >= 0;
  return {
    spot,
    parking: { x: spot.road.x + ox * KERB_LANE, z: spot.road.z + oz * KERB_LANE, heading: facesRight ? spot.heading : spot.heading + Math.PI },
  };
}
