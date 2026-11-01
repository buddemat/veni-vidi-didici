import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lemmaPasst, audioDateiname, idAusDateiname, audioQuelle } from '../www/js/audio.js';

test('lemmaPasst ignores macrons and case, but not a different word', () => {
  assert.equal(lemmaPasst('venīre', 'venire'), true);
  assert.equal(lemmaPasst('Asinus', 'asinus'), true);
  assert.equal(lemmaPasst('venīre', 'vidēre'), false);
  assert.equal(lemmaPasst(undefined, 'asinus'), false);
  assert.equal(lemmaPasst('', ''), false);
});

test('audio file names: ID plus readable lemma, and back', () => {
  assert.equal(audioDateiname('L01-001', 'venīre', 'webm'), 'L01-001_venire.webm');
  assert.equal(audioDateiname('L02-001', 'discipulus/discipula', 'm4a'), 'L02-001_discipulus-discipula.m4a');
  assert.equal(audioDateiname('L01-005', 'et ... et', 'm4a'), 'L01-005_et-et.m4a');
  assert.equal(idAusDateiname('L01-001_venire.webm'), 'L01-001');
  assert.equal(idAusDateiname('audio/L02-001_discipulus-discipula.m4a'), 'L02-001');
  assert.equal(idAusDateiname('L01-001.m4a'), 'L01-001');
  assert.equal(idAusDateiname('notizen.txt'), null);
  assert.equal(idAusDateiname('L01-001'), null);
});

test('audioQuelle: own recording first, then shipped, only while the lemma matches', () => {
  const venire = { id: 'L01-001', lemma: 'venīre' };
  const mitgeliefert = { 'L01-001': { url: 'assets/audio/L01-001.m4a', lemma: 'venīre' } };
  assert.equal(audioQuelle(venire, {}, mitgeliefert), 'mitgeliefert');
  assert.equal(audioQuelle(venire, { 'L01-001': 'venire' }, mitgeliefert), 'eigen');
  assert.equal(audioQuelle(venire, {}, {}), null);
  // ID now belongs to a different word: old recordings stay silent.
  const videre = { id: 'L01-001', lemma: 'vidēre' };
  assert.equal(audioQuelle(videre, { 'L01-001': 'venīre' }, mitgeliefert), null);
  assert.equal(audioQuelle(null, {}, mitgeliefert), null);
});
