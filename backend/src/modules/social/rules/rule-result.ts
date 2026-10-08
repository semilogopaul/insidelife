/** Outcome of a pure rule check: services turn a failure into a `GameRuleException` with the same code and message. */
export type RuleResult = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

export const OK: RuleResult = { ok: true };

export const fail = (code: string, message: string): RuleResult => ({ ok: false, code, message });
