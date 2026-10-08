'use client';

import { Crown, TrendingUp } from 'lucide-react';
import { formatDate, type EmploymentDto, type GameMinute } from '@insidelife/shared';
import { Badge, Button, Section } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useEmploymentCommands } from '../../hooks/use-jobs-data';
import { announce, complain } from '@/common/game/feedback';
import { relativeGameTime } from '@/common/utils/game-time';
import { chanceLabel, describeRequirement, formatPay } from '../../services/job-rules';
import { Checklist, type ChecklistItem } from '../Checklist';

/** Promotion outlook: next title and pay, what's still missing, and the ask. */
export function PromotionCard({
  employment,
  now,
}: {
  readonly employment: EmploymentDto;
  readonly now: GameMinute;
}) {
  const { promotion: outlook } = employment;
  const { promotion } = useEmploymentCommands();
  const { data: snapshot } = useSnapshot();

  if (outlook.nextTitle === null) {
    return (
      <Section title="Promotion">
        <p className="flex items-center gap-3 rounded-card bg-paper-2 p-3.5 text-sm">
          <Crown size={22} aria-hidden className="shrink-0 text-danfo-deep" />
          You’re at the top of this ladder. Oga at the top! Bigger money now means a new job or your own
          business.
        </p>
      </Section>
    );
  }

  const context = snapshot ? { age: snapshot.character.age, skills: snapshot.character.skills } : null;
  const timeDone = outlook.eligibleFrom === null || outlook.eligibleFrom <= now;
  const items: ChecklistItem[] = [
    {
      key: 'time',
      label: timeDone
        ? 'Time in level done'
        : `Time in level: from ${formatDate(outlook.eligibleFrom ?? now)}`,
      met: timeDone,
      hint: outlook.eligibleFrom !== null ? relativeGameTime(outlook.eligibleFrom, now) : undefined,
    },
    ...outlook.gates.map((gate) => ({
      key: gate.key,
      label: context ? describeRequirement(gate, context).text : gate.label,
      met: gate.met,
      hint: context ? describeRequirement(gate, context).hint : undefined,
    })),
  ];

  const ask = (): void =>
    promotion.mutate(undefined, {
      onSuccess: (result) => {
        if (result.promoted) {
          gameEvents.emit('celebrate', { kind: 'milestone', title: result.title, body: result.message });
          announce(result.title, { body: result.message, sfx: 'level-up', serverNotifies: true });
        } else {
          announce(result.title, {
            body: result.message,
            tone: 'neutral',
            sfx: 'notification',
            serverNotifies: true,
          });
        }
      },
      onError: (error) => complain('Oga said not now', error),
    });

  return (
    <Section
      title="Promotion"
      aside={outlook.ready ? <Badge tone="good">Ready to ask</Badge> : <Badge>Not yet</Badge>}
    >
      <div className="rounded-card bg-paper-2 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-text-soft">Next level</p>
            <p className="type-title text-xl leading-tight">{outlook.nextTitle}</p>
          </div>
          {outlook.nextPay !== null && (
            <p className="shrink-0 text-right">
              <span className="block text-xs font-bold text-text-soft">Pay</span>
              <span className="type-figure text-lg">{formatPay(outlook.nextPay, employment.currency)}</span>
            </p>
          )}
        </div>
        <Checklist items={items} className="mt-3" />
        {outlook.breakout && (
          <p className="mt-3 text-xs text-text-soft">
            This level only comes with a breakout moment — keep grinding and watch your life-event cards.
          </p>
        )}
        {outlook.blockedReason && !outlook.ready && (
          <p className="mt-3 text-sm font-bold text-text-soft">{outlook.blockedReason}</p>
        )}
        <Button
          className="mt-3.5"
          block
          variant={outlook.ready ? 'danfo' : 'paper'}
          icon={<TrendingUp size={18} aria-hidden />}
          disabled={!outlook.ready}
          loading={promotion.isPending}
          onClick={ask}
        >
          {outlook.ready
            ? `Ask for a promotion · ${chanceLabel(outlook.estimatedChance)} chance`
            : 'Ask for a promotion'}
        </Button>
      </div>
    </Section>
  );
}
