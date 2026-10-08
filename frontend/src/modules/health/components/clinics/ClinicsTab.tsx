'use client';

import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import {
  DISTRICTS,
  SEVERITY_LABELS,
  formatGameDuration,
  formatNaira,
  type CheckUpResultDto,
  type HealthViewDto,
} from '@insidelife/shared';
import { Badge, Button, Money, Sheet } from '@/common/components';
import { useHealthCommands } from '../../hooks/use-health';
import { announce, complain } from '@/common/game/feedback';
import { SEVERITY_TONE } from '../../services/health-rules';
import { GoThere } from '@/common/components';

/** Pharmacies and hospitals: what a check-up costs and takes at each, the nearest one, and the check-up itself. */
export function ClinicsTab({ view }: { readonly view: HealthViewDto }) {
  const { checkUp } = useHealthCommands();
  const [result, setResult] = useState<CheckUpResultDto | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {view.doctorsStrike && (
        <p className="rounded-card bg-danfo-soft p-3 text-sm font-bold">
          Resident doctors are on strike: public hospitals are slower and less reliable right now.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {view.facilities.map((facility) => {
          const here = view.here?.facility === facility.type;
          return (
            <li key={facility.type} className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="type-title text-lg leading-tight">{facility.label}</p>
                  {facility.strike && <Badge tone="warn">Strike</Badge>}
                </div>
                <p className="text-sm text-text-soft">{facility.blurb}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-chip bg-paper px-3 py-2">
                  <dt className="text-xs font-bold text-text-soft">Check-up</dt>
                  <dd className="font-bold">
                    <Money amount={facility.checkUpYouPay} />
                    {facility.checkUpYouPay < facility.checkUpPrice && (
                      <span className="block text-xs font-normal text-naira">HMO covers the rest</span>
                    )}
                  </dd>
                </div>
                <div className="rounded-chip bg-paper px-3 py-2">
                  <dt className="text-xs font-bold text-text-soft">Wait + visit</dt>
                  <dd className="font-bold">{formatGameDuration(facility.checkUpMinutes)}</dd>
                </div>
              </dl>
              {facility.nearest && (
                <p className="text-sm">
                  Nearest: <strong>{facility.nearest.name}</strong>,{' '}
                  {DISTRICTS[facility.nearest.districtId].name}
                  {!facility.nearest.open && <span className="text-okada"> · closed now</span>}
                </p>
              )}
              {here && view.here ? (
                <Button
                  icon={<ClipboardCheck size={18} aria-hidden />}
                  loading={checkUp.isPending}
                  disabled={!view.here.open}
                  onClick={() =>
                    checkUp.mutate(undefined, {
                      onSuccess: (response) => {
                        setResult(response.checkUp);
                        announce('Check-up done', {
                          body: response.checkUp.message,
                          amount: -response.checkUp.paid,
                        });
                      },
                      onError: (error) => complain('No check-up today', error),
                    })
                  }
                >
                  Get a check-up here · <Money amount={facility.checkUpYouPay} />
                </Button>
              ) : (
                facility.nearest && (
                  <GoThere venueId={facility.nearest.venueId} venueName={facility.nearest.name} />
                )
              )}
            </li>
          );
        })}
      </ul>
      <Sheet
        open={result !== null}
        onClose={() => setResult(null)}
        title="Your results"
        description={result ? `${result.venueName} · you paid ${formatNaira(result.paid)}` : undefined}
        size="sm"
      >
        {result && (
          <div className="flex flex-col gap-3 pb-2 text-sm">
            <p>{result.message}</p>
            {result.findings.length === 0 ? (
              <p className="rounded-card bg-naira-soft p-3 font-bold text-naira">
                Nothing found. Clean bill of health.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {result.findings.map((finding) => (
                  <li key={finding.conditionId} className="rounded-card bg-paper-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">
                        {finding.label}
                        {finding.newlyDiagnosed && <span className="ml-1.5 text-xs text-okada">New</span>}
                      </span>
                      <Badge tone={SEVERITY_TONE[finding.severity]}>
                        {SEVERITY_LABELS[finding.severity]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-text-soft">{finding.advice}</p>
                  </li>
                ))}
              </ul>
            )}
            {result.unexplained > 0 && (
              <p className="text-text-soft">
                They couldn’t explain {result.unexplained} symptom{result.unexplained === 1 ? '' : 's'} here —
                a hospital can run more tests.
              </p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
