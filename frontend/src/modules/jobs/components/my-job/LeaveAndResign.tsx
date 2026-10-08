'use client';

import { Palmtree } from 'lucide-react';
import { useState } from 'react';
import { formatDate, type EmploymentDto } from '@insidelife/shared';
import { Button, Money, Section, Sheet } from '@/common/components';
import { useEmploymentCommands } from '../../hooks/use-jobs-data';
import { announce, complain } from '@/common/game/feedback';
import { ConfirmSheet } from '@/common/components';
import { Stepper } from '@/common/components';

const MAX_LEAVE_REQUEST = 14;

/** Leave balance with a booking sheet, and the resign exit (with a confirm step). */
export function LeaveAndResign({ employment }: { readonly employment: EmploymentDto }) {
  const { leave, resign } = useEmploymentCommands();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [days, setDays] = useState(1);
  const balance = employment.leave;
  const maxDays = Math.min(balance.remainingDays, MAX_LEAVE_REQUEST);

  return (
    <>
      <Section
        title="Leave"
        aside={`${balance.remainingDays} of ${balance.entitlementDays} days left this year`}
      >
        <div className="flex items-center gap-3 rounded-card bg-paper-2 p-3.5">
          <Palmtree size={22} aria-hidden className="shrink-0 text-lagoon" />
          <p className="min-w-0 flex-1 text-sm text-text-soft">
            {balance.onLeave && balance.until !== null
              ? `On leave until ${formatDate(balance.until)}.`
              : 'Paid days off. Your routine skips work while you’re away.'}
          </p>
          <Button
            variant="paper"
            size="sm"
            disabled={balance.onLeave || maxDays < 1}
            onClick={() => setLeaveOpen(true)}
          >
            Book leave
          </Button>
        </div>
      </Section>

      <div className="flex flex-col items-center gap-1 border-t border-line pt-4 text-center">
        <Button
          variant="ghost"
          className="text-okada hover:bg-okada-soft"
          onClick={() => setResignOpen(true)}
        >
          Resign from {employment.employer}
        </Button>
        <p className="text-xs text-text-faint">You can always apply somewhere else.</p>
      </div>

      <Sheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Book leave"
        description="Starts tomorrow. Paid, and nobody will call you (much)."
        size="sm"
      >
        <div className="flex flex-col gap-4 pb-1">
          <Stepper
            label="Days"
            value={Math.min(days, Math.max(1, maxDays))}
            min={1}
            max={Math.max(1, maxDays)}
            onChange={setDays}
            unit={days === 1 ? 'day' : 'days'}
          />
          <Button
            size="lg"
            block
            loading={leave.isPending}
            onClick={() =>
              leave.mutate(Math.min(days, maxDays), {
                onSuccess: () => {
                  setLeaveOpen(false);
                  announce('Leave approved', {
                    body: `${days} day${days === 1 ? '' : 's'} off, starting tomorrow. Enjoy am!`,
                    serverNotifies: true,
                  });
                },
                onError: (error) => complain('Leave not approved', error),
              })
            }
          >
            Book {Math.min(days, maxDays)} day{days === 1 ? '' : 's'}
          </Button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={resignOpen}
        onClose={() => setResignOpen(false)}
        title={`Resign from ${employment.employer}?`}
        description="Your salary stops today. This month’s pay is pro-rated and paid out now."
        confirmLabel="Resign"
        loading={resign.isPending}
        onConfirm={() =>
          resign.mutate(undefined, {
            onSuccess: (result) => {
              setResignOpen(false);
              announce('You resigned', {
                body: result.message,
                amount: result.finalPay?.net,
                tone: 'neutral',
                serverNotifies: true,
              });
            },
            onError: (error) => complain('Couldn’t resign', error),
          })
        }
      >
        <p className="rounded-card bg-paper-2 p-3 text-sm">
          You’ve been here {employment.yearsInRole.toFixed(1)} years as {employment.title}. Monthly gross
          today: <Money amount={employment.monthlyPayNaira} className="font-bold" />.
        </p>
      </ConfirmSheet>
    </>
  );
}
