'use client';

import { Fuel, Gauge, Plane, Route, Users } from 'lucide-react';
import { useState } from 'react';
import { AIRCRAFT_CLASS_INFO, DEFAULT_LIVERY, GAT_NAMES, type AircraftCatalogEntryDto, type HangarDto } from '@insidelife/shared';
import { Badge, Button, Money } from '@/common/components';
import { airframeFor, formatFlightTime, liveryHex } from '../../services/hangar-rules';
import { AircraftArt } from '../AircraftArt';
import { BuyAircraftSheet } from './BuyAircraftSheet';

/** The aircraft sales desk: specs, price and running costs of every aircraft; buy at the Lagos GAT or order a ferry delivery. */
export function BuyTab({ data }: { readonly data: HangarDto }) {
  const [buying, setBuying] = useState<AircraftCatalogEntryDto | null>(null);
  const atDesk = data.catalogue.some((entry) => entry.buyHere);
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-card bg-paper-2 p-3 text-sm">
        {atDesk ? (
          <>
            You’re at the <strong>{GAT_NAMES['mmia-gat']}</strong> sales desk: aircraft you buy here are parked on the apron today, no ferry fee.
          </>
        ) : (
          <>Sales desk at the {GAT_NAMES['mmia-gat']}. Buy in person, or order from here and a ferry crew brings it to the terminal you pick.</>
        )}
      </p>
      <ul className="flex flex-col gap-3">
        {data.catalogue.map((entry) => (
          <AircraftCard key={entry.aircraft.id} entry={entry} onBuy={() => setBuying(entry)} />
        ))}
      </ul>
      <BuyAircraftSheet entry={buying} onClose={() => setBuying(null)} />
    </div>
  );
}

function AircraftCard({ entry, onBuy }: { readonly entry: AircraftCatalogEntryDto; readonly onBuy: () => void }) {
  const { aircraft } = entry;
  const info = AIRCRAFT_CLASS_INFO[aircraft.class];
  return (
    <li className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-title truncate text-lg leading-tight">{aircraft.name}</p>
          <p className="text-sm text-text-soft">{info.label}</p>
        </div>
        <p className="shrink-0 text-right leading-tight">
          <Money amount={entry.price} compact className="type-figure text-xl" />
          <span className="block text-2xs font-bold text-text-soft">{aircraft.fuelType === 'avgas' ? 'Avgas' : 'Jet A-1'}</span>
        </p>
      </div>
      <AircraftArt
        airframe={airframeFor(aircraft.class)}
        base={liveryHex(DEFAULT_LIVERY.base)}
        accent={liveryHex(DEFAULT_LIVERY.accent)}
        label={aircraft.name}
        className="mx-auto w-full max-w-xs"
      />
      <p className="text-sm text-text-soft">{aircraft.blurb}</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge>
          <Users size={12} aria-hidden />
          {aircraft.seats} seats
        </Badge>
        <Badge>
          <Route size={12} aria-hidden />
          {aircraft.rangeKm.toLocaleString('en-NG')} km range
        </Badge>
        <Badge>
          <Gauge size={12} aria-hidden />
          {aircraft.cruiseKmh} km/h
        </Badge>
        <Badge>
          <Fuel size={12} aria-hidden />
          {aircraft.fuelBurnLph} L/h
        </Badge>
        <Badge tone={info.crewed ? 'info' : 'warn'}>
          <Plane size={12} aria-hidden />
          {info.crewed ? 'Crew included' : entry.canFly ? 'You fly it' : 'Needs a PPL'}
        </Badge>
        <Badge tone="ankara">+{info.status} clout</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-text-soft">Hangar / month</dt>
        <dd className="text-right font-bold"><Money amount={entry.monthly.hangar} compact /></dd>
        <dt className="text-text-soft">Maintenance / month</dt>
        <dd className="text-right font-bold"><Money amount={entry.monthly.maintenance} compact /></dd>
        {entry.monthly.crew > 0 && (
          <>
            <dt className="text-text-soft">Crew / month</dt>
            <dd className="text-right font-bold"><Money amount={entry.monthly.crew} compact /></dd>
          </>
        )}
        <dt className="text-text-soft">Lagos to Abuja</dt>
        <dd className="text-right font-bold">
          {formatFlightTime(entry.routeMinutes)} · <Money amount={entry.routeFuelCost} compact /> fuel
        </dd>
      </dl>
      <Button variant={entry.buyHere ? 'danfo' : 'ink'} onClick={onBuy}>
        {entry.buyHere ? 'Buy and park it here' : 'Buy or order delivery'}
      </Button>
    </li>
  );
}
