import { greenhouseAdapter } from './greenhouse';
import type { PlatformAdapter } from './types';

/** Every supported platform. Register new adapters here. */
const ADAPTERS: readonly PlatformAdapter[] = [greenhouseAdapter];

/** Picks the adapter whose `hosts` cover this page's hostname. */
export function findAdapter(hostname: string): PlatformAdapter | undefined {
  return ADAPTERS.find((adapter) =>
    adapter.hosts.some(
      (host) => host === hostname || hostname.endsWith(`.${host}`),
    ),
  );
}