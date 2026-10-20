import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migriereStore } from '../www/js/store.js';

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
  const aktuell = { profil: { name: 'B', letzteAbfrage: null }, einstellungen: {} };
  assert.equal(migriereStore(aktuell), false);
});
