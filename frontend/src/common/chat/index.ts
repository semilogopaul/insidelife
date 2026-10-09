export { useDmFocus } from './dm-focus';
export { dmThreadsKey, fetchDmThreads, useDmThreads, useUnreadDms } from './dm-threads';
export { dmPreview, useDmAlerts, type DmSender } from './use-dm-alerts';

/** Phone deep link that opens a conversation in the Messages app: `dm:<characterId>:<handle>:<name>`. */
export function dmLink(sender: { readonly id: string; readonly handle: string; readonly name: string }): string {
  return `dm:${sender.id}:${sender.handle}:${encodeURIComponent(sender.name)}`;
}

/** Reverse of `dmLink` (null when the param isn't a DM link). */
export function parseDmLink(param: string | null): { readonly id: string; readonly handle: string; readonly name: string } | null {
  if (!param?.startsWith('dm:')) return null;
  const [, id, handle, name] = param.split(':');
  if (!id || !handle) return null;
  return { id, handle, name: name ? decodeURIComponent(name) : handle };
}
