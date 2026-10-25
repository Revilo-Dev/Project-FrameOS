import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FocusButton } from '../components/FocusButton';
import type { FocusRows } from '../navigation/remote';
import type { TvApplications } from '../platform/launchTvApp';
import type { UiPerformance } from '../services/uiPerformance';
import { configuredDock, type LauncherPreferences } from '../services/launcherPreferences';
import { createPreferenceBackup, parsePreferenceBackup, RECOVERY_KEY, type PreferenceBundle } from '../services/preferenceBackup';
import type { SettingsStorage } from '../services/settings';

export type LauncherTool = 'apps' | 'performance' | 'backup';
interface Common { focused: string; focus(id: string): void; rowsChanged(rows: FocusRows): void }
interface Props extends Common {
  tool?: LauncherTool; openTool(tool?: LauncherTool): void; samsungHome(): void; openApps(): void; restoreDock(): void;
  apps: TvApplications; preferences: LauncherPreferences; change(preferences: LauncherPreferences): void;
  performance: UiPerformance; capture(home: boolean): void;
  bundle: PreferenceBundle; storage: SettingsStorage; restore(text: string): void;
}
const row = (...ids: string[]) => ids.map((id, i) => ({ id, x: 350 + i * 400 }));
function useRows(props: Common, rows: FocusRows) {
  const encoded = JSON.stringify(rows);
  useLayoutEffect(() => props.rowsChanged(rows), [encoded, props.rowsChanged]);
}
function ToolBack({ focused, focus, back }: Common & { back(): void }) {
  return <FocusButton id="launcher-tool-back" focused={focused} onFocused={focus} className="text-button" onClick={back}>Back to Appearance</FocusButton>;
}
function ScrollReport({ id, label, value, focused, focus }: { id: string; label: string; value: unknown; focused: string; focus(id: string): void }) {
  const report = useRef<HTMLPreElement>(null);
  return <><pre ref={report} className="launcher-report" aria-label={label}>{JSON.stringify(value, null, 2)}</pre><div className="launcher-actions">{(['up', 'down'] as const).map(direction => <FocusButton key={direction} id={`${id}-${direction}`} focused={focused} onFocused={focus} className="text-button" onClick={() => { report.current?.scrollBy(0, direction === 'up' ? -180 : 180); }}>Scroll report {direction}</FocusButton>)}</div></>;
}
export function LauncherSettings(props: Props) {
  const back = () => props.openTool();
  if (props.tool === 'apps') return <><ToolBack {...props} back={back} /><InstalledApps {...props} /></>;
  if (props.tool === 'performance') return <><ToolBack {...props} back={back} /><PerformanceSettings {...props} /></>;
  if (props.tool === 'backup') return <><ToolBack {...props} back={back} /><PreferenceSettings {...props} /></>;
  return <div className="setting-section launcher-tools"><div className="setting-label"><h3>Launcher & recovery</h3><span>Your apps and preferences</span></div>
    <FocusButton id="launcher-home" focused={props.focused} onFocused={props.focus} className="option" onClick={props.samsungHome}>Open Samsung Home</FocusButton>
    {(['apps', 'performance', 'backup'] as const).map((tool, index) => <FocusButton key={tool} id={`launcher-${tool}`} focused={props.focused} onFocused={props.focus} className="option" onClick={() => props.openTool(tool)}>{['Installed apps & launch diagnostics', 'UI performance capture', 'Preference backup & restore'][index]}</FocusButton>)}
  </div>;
}
function InstalledApps(props: Props) {
  const [records, setRecords] = useState(props.apps.diagnostics.get);
  useEffect(() => props.apps.diagnostics.subscribe(() => setRecords(props.apps.diagnostics.get())), [props.apps]);
  useRows(props, [row('launcher-tool-back'), row('apps-browser', 'launcher-dock-reset'), ...(records.length ? [row('launch-report-up', 'launch-report-down')] : [])]);
  return <div className="launcher-tools"><div className="setting-label"><h3>Dock configuration</h3><span>{props.preferences.order.length} shortcuts</span></div>
    <p className="setting-note">Add installed apps in All Apps. On the dock, Up opens Options. Choose Move, then Left / Right and Select to save, or Back to cancel. Art Mode stays first. TV and All Apps are protected.</p>
    <div className="launcher-actions"><FocusButton id="apps-browser" focused={props.focused} onFocused={props.focus} className="text-button" onClick={props.openApps}>Open All Apps</FocusButton><FocusButton id="launcher-dock-reset" focused={props.focused} onFocused={props.focus} className="text-button" onClick={props.restoreDock}>Restore Default Dock...</FocusButton></div>
    <p className="setting-note">{configuredDock(props.preferences).map(item => item.name).join(' ? ')}</p>
    <div className="setting-label"><h3>Recent launch requests</h3><span>Kept for this session</span></div>
    <p className="setting-note">An API acknowledgement does not confirm that the app appeared on screen. Check the television after launching.</p>
    {records.length ? <ScrollReport id="launch-report" label="Launch diagnostics" value={records} focused={props.focused} focus={props.focus} /> : <p className="setting-note">No launch requests yet.</p>}
  </div>;
}
function PerformanceSettings(props: Props) {
  const [state, setState] = useState(props.performance.get);
  useEffect(() => props.performance.subscribe(() => setState(props.performance.get())), [props.performance]);
  useRows(props, [row('launcher-tool-back'), row('performance-here', 'performance-home'), row('performance-cancel'), ...(state.report ? [row('performance-report-up', 'performance-report-down')] : [])]);
  return <div className="launcher-tools"><div className="setting-label"><h3>UI performance</h3><span>Six-second capture · 500 ms warm-up</span></div>
    <p className="setting-note">Move focus normally during capture. Compare the same screen, wallpaper and motion setting. Callback timing measures browser scheduling; it cannot confirm displayed frames or remote-to-screen latency.</p>
    <div className="launcher-actions"><FocusButton id="performance-here" focused={props.focused} onFocused={props.focus} className="text-button" onClick={() => props.capture(false)}>Capture this screen</FocusButton><FocusButton id="performance-home" focused={props.focused} onFocused={props.focus} className="text-button" onClick={() => props.capture(true)}>Capture Home</FocusButton><FocusButton id="performance-cancel" focused={props.focused} onFocused={props.focus} className="text-button" onClick={() => props.performance.cancel('Cancelled by user')}>Cancel capture</FocusButton></div>
    <p className="setting-note" role="status">{state.running ? 'Capture running. Move focus for six seconds, then reopen this page for the result.' : state.report ? `${state.report.status} · ${state.report.frames.samples} frame intervals` : 'No capture yet. Capture stops when FrameOS becomes hidden.'}</p>
    {state.report && <ScrollReport id="performance-report" label="Performance report" value={state.report} focused={props.focused} focus={props.focus} />}
  </div>;
}
function PreferenceSettings(props: Props) {
  const [draft, setDraft] = useState(''), [review, setReview] = useState<PreferenceBundle>(), [status, setStatus] = useState('');
  useRows(props, [row('launcher-tool-back'), row('backup-export', 'backup-recovery'), row('backup-text'), row('backup-review'), ...(review ? [row('backup-apply'), row('backup-report-up', 'backup-report-down')] : [])]);
  const edit = (text: string) => { setDraft(text); setReview(undefined); setStatus(''); };
  return <div className="launcher-tools"><div className="setting-label"><h3>Preference backup</h3><span>FrameOS preferences only</span></div>
    <p className="setting-note">Includes appearance, shortcuts, widgets, local reminders and media preferences. Account tokens and media files are excluded. Keep a copy outside the TV before reinstalling.</p>
    <div className="launcher-actions"><FocusButton id="backup-export" focused={props.focused} onFocused={props.focus} className="text-button" onClick={() => { try { edit(createPreferenceBackup(props.bundle)); setStatus('Backup ready below. Copy and save it outside FrameOS.'); } catch (error) { setStatus(String(error)); } }}>Create backup text</FocusButton><FocusButton id="backup-recovery" focused={props.focused} onFocused={props.focus} className="text-button" onClick={() => { try { const text = props.storage.getItem(RECOVERY_KEY); if (!text) { setStatus('No recovery copy is saved.'); return; } edit(text); setStatus('Previous preferences loaded. Review before restoring.'); } catch { setStatus('Recovery storage is unavailable.'); } }}>Load previous recovery copy</FocusButton></div>
    <textarea id="backup-text" className={`launcher-backup${props.focused === 'backup-text' ? ' is-focused' : ''}`} aria-label="Preference backup JSON" value={draft} maxLength={131072} onFocus={() => props.focus('backup-text')} onChange={event => edit(event.target.value)} spellCheck={false} />
    <div className="launcher-actions"><FocusButton id="backup-review" focused={props.focused} onFocused={props.focus} className="text-button" onClick={() => { try { setReview(parsePreferenceBackup(draft)); setStatus('Backup validated. Review the preferences below before applying.'); } catch (error) { setReview(undefined); setStatus(error instanceof Error ? error.message : 'Invalid backup.'); } }}>Review import</FocusButton>{review && <FocusButton id="backup-apply" focused={props.focused} onFocused={props.focus} className="text-button" onClick={() => { try { props.restore(draft); setReview(undefined); setStatus('Preferences restored. Previous preferences were saved as a recovery copy.'); props.focus('backup-review'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Import failed.'); } }}>Apply reviewed backup</FocusButton>}</div>
    <p className="setting-note" role="status">{status}</p>
    {review && <ScrollReport id="backup-report" label="Reviewed preferences" value={review} focused={props.focused} focus={props.focus} />}
  </div>;
}
