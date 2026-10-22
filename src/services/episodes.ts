import type { MediaEntry } from '../types/media';

export interface Episode { episode: number; season?: number; series?: string; label: string }
const separator = '[ ._-]';
/** Presentation only: never use this title as a file path or thumbnail key. */
export function videoDisplayTitle(filename: string): string {
  const title = filename.replace(/\.(mp4|mkv|m4v|webm|avi|mov|wmv|ts|m2ts|mts|mpg|mpeg|vob|3gp)$/i, '')
    .replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  // Keep episode codes, punctuation, acronyms and proper-name casing intact.
  const episode = /^((?:(?:episode|ep|e)\s*\d{1,3}|s\d{1,2}e\d{1,3}|\d{1,2}x\d{1,3})[ .-]+)(\S)/i;
  return episode.test(title)
    ? title.replace(episode, (_match, prefix: string, first: string) => prefix + first.toLocaleUpperCase())
    : title.replace(/^\S/, first => first.toLocaleUpperCase());
}
const patterns = [
  new RegExp(`(?:^|${separator})S(\\d{1,2})E(\\d{1,3})(?=$|${separator})`, 'ig'),
  new RegExp(`(?:^|${separator})(\\d{1,2})x(\\d{1,3})(?=$|${separator})`, 'ig'),
  new RegExp(`(?:^|${separator})(?:episode|ep|e)${separator}*(\\d{1,3})(?=$|${separator})`, 'ig'),
];
export function detectEpisode(filename: string): Episode | null {
  const name = filename.replace(/\.[^.]+$/, '');
  const found: Episode[] = [];
  let ambiguous = false;
  patterns.forEach((pattern, index) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(name))) {
      // A multi-episode/range release cannot honestly be assigned one episode.
      if (/^(?:\s*[-&]|[ ._-]*(?:and|to|e))\s*\d/i.test(name.slice(pattern.lastIndex))) { ambiguous = true; continue; }
      const series = name.slice(0, match.index).replace(/[._-]+/g, ' ').trim() || undefined;
      const episode = Number(match[index < 2 ? 2 : 1]);
      found.push({ episode, ...(index < 2 ? { season: Number(match[1]) } : {}), ...(series ? { series } : {}), label: `Episode ${String(episode).padStart(2, '0')}` });
    }
  });
  return !ambiguous && found.length === 1 ? found[0] : null;
}
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const episodeCache = new WeakMap<MediaEntry, Episode | null>();
function entryEpisode(entry: MediaEntry) {
  if (!episodeCache.has(entry)) episodeCache.set(entry, entry.type === 'video' ? detectEpisode(entry.name) : null);
  return episodeCache.get(entry)!;
}
const seriesKey = (episode: Episode) => (episode.series || '').toLocaleLowerCase();
export function compareMediaNames(a: MediaEntry, b: MediaEntry): number {
  const folder = Number(b.isDirectory) - Number(a.isDirectory);
  if (folder) return folder;
  const left = entryEpisode(a);
  const right = entryEpisode(b);
  const group = collator.compare(left ? left.series || 'Episode' : a.name, right ? right.series || 'Episode' : b.name);
  return group || (left && right ? (left.season || 0) - (right.season || 0) || left.episode - right.episode : 0) || collator.compare(a.name, b.name);
}
export function playbackQueue(entries: readonly MediaEntry[], current: MediaEntry): MediaEntry[] {
  const videos = entries.filter(entry => entry.type === 'video' && !entry.isDirectory && entry.storageId === current.storageId && entry.parentPath === current.parentPath);
  const episode = detectEpisode(current.name);
  const series = episode ? videos.filter(entry => { const other = detectEpisode(entry.name); return other && seriesKey(other) === seriesKey(episode); }) : [];
  return (series.length > 1 ? series : videos).slice().sort(series.length > 1 ? compareMediaNames : (a, b) => collator.compare(a.name, b.name));
}
