/** Screens inside the Bank app (also accepted as the phone deep-link param: `openPhone('bank', 'topup')`). */
export const BANK_SCREENS = ['home', 'send', 'topup', 'savings', 'statement'] as const;
export type BankScreen = (typeof BANK_SCREENS)[number];

export function isBankScreen(value: string | null): value is BankScreen {
  return value !== null && (BANK_SCREENS as readonly string[]).includes(value);
}
