'use client';

import { TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DISTRICTS,
  LAND_TITLES,
  formatNairaCompact,
  MAX_PLOTS_PER_PURCHASE,
  PLOT_SQM,
  type DistrictId,
  type LandOfferDto,
} from '@insidelife/shared';
import { Badge, HoldButton, Money, Sheet } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useHousingCommands, useLandOffers } from '../../hooks/use-housing';
import { landLines, oddsPerYear } from '../../services/homes-rules';
import { ErrorState, LoadingRows } from '@/common/components';
import { Receipt } from '@/common/components';
import { SelectField } from '@/common/components';
import { Stepper } from '@/common/components';
import { TitleLadder } from './TitleLadder';

/** Land by district: plot prices per title type, risks in plain words, and a hold-to-buy flow. */
export function LandTab() {
  const query = useLandOffers();
  const offers = useMemo(() => query.data ?? [], [query.data]);
  const districts = useMemo(() => [...new Set(offers.map((offer) => offer.districtId))], [offers]);
  const [district, setDistrict] = useState<DistrictId | null>(null);
  const [buying, setBuying] = useState<LandOfferDto | null>(null);

  if (query.isPending) return <LoadingRows rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const active =
    district ?? [...districts].sort((a, b) => cheapest(offers, a) - cheapest(offers, b))[0] ?? null;
  const shown = offers
    .filter((offer) => offer.districtId === active)
    .sort((a, b) => b.pricePerPlot - a.pricePerPlot);

  return (
    <div className="flex flex-col gap-4">
      <TitleLadder />
      <SelectField
        label="District"
        value={active ?? ''}
        onChange={(value) => setDistrict(value as DistrictId)}
        options={districts.map((id) => ({
          value: id,
          label: `${DISTRICTS[id].name} — from ${formatFrom(cheapest(offers, id))}`,
        }))}
      />
      {active && (
        <p className="-mt-2 text-xs text-text-soft">
          {DISTRICTS[active].tagline}. Plots are about {PLOT_SQM} sqm.
        </p>
      )}
      <ul className="flex flex-col gap-2.5">
        {shown.map((offer) => (
          <li key={`${offer.districtId}:${offer.title}`}>
            <button
              type="button"
              onClick={() => setBuying(offer)}
              className="flex w-full flex-col gap-2 rounded-card bg-paper-2 p-3.5 text-left ring-1 ring-transparent hover:ring-line"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{offer.titleLabel}</p>
                  <p className="text-xs text-text-soft">{offer.blurb}</p>
                </div>
                <p className="shrink-0 text-right leading-tight">
                  <Money amount={offer.pricePerPlot} compact className="type-figure text-lg" />
                  <span className="block text-2xs font-bold text-text-soft">a plot</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  tone={
                    offer.disputeRiskPerYear >= 0.08
                      ? 'bad'
                      : offer.disputeRiskPerYear >= 0.02
                        ? 'warn'
                        : 'good'
                  }
                >
                  Disputes: {oddsPerYear(offer.disputeRiskPerYear).toLowerCase()}
                </Badge>
                {offer.demolitionRiskPerYear > 0 && <Badge tone="bad">Demolition risk</Badge>}
                <Badge tone="info">
                  <TrendingUp size={12} aria-hidden />+{Math.round(offer.expectedAppreciation * 100)}%/yr
                </Badge>
              </div>
              <p className="text-sm text-text-soft">
                With fees: <Money amount={offer.totalPerPlot} className="font-bold text-text" /> a plot
              </p>
            </button>
          </li>
        ))}
      </ul>
      <BuyLandSheet offer={buying} onClose={() => setBuying(null)} />
    </div>
  );
}

function cheapest(offers: readonly LandOfferDto[], district: DistrictId): number {
  return Math.min(
    ...offers.filter((offer) => offer.districtId === district).map((offer) => offer.pricePerPlot),
  );
}

function formatFrom(amount: number): string {
  return Number.isFinite(amount) ? formatNairaCompact(amount) : '—';
}

function BuyLandSheet({
  offer,
  onClose,
}: {
  readonly offer: LandOfferDto | null;
  readonly onClose: () => void;
}) {
  return (
    <Sheet
      open={offer !== null}
      onClose={onClose}
      title={offer ? `Land in ${offer.districtName}` : ''}
      description={offer?.titleLabel}
    >
      {offer && <BuyLandForm key={`${offer.districtId}:${offer.title}`} offer={offer} onDone={onClose} />}
    </Sheet>
  );
}

function BuyLandForm({ offer, onDone }: { readonly offer: LandOfferDto; readonly onDone: () => void }) {
  const { buyLand } = useHousingCommands();
  const { data: snapshot } = useSnapshot();
  const [plots, setPlots] = useState(1);
  const { lines, total } = landLines(offer, plots);
  const risky = LAND_TITLES[offer.title].disputePerYear >= 0.08;
  const short = snapshot ? total - snapshot.wallet.balance : 0;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <Stepper
        label="Plots"
        value={plots}
        min={1}
        max={MAX_PLOTS_PER_PURCHASE}
        onChange={setPlots}
        unit={`× ${PLOT_SQM}m²`}
      />
      <Receipt
        lines={lines}
        total={{ label: 'Total today', amount: total }}
        caption={`Expected to grow about ${Math.round(offer.expectedAppreciation * 100)}% a year. Land use charge and upkeep apply.`}
      />
      {risky && (
        <p className="rounded-card bg-okada-soft p-3 text-sm">
          <strong>Know what you’re buying.</strong> {offer.titleLabel} land is cheap because omonile disputes
          ({oddsPerYear(offer.disputeRiskPerYear).toLowerCase()})
          {offer.demolitionRiskPerYear > 0 && ' and LASG demolitions'} happen. You can perfect the title later
          for a fee.
        </p>
      )}
      {short > 0 && (
        <p className="text-sm font-bold text-okada">
          You’re short by <Money amount={short} />.
        </p>
      )}
      <HoldButton
        disabled={short > 0 || buyLand.isPending}
        onConfirm={() =>
          buyLand.mutate({ districtId: offer.districtId, title: offer.title, plots }, { onSuccess: onDone })
        }
      >
        Hold to buy for <Money amount={total} compact />
      </HoldButton>
    </div>
  );
}
