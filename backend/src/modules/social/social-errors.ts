import {
  ConflictException,
  DomainException,
  ForbiddenActionException,
  GameRuleException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { RuleResult } from './rules/rule-result.js';

const CONFLICT_CODES = new Set(['ALREADY_FRIENDS', 'ALREADY_HOSTING']);
const FORBIDDEN_CODES = new Set(['FRIEND_UNAVAILABLE', 'PARTY_UNAVAILABLE', 'SPRAY_UNAVAILABLE']);

/** Map a failed pure rule to the right domain exception (same code, player-friendly message). */
export function ruleException(code: string, message: string): DomainException {
  if (CONFLICT_CODES.has(code)) return new ConflictException(code, message);
  if (FORBIDDEN_CODES.has(code)) return new ForbiddenActionException(message);
  return new GameRuleException(code, message);
}

export function assertRule(result: RuleResult): void {
  if (!result.ok) throw ruleException(result.code, result.message);
}

export const playerNotFound = (): ResourceNotFoundException => new ResourceNotFoundException('Player');

/** "@Tolu_B " → "tolu_b". */
export const normaliseHandle = (handle: string): string => handle.trim().toLowerCase().replace(/^@/, '');
