import { useEffect, useMemo, useRef, useState } from 'react';
import { watchLifecycle } from '../services/lifecycle';
import { createMediaService } from '../services/media';
import { MediaError, type MediaAdapter, type MediaEntry, type MediaStorage } from '../types/media';
import { browseEntries, entryRows, mediaHeaderRows, type MediaFilter, type MediaSort } from '../navigation/mediaLayout';
import type { FocusRows } from '../navigation/remote';
import { isMediaHidden, type MediaPreferences } from '../services/mediaPreferences';

export function useMediaHub(adapter: MediaAdapter, active: boolean, columns: number, focus: (id: string) => void, preferences: MediaPreferences, onDisconnect: (storageId: string, selected: boolean) => void) {
  const service = useMemo(() => createMediaService(adapter), [adapter]);
  const [storages, setStorages] = useState<MediaStorage[]>([]);
  const [storage, setStorage] = useState<MediaStorage | null>(null);
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [sort, setSort] = useState<MediaSort>('natural');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const scanGate = useRef(false);
  const directoryGate = useRef<{ key: string; token: number } | null>(null);
  const queuedDiscovery = useRef(false);
  const resumeRef = useRef(() => {});
  const report = (failure: unknown) => {
    const code = failure instanceof MediaError ? failure.code : 'inaccessible';
    setErrorCode(code); setRecovery(code === 'timeout' || code === 'inaccessible');
    setError(failure instanceof Error ? failure.message : 'This folder could not be opened.');
  };

  const selection = useRef({ storage, path });
  selection.current = { storage, path };
  const sequence = useRef(0);
  const discovery = useRef(0);
  const alive = useRef(false);
  const remembered = useRef(new Map<string, string>());
  const hidden = useMemo(() => new Set(preferences.hidden), [preferences.hidden]);
  const visibility = useRef({ showHidden: preferences.showHidden, hidden });
  visibility.current = { showHidden: preferences.showHidden, hidden };
  const disconnected = useRef(onDisconnect); disconnected.current = onDisconnect;
  const visibleEntries = useMemo(() => entries.filter(entry => preferences.showHidden || !isMediaHidden(entry, hidden)), [entries, hidden, preferences.showHidden]);
  const filtered = useMemo(() => browseEntries(visibleEntries, filter, sort), [visibleEntries, filter, sort]);
  const sortRef = useRef(sort); sortRef.current = sort;
  const filterRef = useRef(filter); filterRef.current = filter;
  const openDirectory = async (drive: MediaStorage, directory: string, restore?: string) => {
    const requestKey = JSON.stringify([drive.id, directory]);
    if (directoryGate.current?.key === requestKey) return;
    const token = ++sequence.current;
    directoryGate.current = { key: requestKey, token };
    selection.current = { storage: drive, path: directory };
    setStorage(drive); setPath(directory); setLoading(true); setError(''); setRecovery(false); setErrorCode('');
    if (path !== directory || storage?.id !== drive.id) setEntries([]);
    focus('media-options');
    try {
      const cached = await service.cachedDirectory(drive, directory);
      if (!alive.current || token !== sequence.current) return;
      if (cached) {
        setEntries(cached); setLoading(false);
        const visible = browseEntries(cached.filter(entry => visibility.current.showHidden || !isMediaHidden(entry, visibility.current.hidden)), filterRef.current, sortRef.current);
        const index = restore ? visible.findIndex(entry => entry.id === restore) : 0;
        focus(visible.length ? `media-entry-${Math.max(0, index)}` : 'media-options');
      }
      const found = await service.listDirectory(drive, directory);
      if (!alive.current || token !== sequence.current) return;
      setEntries(found);
      const visible = browseEntries(found.filter(entry => visibility.current.showHidden || !isMediaHidden(entry, visibility.current.hidden)), filterRef.current, sortRef.current);
      const rememberedId = remembered.current.get(`${drive.id}:${directory}`) || restore;
      const index = rememberedId ? visible.findIndex((entry) => entry.id === rememberedId) : 0;
      focus(visible.length ? `media-entry-${Math.max(0, index)}` : 'media-options');
    } catch (failure) {
      if (alive.current && token === sequence.current) { report(failure); focus(failure instanceof MediaError && ['timeout', 'inaccessible'].includes(failure.code) ? 'media-recovery-refresh' : 'media-options'); }
    } finally { if (directoryGate.current?.token === token) directoryGate.current = null; if (alive.current && token === sequence.current) setLoading(false); }
  };
  const discover = async (reload: boolean) => {
    if (scanGate.current) return;
    scanGate.current = true;
    const token = ++discovery.current;
    setScanning(true);
    try {
      const drives = await service.listStorages();
      if (!alive.current || token !== discovery.current) return;
      setError(''); setRecovery(false); setErrorCode('');
      setStorages(drives);
      const previous = selection.current;
      const selected = drives.find((drive) => drive.id === previous.storage?.id);
      if (!selected) {
        ++sequence.current;
        setEntries([]); setStorage(null); setPath(''); setLoading(false);
        selection.current = { storage: null, path: '' };
        if (drives[0]) await openDirectory(drives[0], drives[0].rootPath);
        else focus('media-home');
      } else if (reload) await openDirectory(selected, previous.path || selected.rootPath, remembered.current.get(`${selected.id}:${previous.path}`));
    } catch (failure) {
      if (alive.current && token === discovery.current) { report(failure); setLoading(false); focus(failure instanceof MediaError && ['timeout', 'inaccessible'].includes(failure.code) ? 'media-recovery-refresh' : 'media-options'); }
    } finally { if (token === discovery.current) { scanGate.current = false; if (alive.current) { setScanning(false); if (queuedDiscovery.current) { queuedDiscovery.current = false; void discover(true); } } } }
  };
  useEffect(() => {
    if (!active) return;
    alive.current = true;
    // USB changes may have occurred while Home was visible and no watcher ran.
    service.invalidate();
    setError('');
    void discover(true);
    const unsubscribe = service.subscribeStorageChanges((change) => {
      if (!alive.current) return;
      if (change.storage.id === selection.current.storage?.id) { ++sequence.current; directoryGate.current = null; }
      if (change.state !== 'mounted') disconnected.current(change.storage.id, change.storage.id === selection.current.storage?.id);
      if (change.state !== 'mounted') setStorages(current => current.filter(drive => drive.id !== change.storage.id));
      if (change.state !== 'mounted' && selection.current.storage?.id === change.storage.id) {
        selection.current = { storage: null, path: '' }; setStorage(null); setEntries([]); setPath(''); setLoading(false); setRecovery(false); setError(''); focus('media-home');
      }
      if (scanGate.current) queuedDiscovery.current = true;
      else void discover(change.storage.id === selection.current.storage?.id);
    }, (failure) => { if (alive.current) setError(failure.message); });
    return () => { alive.current = false; ++sequence.current; ++discovery.current; directoryGate.current = null; scanGate.current = false; queuedDiscovery.current = false; unsubscribe(); };
    // State is read through selection/filter refs; don't resubscribe on each folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, service]);
  const remember = (entry: MediaEntry) => {
    remembered.current.set(`${entry.storageId}:${entry.parentPath}`, entry.id);
    while (remembered.current.size > 64) remembered.current.delete(remembered.current.keys().next().value!);
  };
  const enter = (entry: MediaEntry) => { if (entry.isDirectory && storage) { remember(entry); void openDirectory(storage, entry.path); } };
  const parent = () => {
    if (!storage || path === storage.rootPath) return false;
    const directory = path.slice(0, path.lastIndexOf('/')) || storage.rootPath;
    void openDirectory(storage, directory, remembered.current.get(`${storage.id}:${directory}`));
    return true;
  };
  const refresh = () => {
    if (scanGate.current || directoryGate.current) return;
    service.invalidate(storage?.id);
    void discover(true);
  };
  resumeRef.current = refresh;
  useEffect(() => { if (!active) return; return watchLifecycle(document, window, () => resumeRef.current()); }, [active]);
  const changeFilter = (next: MediaFilter) => { setFilter(next); filterRef.current = next; focus(`filter-${next}`); };
  const breadcrumbs = useMemo(() => storage ? [{ name: storage.label, path: storage.rootPath }, ...path.slice(storage.rootPath.length).split('/').filter(Boolean).map((name, index, parts) => ({ name, path: `${storage.rootPath}/${parts.slice(0, index + 1).join('/')}` }))] : [], [storage, path]);
  const rows: FocusRows = useMemo(() => recovery ? [...mediaHeaderRows(), [{ id: 'media-recovery-refresh', x: 960 }]] : [
    ...mediaHeaderRows(),
    ...(storages.length > 1 ? [storages.map((_, i) => ({ id: `drive-${i}`, x: 160 + i * 300 }))] : []),
    ...(breadcrumbs.length ? [breadcrumbs.map((_, i) => ({ id: `crumb-${i}`, x: 160 + i * 250 }))] : []),
    ...entryRows(filtered.length, columns),
  ], [storages, breadcrumbs, filtered.length, columns, recovery]);
  return { rememberFocus: remember, recovery, errorCode, clearCache: () => service.clearCache(), storages, storage, path, entries: filtered, allEntries: visibleEntries, hidden, directoryCount: entries.length, filter, sort, changeSort: (next: MediaSort) => { setSort(next); sortRef.current = next; }, loading, scanning, error, breadcrumbs, rows, parent, refresh, changeFilter, enter,
    selectDrive: (drive: MediaStorage) => { setFilter('all'); filterRef.current = 'all'; void openDirectory(drive, drive.rootPath); },
    breadcrumb: (directory: string) => { if (storage) void openDirectory(storage, directory, remembered.current.get(`${storage.id}:${directory}`)); },
  };
}
