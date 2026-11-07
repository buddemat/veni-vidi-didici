import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suchSchluessel, sucheVokabeln, sucheErweitert, aehnlichkeitsSchwelle } from '../www/js/suche.js';

// Erfundene bzw. Beispiel-Einträge (keine Buchinhalte, PLAN.md Punkt 35).
const vokabeln = {
  'L01-001': { id: 'L01-001', wortart: 'verb', lemma: 'venīre', formen: { praesens_1sg: 'veniō', perfekt_1sg: 'vēnī' } },
  'L01-002': { id: 'L01-002', wortart: 'verb', lemma: 'vidēre', formen: { praesens_1sg: 'videō (m. Akk.)', perfekt_1sg: 'vīdī', ppp: 'vīsum' } },
  'L02-001': { id: 'L02-001', wortart: 'substantiv', lemma: 'discipulus/discipula', formen: { genitiv_sg: 'discipulī/discipulae', genus: 'm/f' } },
  'L02-002': { id: 'L02-002', wortart: 'sonstiges', lemma: 'glaucus, glauca, glaucum', formen: {} },
  'L03-001': { id: 'L03-001', wortart: 'sonstiges', lemma: 'nisi/nī (m. Abl.)', formen: {} },
  'L03-002': { id: 'L03-002', wortart: 'adjektiv', lemma: 'caeruleus', formen: { f: 'caerul(e)a', n: 'caerul(e)um' } },
  'L03-003': { id: 'L03-003', wortart: 'sonstiges', lemma: 'sīve ... sīve', formen: {} },
  'L03-004': { id: 'L03-004', wortart: 'sonstiges', lemma: '-ve? (angehängt)', formen: {} },
  'L04-001': { id: 'L04-001', wortart: 'verb', lemma: 'nōn venīre', formen: {} },
};

const ids = treffer => treffer.map(t => t.vokabel.id);

test('suchSchluessel: Anmerkungen weg, optionale Buchstaben als Varianten, mehrere Angaben getrennt', () => {
  assert.deepEqual(suchSchluessel('videō (m. Akk.)'), ['uideo']);
  assert.deepEqual(suchSchluessel('caerul(e)a').sort(), ['caerula', 'caerulea']);
  assert.deepEqual(suchSchluessel('discipulus/discipula'), ['discipulus', 'discipula']);
  assert.deepEqual(suchSchluessel('glaucus, glauca'), ['glaucus', 'glauca']);
  assert.deepEqual(suchSchluessel('(nisi, sīve, ...) utinam'), ['utinam']);
  assert.deepEqual(suchSchluessel('-ve? (angehängt)'), ['ue']);
  assert.deepEqual(suchSchluessel(''), []);
});

test('sucheVokabeln: findet das Lemma ohne Makrons und unabhängig von Groß/klein, u/v', () => {
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'venire')), ['L01-001', 'L04-001']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'VENĪRE')), ['L01-001', 'L04-001']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'uidere')), ['L01-002']);
});

test('sucheVokabeln: findet Vokabeln über ihre Formen und nennt das Feld', () => {
  const treffer = sucheVokabeln(vokabeln, 'vīdī');
  assert.deepEqual(ids(treffer), ['L01-002']);
  assert.deepEqual(treffer[0].felder, ['perfekt_1sg']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'video')), ['L01-002']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'discipulae')), ['L02-001']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'caerula')), ['L03-002']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'caerulea')), ['L03-002']);
});

test('sucheVokabeln: Teile von Lemmata mit mehreren Angaben oder Wörtern', () => {
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'discipula')), ['L02-001']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'glauca')), ['L02-002']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'ni')), ['L03-001']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'sive')), ['L03-003']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 've')), ['L03-004']);
  assert.deepEqual(ids(sucheVokabeln(vokabeln, 'non venire')), ['L04-001']);
});

test('sucheVokabeln: keine Teilwörter, kein Genus, leere Eingabe', () => {
  assert.deepEqual(sucheVokabeln(vokabeln, 'ven'), []);
  assert.deepEqual(sucheVokabeln(vokabeln, 'm'), []);
  assert.deepEqual(sucheVokabeln(vokabeln, '  '), []);
});

test('sucheVokabeln: Treffer im Lemma vor Treffern in Formen', () => {
  const daten = {
    'L01-001': { id: 'L01-001', wortart: 'verb', lemma: 'esse', formen: { praesens_1sg: 'sum' } },
    'L02-001': { id: 'L02-001', wortart: 'sonstiges', lemma: 'sum', formen: {} },
  };
  assert.deepEqual(ids(sucheVokabeln(daten, 'sum')), ['L02-001', 'L01-001']);
});

test('sucheErweitert: exakte Treffer, dann Teilwörter (Wortanfang zuerst), jede Vokabel nur einmal', () => {
  const { exakt, teilwort } = sucheErweitert(vokabeln, 'venire');
  assert.deepEqual(ids(exakt), ['L01-001', 'L04-001']);
  assert.deepEqual(ids(teilwort), []);

  // "disc": Wortanfang von discipulus; "cipul" steckt mittendrin.
  assert.deepEqual(ids(sucheErweitert(vokabeln, 'disc').teilwort), ['L02-001']);
  assert.deepEqual(ids(sucheErweitert(vokabeln, 'cipul').teilwort), ['L02-001']);

  const daten = {
    a: { id: 'a', wortart: 'sonstiges', lemma: 'magnus', formen: {} },
    b: { id: 'b', wortart: 'sonstiges', lemma: 'permagnus', formen: {} },
    c: { id: 'c', wortart: 'sonstiges', lemma: 'magnitudo', formen: {} },
  };
  const ergebnis = sucheErweitert(daten, 'magn');
  assert.deepEqual(ids(ergebnis.exakt), []);
  assert.deepEqual(ids(ergebnis.teilwort), ['c', 'a', 'b']);
});

test('sucheErweitert: Teilwort erst ab zwei Buchstaben', () => {
  assert.deepEqual(sucheErweitert(vokabeln, 'v').teilwort, []);
  assert.ok(sucheErweitert(vokabeln, 'vi').teilwort.length > 0);
});

test('sucheErweitert: ähnliche Wörter nach Abstand sortiert, mit getroffenem Feld', () => {
  // "vidire": ein Buchstabe falsch -> vidēre; venīre (2 Abweichungen) erst ab 7 Buchstaben.
  assert.deepEqual(ids(sucheErweitert(vokabeln, 'vidire').aehnlich), ['L01-002']);
  // "discipolos" (10): 2 Abweichungen erlaubt.
  assert.deepEqual(ids(sucheErweitert(vokabeln, 'discipolos').aehnlich), ['L02-001']);
  const { aehnlich } = sucheErweitert(vokabeln, 'visam');
  assert.deepEqual(ids(aehnlich), ['L01-002']);
  assert.deepEqual(aehnlich[0].felder, ['ppp']);
  // Zu kurz für Ähnlichkeit.
  assert.deepEqual(sucheErweitert(vokabeln, 'vim').aehnlich, []);
});

test('aehnlichkeitsSchwelle: wächst mit der Wortlänge', () => {
  assert.equal(aehnlichkeitsSchwelle(3), -1);
  assert.equal(aehnlichkeitsSchwelle(6), 1);
  assert.equal(aehnlichkeitsSchwelle(7), 2);
  assert.equal(aehnlichkeitsSchwelle(12), 3);
});

test('sucheErweitert: * als Platzhalter, auch in Formen und Einzelwörtern', () => {
  assert.deepEqual(Object.keys(sucheErweitert(vokabeln, '*ire')), ['platzhalter']);
  assert.deepEqual(ids(sucheErweitert(vokabeln, '*īre').platzhalter), ['L04-001', 'L01-001']);
  assert.deepEqual(ids(sucheErweitert(vokabeln, 'vi*').platzhalter), ['L01-002']);
  assert.deepEqual(ids(sucheErweitert(vokabeln, 'v*i').platzhalter), ['L01-001', 'L01-002']);
  assert.deepEqual(ids(sucheErweitert(vokabeln, 'non *').platzhalter), ['L04-001']);
  assert.deepEqual(sucheErweitert(vokabeln, '**').platzhalter, []);
  assert.deepEqual(sucheErweitert(vokabeln, 'x*(').platzhalter, []);
});
