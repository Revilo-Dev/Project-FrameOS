import { useEffect, useMemo, useRef, useState } from 'react';
import { createMediaService } from '../services/media';
import type { MediaAdapter, MediaEntry, MediaStorage } from '../types/media';
import { browseEntries, entryRows, type MediaFilter } from '../navigation/mediaLayout';
import type { FocusRows } from '../navigation/remote';

export function useMediaHub(adapter: MediaAdapter, active: boolean, columns: number, focus: (id: string) => void) {
  const service = useMemo(() => createMediaService(adapter), [adapter]);
  const [storages, setStorages] = useState<MediaStorage[]>([]);
  const [storage, setStorage] = useState<MediaStorage | null>(null);
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const selection = useRef({ storage, path });
  selection.current = { storage, path };
  const sequence = useRef(0);
  const discovery = useRef(0);
  const alive = useRef(false);
  const remembered = useRef(new Map<string, string>());
  const filtered = useMemo(() => browseEntries(entries, filter), [entries, filter]);
  const filterRef = useRef(filter); filterRef.current = filter;
  const openDirectory = async (drive: MediaStorage, directory: string, restore?: string) => {
    const token = ++sequence.current;
    selection.current = { storage: drive, path: directory };
    setStorage(drive); setPath(directory); setLoading(true); setError(''); setEntries([]);
    focus('media-refresh');
    try {
      const found = await service.listDirectory(drive, directory);
      if (!alive.current || token !== sequence.current) return;
      setEntries(found);
      const visible = browseEntries(found, filterRef.current);
      const index = restore ? visible.findIndex((entry) => entry.id === restore) : 0;
      focus(visible.length ? `media-entry-${Math.max(0, index)}` : 'media-refresh');
    } catch (failure) {
      if (alive.current && token === sequence.current) { setError(failure instanceof Error ? failure.message : 'This folder could not be opened.'); focus('media-refresh'); }
    } finally { if (alive.current && token === sequence.current) setLoading(false); }
  };
  const discover = async (reload: boolean) => {
    const token = ++discovery.current;
    setScanning(true);
    try {
      const drives = await service.listStorages();
      if (!alive.current || token !== discovery.current) return;
      setError('');
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
      if (alive.current && token === discovery.current) { setError(failure instanceof Error ? failure.message : 'USB storage could not be read.'); setLoading(false); focus('media-home'); }
    } finally { if (alive.current && token === discovery.current) setScanning(false); }
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
      if (change.storage.id === selection.current.storage?.id) ++sequence.current;
      if (change.state === 'unmountable') setError('This USB drive cannot be mounted. Its filesystem may not be supported.');
      if (change.state !== 'mounted' && selection.current.storage?.id === change.storage.id) {
        selection.current = { storage: null, path: '' }; setStorage(null); setEntries([]); setPath(''); focus('media-home');
      }
      void discover(change.storage.id === selection.current.storage?.id);
    }, (failure) => { if (alive.current) setError(failure.message); });
    return () => { alive.current = false; ++sequence.current; ++discovery.current; unsubscribe(); };
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
    service.invalidate(storage?.id);
    void discover(true);
  };
  const changeFilter = (next: MediaFilter) => { setFilter(next); filterRef.current = next; focus(`filter-${next}`); };
  const breadcrumbs = useMemo(() => storage ? [{ name: storage.label, path: storage.rootPath }, ...path.slice(storage.rootPath.length).split('/').filter(Boolean).map((name, index, parts) => ({ name, path: `${storage.rootPath}/${parts.slice(0, index + 1).join('/')}` }))] : [], [storage, path]);
  const rows: FocusRows = useMemo(() => [
    [{ id: 'media-home', x: 30 }, { id: 'media-refresh', x: 1720 }],
    ...(storages.length ? [storages.map((_, i) => ({ id: `drive-${i}`, x: 160 + i * 300 })), ['all', 'video', 'image', 'folder'].map((id, i) => ({ id: `filter-${id}`, x: 160 + i * 260 })), breadcrumbs.map((_, i) => ({ id: `crumb-${i}`, x: 160 + i * 250 }))] : []),
    ...entryRows(filtered.length, columns),
  ], [storages, breadcrumbs, filtered.length, columns]);
  return { storages, storage, path, entries: filtered, directoryCount: entries.length, filter, loading, scanning, error, breadcrumbs, rows, parent, refresh, changeFilter, enter,
    selectDrive: (drive: MediaStorage) => { setFilter('all'); filterRef.current = 'all'; void openDirectory(drive, drive.rootPath); },
    breadcrumb: (directory: string) => { if (storage) void openDirectory(storage, directory, remembered.current.get(`${storage.id}:${directory}`)); },
  };
}
