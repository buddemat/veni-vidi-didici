import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gruppiereNachLektion, bauePool, schwacheVokabelIds, zuletztGeuebteLektion,
  neuesteLektionAuswahl, beschreibeAuswahl, wichtigeVokabelIds,
} from '../www/js/schnellstart.js';

// Small vocabulary: L1 with 3, L2 with 2, L5 with 2 words, plus one optional
// word (Inselwortschatz) in L1.
const vokabeln = {
  'L01-001': { id: 'L01-001', lektion: 1 },
  'L01-002': { id: 'L01-002', lektion: 1 },
  'L01-003': { id: 'L01-003', lektion: 1 },
  'L02-001': { id: 'L02-001', lektion: 2 },
  'L02-002': { id: 'L02-002', lektion: 2 },
  'L05-002': { id: 'L05-002', lektion: 5 },
  'L05-001': { id: 'L05-001', lektion: 5 },
  'L01-004': { id: 'L01-004', lektion: 1, fakultativ: true },
};
const gruppen = gruppiereNachLektion(vokabeln);

const geuebt = (level, fehler = 0, zuletzt = 1000) => ({ level, fehler, zuletzt, rueckfragen: 0 });
const neu = () => ({ level: 1, fehler: 0, zuletzt: 0, rueckfragen: 0 });

test('gruppiereNachLektion: sorted by ID, Inselwortschatz excluded', () => {
  assert.deepEqual(Object.keys(gruppen), ['1', '2', '5']);
  assert.deepEqual(gruppen[1].map(v => v.id), ['L01-001', 'L01-002', 'L01-003']);
  assert.deepEqual(gruppen[5].map(v => v.id), ['L05-001', 'L05-002']);
});

test('bauePool: one/several lessons, "bis" applies to the highest', () => {
  assert.deepEqual(bauePool(gruppen, { lektionen: [2] }), ['L02-001', 'L02-002']);
  assert.deepEqual(bauePool(gruppen, { lektionen: [2, 1] }),
    ['L01-001', 'L01-002', 'L01-003', 'L02-001', 'L02-002']);
  assert.deepEqual(bauePool(gruppen, { lektionen: [1, 2], bisId: 'L02-001' }),
    ['L01-001', 'L01-002', 'L01-003', 'L02-001']);
  assert.deepEqual(bauePool(gruppen, { lektionen: [1], bisId: 'L01-002' }), ['L01-001', 'L01-002']);
});

test('bauePool: missing lesson or foreign bisId are ignored', () => {
  assert.deepEqual(bauePool(gruppen, { lektionen: [9] }), []);
  assert.deepEqual(bauePool(gruppen, { lektionen: [9, 2] }), ['L02-001', 'L02-002']);
  assert.deepEqual(bauePool(gruppen, { lektionen: [2], bisId: 'L01-001' }), ['L02-001', 'L02-002']);
});

test('schwacheVokabelIds: wrong at least once and level 1 or 2', () => {
  const fortschritt = {
    'L01-001': geuebt(1, 1), // last answer wrong
    'L01-002': geuebt(2, 3), // right once since the last mistake
    'L01-003': geuebt(3, 2), // right twice since the last mistake - no longer weak
    'L02-001': neu(), // never quizzed - new, not weak
    'L05-001': geuebt(5),
  };
  assert.deepEqual(schwacheVokabelIds(vokabeln, fortschritt), ['L01-001', 'L01-002']);
  assert.deepEqual(schwacheVokabelIds(vokabeln, {}), []);
});

test('schwacheVokabelIds: right the first time is not weak', () => {
  // new word (level 1) right once -> level 2, but never a mistake
  assert.deepEqual(schwacheVokabelIds(vokabeln, { 'L01-001': geuebt(2, 0) }), []);
});

test('zuletztGeuebteLektion: highest lesson with a quizzed word', () => {
  assert.equal(zuletztGeuebteLektion(vokabeln, {}), null);
  assert.equal(zuletztGeuebteLektion(vokabeln, { 'L01-001': geuebt(3), 'L02-002': geuebt(1) }), 2);
  // never-quizzed words don't count; a quizzed Inselwortschatz word counts
  // for its lesson
  assert.equal(zuletztGeuebteLektion(vokabeln, { 'L05-001': neu() }), null);
  assert.equal(zuletztGeuebteLektion(vokabeln, { 'L01-004': geuebt(3), 'L05-001': neu() }), 1);
});

test('neuesteLektionAuswahl: profile before automatic, "bis" only if it matches the lesson', () => {
  const fortschritt = { 'L02-001': geuebt(3) };
  assert.deepEqual(neuesteLektionAuswahl(vokabeln, fortschritt, {}), { lektionen: [2], bisId: null });
  assert.deepEqual(neuesteLektionAuswahl(vokabeln, fortschritt, { aktuelleLektion: null }),
    { lektionen: [2], bisId: null });
  assert.deepEqual(neuesteLektionAuswahl(vokabeln, fortschritt, { aktuelleLektion: 5 }),
    { lektionen: [5], bisId: null });
  assert.deepEqual(neuesteLektionAuswahl(vokabeln, fortschritt, { aktuelleLektion: 5, aktuelleBisId: 'L05-001' }),
    { lektionen: [5], bisId: 'L05-001' });
  assert.deepEqual(neuesteLektionAuswahl(vokabeln, fortschritt, { aktuelleLektion: 5, aktuelleBisId: 'L02-001' }),
    { lektionen: [5], bisId: null });
  // configured lesson doesn't exist (any more) -> automatic
  assert.deepEqual(neuesteLektionAuswahl(vokabeln, fortschritt, { aktuelleLektion: 9 }),
    { lektionen: [2], bisId: null });
  assert.equal(neuesteLektionAuswahl(vokabeln, {}, {}), null);
});

test('beschreibeAuswahl: ranges merged, "bis" as number', () => {
  assert.equal(beschreibeAuswahl(gruppen, { lektionen: [2] }), 'L2');
  assert.equal(beschreibeAuswahl(gruppen, { lektionen: [2, 1] }), 'L1–2');
  assert.equal(beschreibeAuswahl(gruppen, { lektionen: [1, 2, 5] }), 'L1–2, L5');
  assert.equal(beschreibeAuswahl(gruppen, { lektionen: [5], bisId: 'L05-001' }), 'L5 bis Nr. 1');
});

test('wichtigeVokabelIds: marked words from lesson 1 up to the current lesson', () => {
  const v = {
    'L01-001': { id: 'L01-001', lektion: 1, wichtig: true },
    'L01-002': { id: 'L01-002', lektion: 1 },
    'L02-001': { id: 'L02-001', lektion: 2, wichtig: true },
    'L02-002': { id: 'L02-002', lektion: 2, wichtig: true },
    'L03-001': { id: 'L03-001', lektion: 3, wichtig: true },
    'L03-002': { id: 'L03-002', lektion: 3, fakultativ: true, wichtig: true },
  };
  // No current lesson yet: nothing practised, nothing set.
  assert.equal(wichtigeVokabelIds(v, {}, {}), null);
  // Current lesson set in the profile, optionally only up to a word.
  assert.deepEqual(wichtigeVokabelIds(v, {}, { aktuelleLektion: 2 }), ['L01-001', 'L02-001', 'L02-002']);
  assert.deepEqual(wichtigeVokabelIds(v, {}, { aktuelleLektion: 2, aktuelleBisId: 'L02-001' }), ['L01-001', 'L02-001']);
  // Automatic: highest lesson practised so far.
  assert.deepEqual(wichtigeVokabelIds(v, { 'L01-002': { zuletzt: 5 } }, {}), ['L01-001']);
  assert.deepEqual(wichtigeVokabelIds(v, {}, { aktuelleLektion: 3 }), ['L01-001', 'L02-001', 'L02-002', 'L03-001']);
});
