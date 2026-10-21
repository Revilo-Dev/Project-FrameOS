import test from 'node:test';
import assert from 'node:assert/strict';
import { ORGANISER_KEY, addLocalItem, emptyOrganiser, loadOrganiser, saveOrganiser, upcomingReminders } from './localOrganiser';

test('tasks and reminders persist independently with completion and deletion', () => {
  const values = new Map<string, string>(), store = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  let state = emptyOrganiser();
  state.tasks = addLocalItem(state.tasks, '  Water plants  ');
  state.reminders = addLocalItem(state.reminders, 'Appointment', '2026-10-22T00:00:00Z');
  assert.equal(state.tasks[0].title, 'Water plants'); assert(!state.tasks[0].due);
  assert.notEqual(state.tasks[0].id, state.reminders[0].id);
  saveOrganiser(store, state); assert.deepEqual(loadOrganiser(store), state);
  state.tasks[0].completed = true; state.reminders = [];
  saveOrganiser(store, state); assert.deepEqual(loadOrganiser(store), state);
  assert.equal(loadOrganiser(store).tasks[0].completed, true);
});
test('invalid or duplicate saved items do not corrupt the organiser', () => {
  assert.deepEqual(loadOrganiser({ getItem: () => '{', setItem() {} }), emptyOrganiser());
  const saved = JSON.stringify({ version: 1, tasks: [{ id: '1', title: 'Valid', completed: true }, { id: '1', title: 'Duplicate' }, { id: '2', title: '   ' }], reminders: [{ id: '3', title: 'Broken date', due: 'nope' }] });
  const state = loadOrganiser({ getItem: key => key === ORGANISER_KEY ? saved : null, setItem() {} });
  assert.equal(state.tasks.length, 1); assert.equal(state.reminders.length, 0);
  assert.equal(saveOrganiser({ getItem: () => null, setItem() { throw Error(); } }, state), false);
});
test('reminders sort by due date, preserve overdue items and exclude completed ones', () => {
  const items = [{ id: '1', title: 'Later', due: '2026-10-23T00:00:00Z', completed: false }, { id: '2', title: 'Earlier', due: '2026-10-21T00:00:00Z', completed: false }, { id: '3', title: 'Done', due: '2026-10-20T00:00:00Z', completed: true }];
  assert.deepEqual(upcomingReminders(items).map(item => item.id), ['2', '1']);
  assert.deepEqual(items.map(item => item.id), ['1', '2', '3']);
  assert.equal(addLocalItem(items, '   '), items); assert.equal(addLocalItem(items, 'Bad date', 'bad'), items);
  const full = Array.from({ length: 200 }, (_, i) => ({ id: String(i), title: 'Item', completed: false }));
  assert.equal(addLocalItem(full, 'Extra'), full);
});
