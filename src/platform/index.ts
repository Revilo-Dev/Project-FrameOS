import { BrowserAdapter } from './BrowserAdapter';
import { TizenAdapter } from './TizenAdapter';
import type { PlatformAdapter } from './PlatformAdapter';

export function createPlatform(runtime: unknown = window): PlatformAdapter {
  try {
    const host = runtime as { tizen?: { application?: unknown } };
    return host?.tizen?.application ? new TizenAdapter() : new BrowserAdapter();
  } catch {
    return new BrowserAdapter();
  }
}
