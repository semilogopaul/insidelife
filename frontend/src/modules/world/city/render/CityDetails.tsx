'use client';

import { Billboards } from '../billboards/Billboards';
import { StreetAds } from '../billboards/StreetAds';
import type { CityPlan } from '../layout/placements';
import type { QualityProfile } from '../lib/quality';
import { DoorMarkers } from './DoorMarkers';
import { Landmarks } from './Landmarks';
import { PowerLines } from './PowerLines';
import { Rain } from './Rain';
import { ShowcaseLandmarks } from './ShowcaseLandmarks';
import { StreetLights } from './StreetLights';
import { VenueSigns } from './VenueSigns';

/** Everything on top of the kits: landmarks, signage, door rings, lamps, power lines, rain. */
export function CityDetails({ plan, quality }: { readonly plan: CityPlan; readonly quality: QualityProfile }) {
  return (
    <>
      <Landmarks shadows={quality.shadows} />
      <ShowcaseLandmarks shadows={quality.shadows} />
      <VenueSigns />
      <Billboards shadows={quality.shadows} />
      <StreetAds shadows={quality.shadows} />
      <DoorMarkers />
      <StreetLights lamps={plan.lamps} />
      {quality.tier !== 'low' && <PowerLines wires={plan.wires} />}
      <Rain drops={quality.rainDrops} />
    </>
  );
}
