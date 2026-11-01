import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gruppiereNachLektion, bauePool, schwacheVokabelIds, zuletztGeuebteLektion,
  neuesteLektionAuswahl, beschreibeAuswahl, wichtigeVokabelIds, gruppiereInselNachLektion,
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

// With a profile: only up to the current lesson (set lesser than the
// highest practised one, e.g. after stepping back), Inselwortschatz included.
test('schwacheVokabelIds: limited to the current lesson from the profile', () => {
  const fortschritt = {
    'L01-001': geuebt(1, 1),
    'L01-004': geuebt(1, 1), // Inselwortschatz in L1
    'L02-002': geuebt(1, 1),
    'L05-001': geuebt(1, 1),
  };
  const alle = ['L01-001', 'L01-004', 'L02-002', 'L05-001'];
  assert.deepEqual(schwacheVokabelIds(vokabeln, fortschritt), alle);
  assert.deepEqual(schwacheVokabelIds(vokabeln, fortschritt, { aktuelleLektion: 2 }), ['L01-001', 'L01-004', 'L02-002']);
  assert.deepEqual(schwacheVokabelIds(vokabeln, fortschritt, { aktuelleLektion: 2, aktuelleBisId: 'L02-001' }),
    ['L01-001', 'L01-004']);
  // no current lesson set: up to the highest practised one, i.e. all
  assert.deepEqual(schwacheVokabelIds(vokabeln, fortschritt, {}), alle);
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

// --- Inselwortschatz: without (default) / with / only ---

const mitInsel = {
  'L01-001': { id: 'L01-001', lektion: 1, wichtig: true },
  'L01-002': { id: 'L01-002', lektion: 1 },
  'L01-003': { id: 'L01-003', lektion: 1, fakultativ: true, wichtig: true },
  'L02-001': { id: 'L02-001', lektion: 2 },
  'L02-002': { id: 'L02-002', lektion: 2 },
  'L02-003': { id: 'L02-003', lektion: 2, fakultativ: true },
  'L03-001': { id: 'L03-001', lektion: 3 },
};
const lektionsGruppen = gruppiereNachLektion(mitInsel);
const inselGruppen = gruppiereInselNachLektion(mitInsel);

test('gruppiereInselNachLektion: only optional words, by lesson', () => {
  assert.deepEqual(Object.keys(inselGruppen), ['1', '2']);
  assert.deepEqual(inselGruppen[2].map(v => v.id), ['L02-003']);
});

test('bauePool: Inselwortschatz without, with and only', () => {
  const auswahl = { lektionen: [1, 2, 3] };
  assert.deepEqual(bauePool(lektionsGruppen, auswahl, inselGruppen),
    ['L01-001', 'L01-002', 'L02-001', 'L02-002', 'L03-001']);
  assert.deepEqual(bauePool(lektionsGruppen, { ...auswahl, inselwortschatz: 'mit' }, inselGruppen),
    ['L01-001', 'L01-002', 'L01-003', 'L02-001', 'L02-002', 'L02-003', 'L03-001']);
  assert.deepEqual(bauePool(lektionsGruppen, { ...auswahl, inselwortschatz: 'nur' }, inselGruppen),
    ['L01-003', 'L02-003']);
  // lesson without Inselwortschatz: "only" gives an empty pool
  assert.deepEqual(bauePool(lektionsGruppen, { lektionen: [3], inselwortschatz: 'nur' }, inselGruppen), []);
});

test('bauePool: highest lesson only up to a word - its Inselwortschatz not yet', () => {
  const auswahl = { lektionen: [1, 2], bisId: 'L02-001' };
  assert.deepEqual(bauePool(lektionsGruppen, { ...auswahl, inselwortschatz: 'mit' }, inselGruppen),
    ['L01-001', 'L01-002', 'L01-003', 'L02-001']);
  assert.deepEqual(bauePool(lektionsGruppen, { ...auswahl, inselwortschatz: 'nur' }, inselGruppen), ['L01-003']);
  // "bis" pointing at the lesson's last word still counts as up to a word
  assert.deepEqual(bauePool(lektionsGruppen, { lektionen: [2], bisId: 'L02-002', inselwortschatz: 'nur' }, inselGruppen), []);
});

test('wichtigeVokabelIds and beschreibeAuswahl follow the Inselwortschatz choice', () => {
  const profil = { aktuelleLektion: 2 };
  assert.deepEqual(wichtigeVokabelIds(mitInsel, {}, profil), ['L01-001']);
  assert.deepEqual(wichtigeVokabelIds(mitInsel, {}, profil, 'mit'), ['L01-001', 'L01-003']);
  // last round "only Inselwortschatz": still all important words, as with 'mit'
  assert.deepEqual(wichtigeVokabelIds(mitInsel, {}, profil, 'nur'), ['L01-001', 'L01-003']);
  assert.equal(beschreibeAuswahl(lektionsGruppen, { lektionen: [2], inselwortschatz: 'mit' }), 'L2 + Inselwortschatz');
  assert.equal(beschreibeAuswahl(lektionsGruppen, { lektionen: [1, 2], inselwortschatz: 'nur' }), 'L1–2, nur Inselwortschatz');
  assert.equal(beschreibeAuswahl(lektionsGruppen, { lektionen: [2] }), 'L2');
});

// "Bis" can also point at an Inselwort (offered in the list when the
// Inselwortschatz is quizzed too or alone): then the lesson's Inselwortschatz
// up to that word.
test('bauePool and beschreibeAuswahl: "bis" pointing at an Inselwort', () => {
  const v = {
    'L03-001': { id: 'L03-001', lektion: 3 },
    'L04-001': { id: 'L04-001', lektion: 4 },
    'L04-002': { id: 'L04-002', lektion: 4 },
    'L04-003': { id: 'L04-003', lektion: 4, fakultativ: true },
    'L04-004': { id: 'L04-004', lektion: 4, fakultativ: true },
  };
  const gruppen = gruppiereNachLektion(v);
  const insel = gruppiereInselNachLektion(v);
  const auswahl = { lektionen: [4], bisId: 'L04-003' };
  assert.deepEqual(bauePool(gruppen, { ...auswahl, inselwortschatz: 'mit' }, insel), ['L04-001', 'L04-002', 'L04-003']);
  assert.deepEqual(bauePool(gruppen, { ...auswahl, inselwortschatz: 'nur' }, insel), ['L04-003']);
  // without Inselwortschatz, an Inselwort as "bis" is ignored
  assert.deepEqual(bauePool(gruppen, { ...auswahl, inselwortschatz: 'ohne' }, insel), ['L04-001', 'L04-002']);
  // only the highest lesson is cut off
  assert.deepEqual(bauePool(gruppen, { lektionen: [3, 4], bisId: 'L04-003', inselwortschatz: 'mit' }, insel),
    ['L03-001', 'L04-001', 'L04-002', 'L04-003']);

  assert.equal(beschreibeAuswahl(gruppen, { ...auswahl, inselwortschatz: 'mit' }, insel), 'L4 + Inselwortschatz bis Nr. 1');
  assert.equal(beschreibeAuswahl(gruppen, { ...auswahl, inselwortschatz: 'nur' }, insel), 'L4, nur Inselwortschatz bis Nr. 1');
  assert.equal(beschreibeAuswahl(gruppen, { ...auswahl, inselwortschatz: 'ohne' }, insel), 'L4');
  // up to a lesson word: its Inselwortschatz is not included, so not mentioned
  assert.equal(beschreibeAuswahl(gruppen, { lektionen: [4], bisId: 'L04-002', inselwortschatz: 'mit' }, insel), 'L4 bis Nr. 2');
  assert.equal(beschreibeAuswahl(lektionsGruppen, { lektionen: [1, 2], bisId: 'L02-001', inselwortschatz: 'mit' }, inselGruppen),
    'L1–2 bis Nr. 1 + Inselwortschatz');
});
