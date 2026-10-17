'use client';

import { useState } from 'react';
import { normaliseAircraftName, type OwnedAircraftDto } from '@insidelife/shared';
import { Button, Money, Sheet, TextField } from '@/common/components';
import { announce, complain } from '@/common/game/feedback';
import { useHangarCommands } from '../../hooks/use-hangar';
import { NAME_MAX, airframeFor, liveryHex, nameProblem, registrationDraft, registrationFull, registrationProblem } from '../../services/hangar-rules';
import { AircraftArt } from '../AircraftArt';
import { LiverySwatches } from '../LiverySwatches';

/** The livery editor: colours and the painted name preview live; each change is paid for on its own. */
export function MakeItYoursSheet({ plane, onClose }: { readonly plane: OwnedAircraftDto | null; readonly onClose: () => void }) {
  return (
    <Sheet open={plane !== null} onClose={onClose} title={plane ? `Make ${plane.registration} yours` : ''} description="Colours, a name on the fuselage and your own registration.">
      {plane && <Editor key={plane.id} plane={plane} />}
    </Sheet>
  );
}

function Editor({ plane }: { readonly plane: OwnedAircraftDto }) {
  const { livery, name, registration } = useHangarCommands();
  const [base, setBase] = useState(plane.liveryBase);
  const [accent, setAccent] = useState(plane.liveryAccent);
  const [nameDraft, setNameDraft] = useState(plane.callName ?? '');
  const [regDraft, setRegDraft] = useState(plane.registration.replace(/^5N-/, ''));
  const nameIssue = nameProblem(nameDraft);
  const regIssue = registrationProblem(regDraft);
  const liveryChanged = base !== plane.liveryBase || accent !== plane.liveryAccent;
  const nameChanged = nameDraft.trim() !== '' && normaliseAircraftName(nameDraft) !== plane.callName;
  const regChanged = regDraft.length === 3 && registrationFull(regDraft) !== plane.registration;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="rounded-card bg-paper-2 px-3 py-4">
        <AircraftArt
          airframe={airframeFor(plane.aircraftClass)}
          base={liveryHex(base)}
          accent={liveryHex(accent)}
          name={normaliseAircraftName(nameDraft)}
          registration={registrationFull(regDraft) ?? plane.registration}
          label={`${plane.name} preview`}
        />
      </div>
      <LiverySwatches label="Base colour" value={base} onChange={setBase} />
      <LiverySwatches label="Accent colour" value={accent} onChange={setAccent} />
      <Button
        variant="danfo"
        disabled={!liveryChanged}
        loading={livery.isPending}
        onClick={() =>
          livery.mutate(
            { id: plane.id, base, accent },
            {
              onSuccess: (result) => announce('Fresh paint 🎨', { body: `${plane.registration} rolls out in new colours.`, amount: -result.fee }),
              onError: (error) => complain('The paint shop said no', error),
            },
          )
        }
      >
        Repaint · <Money amount={plane.liveryFee} compact />
      </Button>

      <TextField
        label="Name on the fuselage"
        value={nameDraft}
        maxLength={NAME_MAX}
        onChange={(event) => setNameDraft(event.target.value)}
        error={nameIssue}
        hint={`Up to ${NAME_MAX} letters, digits and spaces, like “Air Tolu”.`}
        autoComplete="off"
      />
      <Button
        variant="paper"
        disabled={!nameChanged || nameIssue !== null}
        loading={name.isPending}
        onClick={() =>
          name.mutate(
            { id: plane.id, name: nameDraft },
            {
              onSuccess: (result) => announce('Name painted', { body: `“${result.aircraft.callName}” is on the fuselage.`, amount: -result.fee }),
              onError: (error) => complain('The airport authority said no', error),
            },
          )
        }
      >
        Paint the name · <Money amount={plane.nameFee} compact />
      </Button>

      <TextField
        label="Registration"
        value={regDraft}
        onChange={(event) => setRegDraft(registrationDraft(event.target.value))}
        error={regIssue}
        hint="5N- and three letters. Each registration is unique in the world."
        autoComplete="off"
        autoCapitalize="characters"
        trailing={<span className="text-sm font-bold text-text-soft">5N-</span>}
      />
      <Button
        variant="paper"
        disabled={!regChanged || regIssue !== null}
        loading={registration.isPending}
        onClick={() =>
          registration.mutate(
            { id: plane.id, registration: regDraft },
            {
              onSuccess: (result) => announce('Re-registered', { body: `It is now ${result.aircraft.registration}.`, amount: -result.fee }),
              onError: (error) => complain('Registry said no', error),
            },
          )
        }
      >
        Re-register · <Money amount={plane.registrationFee} compact />
      </Button>
    </div>
  );
}
