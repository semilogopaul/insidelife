'use client';

import { Fuel, Zap, ZapOff } from 'lucide-react';
import type { HomePowerBackup, PowerDto } from '@insidelife/shared';
import { Badge, Button, Money } from '@/common/components';
import { useUi } from '@/common/game/ui-store';

const BACKUP: Record<HomePowerBackup, string> = {
  none: 'No backup',
  generator: 'Generator',
  inverter: 'Inverter',
  solar: 'Solar',
};

/** NEPA reality: hours of light a day, what your backup does about it, and what it costs. */
export function PowerCard({ power }: { readonly power: PowerDto }) {
  const openPhone = useUi((state) => state.openPhone);
  const hours = Math.round(power.gridHours);
  return (
    <div className="flex flex-col gap-3 rounded-card bg-ink p-3.5 text-on-ink">
      <div className="flex items-start gap-3">
        {/* 24 segments: lit hours vs dark hours */}
        <div aria-hidden className="grid shrink-0 grid-cols-6 gap-0.5 pt-1">
          {Array.from({ length: 24 }, (_, index) => (
            <span
              key={index}
              className={index < hours ? 'size-2 rounded-[2px] bg-danfo' : 'size-2 rounded-[2px] bg-white/12'}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="type-title text-lg leading-tight">
            {power.gridCollapse ? 'Grid collapse!' : `${hours}h of light a day`}
          </p>
          <p className="text-sm text-on-ink-soft">
            {power.gridCollapse
              ? 'The national grid is down. Everybody is in darkness.'
              : `${24 - hours}h of darkness on a normal day.`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={power.backup === 'none' ? 'bad' : 'good'}>
          {power.backup === 'none' ? <ZapOff size={12} aria-hidden /> : <Zap size={12} aria-hidden />}
          {BACKUP[power.backup]}
        </Badge>
        {power.comfortPenalty > 0 && (
          <Badge tone="warn">−{power.comfortPenalty.toFixed(1)} comfort today</Badge>
        )}
        {power.dailyFuelCost > 0 && (
          <Badge tone="info">
            <Fuel size={12} aria-hidden />
            <span>
              <Money amount={power.dailyFuelCost} />
              /day fuel
            </span>
          </Badge>
        )}
        {power.backup === 'generator' && !power.fuelled && <Badge tone="bad">No fuel money</Badge>}
      </div>
      {power.backup === 'none' && (
        <Button variant="paper" size="sm" className="self-start" onClick={() => openPhone('shop', 'power')}>
          Shop generators & inverters
        </Button>
      )}
    </div>
  );
}
