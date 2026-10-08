const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dom-account balances are US cents: 12345 → "$123.45". */
export function formatUsdCents(cents: number): string {
  return usd.format(cents / 100);
}
