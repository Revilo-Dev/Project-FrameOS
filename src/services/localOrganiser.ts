import type { SettingsStorage } from './settings';

export interface LocalItem { id: string; title: string; completed: boolean; due?: string }
export interface LocalOrganiser { version: 1; reminders: LocalItem[]; tasks: LocalItem[] }
export const ORGANISER_KEY = 'frameos.organiser.v1';
export const MAX_LOCAL_ITEMS = 200;
export function emptyOrganiser(): LocalOrganiser { return { version: 1, reminders: [], tasks: [] }; }
function validItems(value: unknown, reminders: boolean): LocalItem[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((item): item is LocalItem => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim()) return false;
    if (reminders && (typeof item.due !== 'string' || !Number.isFinite(Date.parse(item.due)))) return false;
    ids.add(item.id); return true;
  }).slice(0, MAX_LOCAL_ITEMS).map(item => ({ id: item.id, title: item.title.trim().slice(0, 160), completed: item.completed === true, ...(reminders ? { due: item.due } : {}) }));
}
export function loadOrganiser(storage: SettingsStorage): LocalOrganiser {
  try {
    const value = JSON.parse(storage.getItem(ORGANISER_KEY) || 'null') as Partial<LocalOrganiser> | null;
    return value?.version === 1 ? { version: 1, reminders: validItems(value.reminders, true), tasks: validItems(value.tasks, false) } : emptyOrganiser();
  } catch { return emptyOrganiser(); }
}
export function saveOrganiser(storage: SettingsStorage, value: LocalOrganiser): boolean {
  try { storage.setItem(ORGANISER_KEY, JSON.stringify(value)); return true; } catch { return false; }
}
export function addLocalItem(items: LocalItem[], title: string, due?: string): LocalItem[] {
  const clean = title.trim().slice(0, 160);
  if (!clean || items.length >= MAX_LOCAL_ITEMS || (due !== undefined && !Number.isFinite(Date.parse(due)))) return items;
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return [...items, { id: `${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`, title: clean, completed: false, ...(due ? { due } : {}) }];
}
export function upcomingReminders(items: LocalItem[]): LocalItem[] {
  return items.filter(item => !item.completed).sort((a, b) => Date.parse(a.due || '') - Date.parse(b.due || ''));
}
