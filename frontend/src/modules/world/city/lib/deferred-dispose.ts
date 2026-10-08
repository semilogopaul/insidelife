/**
 * StrictMode mounts, unmounts and remounts effects immediately. Disposing GPU resources on the first cleanup would
 * leave the remounted component holding dead objects, so disposal waits a tick and is cancelled if the same
 * resource is kept alive again.
 */
const pending = new WeakMap<object, number>();

export function keepAlive(resource: object): void {
  const timer = pending.get(resource);
  if (timer === undefined) return;
  window.clearTimeout(timer);
  pending.delete(resource);
}

export function disposeLater(resource: object, dispose: () => void): void {
  pending.set(
    resource,
    window.setTimeout(() => {
      pending.delete(resource);
      dispose();
    }, 0),
  );
}
