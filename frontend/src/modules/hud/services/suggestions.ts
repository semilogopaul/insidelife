import { TRANSPORT, formatNaira, type GameMinute, type SuggestionDto, type TransportMode } from '@insidelife/shared';

/** Modes you book (someone else drives). Walking and your own car are GPS-only. */
export function isBookable(mode: TransportMode): boolean {
  return mode !== 'walk' && mode !== 'car';
}

/** "4 min by danfo", "on foot", "here". */
export function etaPhrase(etaMinutes: number, mode: TransportMode): string {
  if (etaMinutes <= 0) return 'here';
  const how = mode === 'walk' ? 'on foot' : mode === 'car' ? 'by car' : `by ${TRANSPORT[mode].label.toLowerCase() === 'brt' ? 'BRT' : TRANSPORT[mode].label.toLowerCase()}`;
  return `${etaMinutes} min ${how}`;
}

/** The one-line chip text: "You’re hungry — Shitta Amala, 4 min away". */
export function chipLabel(suggestion: SuggestionDto): string {
  const target = suggestion.target;
  if (!target) return suggestion.title;
  if (target.etaMinutes <= 0) return `${suggestion.title} — you’re at ${target.name}`;
  return `${suggestion.title} — ${target.name}, ${target.etaMinutes} min away`;
}

export type SuggestionAction =
  | { readonly kind: 'directions'; readonly label: string; readonly locationId: string; readonly name: string }
  | { readonly kind: 'ride'; readonly label: string; readonly locationId: string; readonly mode: TransportMode; readonly fare: number }
  | { readonly kind: 'act'; readonly label: string; readonly actionId: string }
  | { readonly kind: 'goals'; readonly label: string };

/** What the expanded chip offers, primary first. */
export function suggestionActions(suggestion: SuggestionDto, actionLabel: (actionId: string) => string | null): readonly SuggestionAction[] {
  const actions: SuggestionAction[] = [];
  const target = suggestion.target;
  const here = !target || target.etaMinutes <= 0;
  if (here && suggestion.actionId) {
    const label = actionLabel(suggestion.actionId);
    if (label) actions.push({ kind: 'act', label, actionId: suggestion.actionId });
  }
  if (target && target.etaMinutes > 0) {
    actions.push({ kind: 'directions', label: 'Directions', locationId: target.locationId, name: target.name });
    if (isBookable(target.mode)) {
      actions.push({
        kind: 'ride',
        label: `Take ${TRANSPORT[target.mode].label}${target.fare > 0 ? ` · ${formatNaira(target.fare)}` : ''}`,
        locationId: target.locationId,
        mode: target.mode,
        fare: target.fare,
      });
    }
  }
  if (suggestion.kind === 'goal') actions.push({ kind: 'goals', label: 'See goal' });
  return actions;
}

/** When the work shift or lecture block behind a schedule suggestion starts. */
export function scheduleStart(suggestion: SuggestionDto): GameMinute | null {
  return suggestion.kind === 'schedule' ? (suggestion.schedule?.startsAt ?? null) : null;
}

/** Work/lectures start within `withinMinutes` of game time (or already started), so a routine prompt is due. */
export function isRoutineDue(suggestion: SuggestionDto, now: GameMinute, withinMinutes = 60): boolean {
  const start = scheduleStart(suggestion);
  if (start === null || !suggestion.target) return false;
  return start - now <= withinMinutes;
}
