import type { EmploymentDto, GameMinute } from '@insidelife/shared';
import { formatDate } from '@insidelife/shared';
import { Badge, Money, Section, StatTile } from '@/common/components';
import { relativeGameTime } from '@/common/utils/game-time';
import { formatPay, payslipLines } from '../../services/job-rules';
import { Receipt } from '@/common/components';

/** Monthly pay and this month's payslip preview (gross → PAYE → pension → take-home). */
export function PayCard({
  employment,
  now,
}: {
  readonly employment: EmploymentDto;
  readonly now: GameMinute;
}) {
  const preview = payslipLines(employment.payslipPreview);
  const last = employment.lastPayslip ? payslipLines(employment.lastPayslip) : null;
  const dollars = employment.currency === 'USD';

  return (
    <Section title="Pay" aside={dollars ? 'Paid in dollars, converted on payday' : 'Paid at month end'}>
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Monthly gross"
          value={
            dollars ? (
              formatPay(employment.monthlyPay, 'USD')
            ) : (
              <Money amount={employment.monthlyPay} compact />
            )
          }
          hint={
            dollars ? (
              <>
                ≈ <Money amount={employment.monthlyPayNaira} compact /> today
              </>
            ) : undefined
          }
        />
        <StatTile
          tone="danfo"
          label="Take-home this month"
          value={<Money amount={preview.net} compact />}
          hint="If attendance holds"
        />
      </div>
      {employment.salaryHeldUntil !== null && employment.salaryHeldUntil > now && (
        <p className="flex items-start gap-2 rounded-card bg-danfo-soft px-3 py-2.5 text-sm">
          <Badge tone="warn">Salary delay</Badge>
          <span>
            Government payroll is holding salaries until {formatDate(employment.salaryHeldUntil)} (
            {relativeGameTime(employment.salaryHeldUntil, now)}). It will come — all of it.
          </span>
        </p>
      )}
      <Receipt
        lines={preview.lines}
        total={{ label: 'Take-home', amount: preview.net }}
        caption="This month’s payslip preview. Skipped shifts cut your gross."
      />
      {last && (
        <details className="group rounded-card ring-1 ring-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
            Last payslip
            <span className="flex items-center gap-2">
              <Money amount={last.net} className="text-naira" />
              <span aria-hidden className="text-text-faint transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          </summary>
          <Receipt
            lines={last.lines}
            total={{ label: 'Paid to your account', amount: last.net }}
            className="m-2 mt-0"
          />
        </details>
      )}
    </Section>
  );
}
