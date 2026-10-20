import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, beispielSeed, alleVokabelnAus } from './seed.mjs';

function idFehler(s) {
  const fehler = [];
  for (const l of s.lektionen) {
    l.vokabeln.forEach((v, i) => {
      const soll = `L${String(l.lektion).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`;
      if (v.id !== soll) fehler.push(`${v.id} (${v.lemma}) should be ${soll}`);
    });
  }
  return fehler;
}

function ohneMussBedeutung(s) {
  return alleVokabelnAus(s)
    .filter(v => v.bedeutungen.length > 0 && !v.bedeutungen.some(b => b.typ === 'muss'))
    .map(v => `${v.id} ${v.lemma}`);
}

// IDs are sequential per lesson (L01-001, L01-002, ...) in list order; the
// order is used e.g. for "quiz only up to a given word".
test('vocabulary IDs are sequential without gaps within each lesson', () => {
  assert.deepEqual(idFehler(seed), []);
});

// A word needs at least one required ("muss") meaning, otherwise it cannot
// be quizzed.
test('every word with meanings has at least one required meaning', () => {
  assert.deepEqual(ohneMussBedeutung(seed), []);
});

// The example vocabulary ships with the repository and must follow the same
// rules, regardless of whether an actual vocabulary is present locally.
test('example vocabulary: sequential IDs, every word has a required meaning', () => {
  assert.deepEqual(idFehler(beispielSeed), []);
  assert.deepEqual(ohneMussBedeutung(beispielSeed), []);
});
