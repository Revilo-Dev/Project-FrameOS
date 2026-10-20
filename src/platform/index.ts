import { BrowserAdapter } from './BrowserAdapter';
import { TizenAdapter } from './TizenAdapter';
import type { PlatformAdapter } from './PlatformAdapter';
import { MockMediaAdapter } from './MockMediaAdapter';

export function createPlatform(runtime: unknown = typeof window === 'undefined' ? undefined : window): PlatformAdapter {
  try {
    const host = runtime as { tizen?: { application?: unknown; filesystem?: unknown } };
    if (host?.tizen?.application || host?.tizen?.filesystem) return new TizenAdapter(runtime);
    // Production bundles replace DEV with false and remove all fixture creation.
    if (import.meta.env?.DEV) {
      const search = (runtime as { location?: { search?: string } })?.location?.search ?? '';
      if (new URLSearchParams(search).get('mockUsb') === '1') return new BrowserAdapter(new MockMediaAdapter());
    }
    return new BrowserAdapter();
  } catch {
    return new BrowserAdapter();
  }
}
