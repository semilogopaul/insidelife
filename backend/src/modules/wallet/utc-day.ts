/** Start of the current real UTC day: daily transfer limits reset at 00:00 UTC (01:00 in Lagos). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
