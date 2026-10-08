'use client';

import { useState } from 'react';
import { DISTRICTS, DISTRICT_IDS, type BusinessTypeDto, type DistrictId } from '@insidelife/shared';
import { Badge, HoldButton, Money, Sheet, TextField } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useBusinessCommands } from '../../hooks/use-jobs-data';
import { announce, complain } from '@/common/game/feedback';
import { Receipt } from '@/common/components';
import { SelectField } from '@/common/components';
import { RISK_BADGE, traitLabel } from './business-labels';

const NAME_MIN = 2;
const NAME_MAX = 40;

/** Name it, pick the district, see the capital, hold to start. */
export function StartBusinessSheet({
  type,
  onClose,
}: {
  readonly type: BusinessTypeDto | null;
  readonly onClose: () => void;
}) {
  return (
    <Sheet
      open={type !== null}
      onClose={onClose}
      title={type ? `Start a ${type.label.toLowerCase()}` : ''}
      description={type?.blurb}
    >
      {type && <StartForm key={type.id} type={type} onDone={onClose} />}
    </Sheet>
  );
}

function StartForm({ type, onDone }: { readonly type: BusinessTypeDto; readonly onDone: () => void }) {
  const { data: snapshot } = useSnapshot();
  const { start } = useBusinessCommands();
  const districts = type.allowedDistricts ?? DISTRICT_IDS;
  const home = snapshot?.character.homeDistrictId;
  const [name, setName] = useState(() =>
    (snapshot ? `${snapshot.character.firstName}’s ${type.label.replace(/\s*\(.*\)$/, '')}` : '').slice(
      0,
      NAME_MAX,
    ),
  );
  const [districtId, setDistrictId] = useState<DistrictId>(
    home && districts.includes(home) ? home : (districts[0] ?? 'yaba'),
  );

  const trimmed = name.trim();
  const nameError =
    trimmed.length < NAME_MIN
      ? 'Give it a name (2+ letters).'
      : trimmed.length > NAME_MAX
        ? `Keep it under ${NAME_MAX} characters.`
        : null;
  const tooYoung = snapshot !== undefined && snapshot.character.age < type.minAge;
  const blocker = tooYoung
    ? `You must be ${type.minAge}+ to run this.`
    : !type.affordable
      ? 'You don’t have this capital yet.'
      : null;
  const risk = RISK_BADGE[type.risk];

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={risk.tone}>{risk.label}</Badge>
        <Badge>{type.managementHours}h a month hands-on</Badge>
        {type.keyTraits.slice(0, 3).map((trait) => (
          <Badge key={trait} tone="info">
            {traitLabel(trait)}
          </Badge>
        ))}
      </div>
      <TextField
        label="Business name"
        value={name}
        maxLength={NAME_MAX}
        onChange={(event) => setName(event.target.value)}
        error={trimmed.length > 0 ? nameError : null}
        hint="Customers will see it on the signboard."
      />
      <SelectField
        label="District"
        value={districtId}
        onChange={setDistrictId}
        options={districts.map((id) => ({
          value: id,
          label: `${DISTRICTS[id].name} — ${DISTRICTS[id].tagline}`,
        }))}
      />
      <Receipt
        lines={[
          {
            label: 'Start-up capital',
            amount: type.capital,
            note: 'Stock, equipment, first month of rent and staff',
          },
        ]}
        total={{ label: 'You pay now', amount: type.capital }}
        caption={
          <>
            A good month brings <Money amount={type.typicalMonthlyProfit.low} compact /> to{' '}
            <Money amount={type.typicalMonthlyProfit.high} compact /> profit per unit. Bad months happen.
          </>
        }
      />
      {blocker && <p className="text-sm font-bold text-okada">{blocker}</p>}
      <HoldButton
        disabled={blocker !== null || nameError !== null || start.isPending}
        onConfirm={() =>
          start.mutate(
            { typeId: type.id, name: trimmed, districtId },
            {
              onSuccess: (business) => {
                announce(`${business.name} is open!`, {
                  body: 'First month’s numbers land at month end.',
                  amount: -type.capital,
                  sfx: 'celebration',
                  serverNotifies: true,
                });
                onDone();
              },
              onError: (error) => complain('Couldn’t start the business', error),
            },
          )
        }
      >
        Hold to start · <Money amount={type.capital} compact />
      </HoldButton>
    </div>
  );
}
