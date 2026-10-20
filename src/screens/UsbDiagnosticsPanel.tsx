import { useEffect, useMemo, useRef, useState } from 'react';
import { FocusButton } from '../components/FocusButton';
import { UsbDiagnostics } from '../platform/UsbDiagnostics';
import type { MediaAdapter } from '../types/media';

const when = (at: number | null) => at ? new Date(at).toLocaleTimeString('en-AU') : 'Not scanned';
export function UsbDiagnosticsPanel({ adapter, focused, focus }: { adapter: MediaAdapter; focused: string; focus(id: string): void }) {
  const diagnostics = useMemo(() => adapter.diagnostics || new UsbDiagnostics(false, false), [adapter]);
  const [state, setState] = useState(diagnostics.get);
  const [busy, setBusy] = useState(false);
  const records = useRef<HTMLDivElement>(null);
  const [scanStatus, setScanStatus] = useState('Ready to scan mounted USB roots.');
  useEffect(() => {
    setState(diagnostics.get());
    const unsubscribe = diagnostics.subscribe(() => setState(diagnostics.get()));
    void diagnostics.inspectManifest();
    return unsubscribe;
  }, [diagnostics]);
  const rescan = async () => {
    if (busy) return;
    if (!adapter.available) { setScanStatus('Tizen filesystem API unavailable. Run this installed application on the TV.'); return; }
    setBusy(true); setScanStatus('Discovering USB storage…');
    try {
      const drives = await adapter.listStorages();
      if (!drives.length) setScanStatus('No USB connected. No mounted external storage was reported by Tizen.');
      else {
        let count = 0;
        for (const drive of drives) count += (await adapter.listDirectory(drive, drive.rootPath)).length;
        setScanStatus(`USB detected: ${drives.length} drive${drives.length === 1 ? '' : 's'}, ${count} root entries. ${count ? 'Open Media to browse.' : 'The root directories are empty.'}`);
      }
    } catch (error) { setScanStatus(error instanceof Error ? error.message : 'USB scan failed. See the native error below.'); }
    finally { setBusy(false); }
  };
  return <div className="usb-diagnostics">
    <div className="diagnostic-action"><div><h3>Native USB diagnostics</h3><p>Reads mounted roots only. No USB files are changed.</p></div><FocusButton id="usb-rescan" focused={focused} onFocused={focus} className="text-button" onClick={() => void rescan()} aria-disabled={busy}>{busy ? 'Scanning…' : 'Rescan USB'}</FocusButton></div>
    <p className="diagnostic-status" role="status">{scanStatus}</p>
    <dl className="diagnostic-facts"><dt>Tizen runtime available</dt><dd>{state.runtimeAvailable ? 'Yes' : 'No'}</dd><dt>Filesystem API available</dt><dd>{state.filesystemAvailable ? 'Yes' : 'No'}</dd><dt>Filesystem read privilege declared</dt><dd>{state.readPrivilegeDeclared === null ? 'Unknown — manifest not readable' : state.readPrivilegeDeclared ? 'Yes' : 'No — install the signed policy-enabled package'}</dd><dt>Detected storage count</dt><dd>{state.storages.length} total · {state.storages.filter(drive => drive.type === 'EXTERNAL' && drive.state === 'MOUNTED').length} mounted external</dd><dt>Last successful USB scan</dt><dd>{when(state.lastScan)}</dd></dl>
    <div className="diagnostic-records" ref={records}><table><caption>Reported storage labels, types and states</caption><thead><tr><th>Label</th><th>Type</th><th>State</th></tr></thead><tbody>{state.storages.map((drive, i) => <tr key={`${drive.label}-${i}`}><td>{drive.label}</td><td>{drive.type}</td><td>{drive.state}</td></tr>)}</tbody></table>
      <h4>Resolved directories / entry counts</h4>{state.roots.length ? state.roots.map(root => <p key={`${root.storage}:${root.path}`}>{root.path} · {root.entries} entries · {root.skipped} skipped · {when(root.at)}</p>) : <p>No directory has been resolved yet.</p>}
      <h4>Last filesystem error</h4>{state.lastError ? <p className="diagnostic-error">{state.lastError.operation} · {state.lastError.name}: {state.lastError.message} · {when(state.lastError.at)}</p> : <p>No filesystem error recorded.</p>}
      <h4>Recent events</h4>{state.events.slice(-6).map((event, i) => <p key={i}>{when(event.at)} · {event.message}</p>)}
    </div>
    <div className="diagnostic-scroll"><FocusButton id="usb-scroll-up" focused={focused} onFocused={focus} className="text-button" onClick={() => { if (records.current) records.current.scrollTop -= 260; }}>↑ Earlier</FocusButton><FocusButton id="usb-scroll-down" focused={focused} onFocused={focus} className="text-button" onClick={() => { if (records.current) records.current.scrollTop += 260; }}>More ↓</FocusButton></div>
  </div>;
}
