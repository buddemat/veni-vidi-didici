import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migriereStore, aktualisiereWortschatz, neuerFortschrittEintrag } from '../www/js/store.js';
import { seed } from './seed.mjs';

const auswahl = { modus: 'einzel', lektionen: [23], bisId: null, abfrageModus: 'gewichtet', rundenende: 'alle-einmal' };

test('migriereStore: "Wie zuletzt" selection moves from settings to profile', () => {
  const store = { profil: { name: 'A' }, einstellungen: { rueckfragen_aktiv: true, letzte_abfrage: auswahl } };
  assert.equal(migriereStore(store), true);
  assert.deepEqual(store.profil.letzteAbfrage, auswahl);
  assert.equal('letzte_abfrage' in store.einstellungen, false);
  assert.equal(store.einstellungen.rueckfragen_aktiv, true);
  assert.equal(store.profil.name, 'A');
});

test('migriereStore: existing profile selection is not overwritten', () => {
  const neuer = { ...auswahl, lektionen: [24] };
  const store = { profil: { letzteAbfrage: neuer }, einstellungen: { letzte_abfrage: auswahl } };
  migriereStore(store);
  assert.deepEqual(store.profil.letzteAbfrage, neuer);
  assert.equal('letzte_abfrage' in store.einstellungen, false);
});

test('migriereStore: missing profile is created, current store stays unchanged', () => {
  const alt = { einstellungen: {} };
  assert.equal(migriereStore(alt), true);
  assert.equal(alt.profil.name, '');
  const aktuell = { profil: { name: 'B', letzteAbfrage: null }, einstellungen: {}, geloeschteIds: [] };
  assert.equal(migriereStore(aktuell), false);
});

// --- aktualisiereWortschatz: shipped vocabulary vs. stored vocabulary ---

function seedMit(...vokabeln) {
  return { version: 1, lektionen: [{ lektion: 1, vokabeln }] };
}

const sol = { id: 'L01-001', wortart: 'substantiv', lemma: 'sōl', formen: { genus: 'm' }, bedeutungen: [{ text: 'die Sonne', typ: 'muss' }] };
const luna = { id: 'L01-002', wortart: 'substantiv', lemma: 'lūna', formen: { genus: 'f' }, bedeutungen: [{ text: 'der Mond', typ: 'muss' }] };
const geuebt = { level: 4, fehler: 1, zuletzt: 123, rueckfragen: 0 };

// Store as it looks after the first start with `seedJson`, with some progress.
function storeAus(seedJson) {
  const store = { vokabeln: {}, fortschritt: {}, geloeschteIds: [] };
  aktualisiereWortschatz(store, seedJson);
  for (const id of Object.keys(store.vokabeln)) store.fortschritt[id] = { ...geuebt };
  return store;
}

test('aktualisiereWortschatz: new word is added with fresh progress', () => {
  const store = storeAus(seedMit(sol));
  const anzahl = aktualisiereWortschatz(store, seedMit(sol, luna));
  assert.deepEqual(anzahl, { neu: 1, aktualisiert: 0, entfernt: 0 });
  assert.equal(store.vokabeln['L01-002'].lemma, 'lūna');
  assert.equal(store.vokabeln['L01-002'].lektion, 1);
  assert.deepEqual(store.fortschritt['L01-002'], neuerFortschrittEintrag());
  assert.deepEqual(store.fortschritt['L01-001'], geuebt);
});

test('aktualisiereWortschatz: corrected word is updated, progress kept', () => {
  const store = storeAus(seedMit(sol));
  const korrigiert = { ...sol, bedeutungen: [...sol.bedeutungen, { text: 'der Tag', typ: 'kann' }] };
  assert.deepEqual(aktualisiereWortschatz(store, seedMit(korrigiert)), { neu: 0, aktualisiert: 1, entfernt: 0 });
  assert.equal(store.vokabeln['L01-001'].bedeutungen.length, 2);
  assert.deepEqual(store.fortschritt['L01-001'], geuebt);
});

test('aktualisiereWortschatz: same ID with a different Latin word resets progress', () => {
  const store = storeAus(seedMit(sol));
  aktualisiereWortschatz(store, seedMit({ ...luna, id: 'L01-001' }));
  assert.equal(store.vokabeln['L01-001'].lemma, 'lūna');
  assert.deepEqual(store.fortschritt['L01-001'], neuerFortschrittEintrag());
});

test('aktualisiereWortschatz: word edited on the device is kept', () => {
  const store = storeAus(seedMit(sol));
  store.vokabeln['L01-001'] = { ...sol, lektion: 1, bedeutungen: [{ text: 'die liebe Sonne', typ: 'muss' }], bearbeitet: true };
  const korrigiert = { ...sol, bedeutungen: [{ text: 'die Sonne (Gott)', typ: 'muss' }] };
  assert.deepEqual(aktualisiereWortschatz(store, seedMit(korrigiert)), { neu: 0, aktualisiert: 0, entfernt: 0 });
  assert.equal(store.vokabeln['L01-001'].bedeutungen[0].text, 'die liebe Sonne');
});

test('aktualisiereWortschatz: word deleted on the device stays deleted', () => {
  const store = storeAus(seedMit(sol, luna));
  delete store.vokabeln['L01-002'];
  delete store.fortschritt['L01-002'];
  store.geloeschteIds.push('L01-002');
  assert.deepEqual(aktualisiereWortschatz(store, seedMit(sol, luna)), { neu: 0, aktualisiert: 0, entfernt: 0 });
  assert.equal(store.vokabeln['L01-002'], undefined);
});

test('aktualisiereWortschatz: word removed from the app is removed unless edited', () => {
  const store = storeAus(seedMit(sol, luna));
  assert.deepEqual(aktualisiereWortschatz(store, seedMit(sol)), { neu: 0, aktualisiert: 0, entfernt: 1 });
  assert.equal(store.vokabeln['L01-002'], undefined);
  assert.equal(store.fortschritt['L01-002'], undefined);

  const bearbeitet = storeAus(seedMit(sol, luna));
  bearbeitet.vokabeln['L01-002'].bearbeitet = true;
  aktualisiereWortschatz(bearbeitet, seedMit(sol));
  assert.equal(bearbeitet.vokabeln['L01-002'].lemma, 'lūna');
});

test('aktualisiereWortschatz: word created on the device is kept', () => {
  const store = storeAus(seedMit(sol));
  store.vokabeln['L01-033'] = { ...luna, id: 'L01-033', lektion: 1, bearbeitet: true };
  store.fortschritt['L01-033'] = { ...geuebt };
  assert.deepEqual(aktualisiereWortschatz(store, seedMit(sol)), { neu: 0, aktualisiert: 0, entfernt: 0 });
  assert.equal(store.vokabeln['L01-033'].lemma, 'lūna');
});

test('aktualisiereWortschatz: unchanged vocabulary changes nothing (every start)', () => {
  const store = storeAus(seed);
  const vorher = JSON.stringify(store);
  assert.deepEqual(aktualisiereWortschatz(store, seed), { neu: 0, aktualisiert: 0, entfernt: 0 });
  assert.equal(JSON.stringify(store), vorher);
});
