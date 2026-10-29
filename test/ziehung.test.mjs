import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baueStapel, wiederEinreihen, gewicht } from '../www/js/ziehung.js';

// Deterministic pseudo-random numbers (mulberry32), so the tests are stable.
function zufallMitSeed(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pool = Array.from({ length: 30 }, (_, i) => `L01-${String(i + 1).padStart(3, '0')}`);
const eintrag = (level, rueckfragen = 0) => ({ level, fehler: 0, zuletzt: 0, rueckfragen });

test('first pass: every new word exactly once before any repeat', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const stapel = baueStapel(pool, {}, { ersterDurchgang: true, zufall: zufallMitSeed(seed) });
    assert.equal(stapel.length, pool.length);
    assert.deepEqual([...stapel].sort(), pool);
  }
});

test('first pass includes even well-known words', () => {
  const fortschritt = Object.fromEntries(pool.map(id => [id, eintrag(5)]));
  const stapel = baueStapel(pool, fortschritt, { ersterDurchgang: true, zufall: zufallMitSeed(7) });
  assert.deepEqual([...stapel].sort(), pool);
});

test('weak words tend to come first in the first pass', () => {
  const schwach = new Set(pool.slice(0, 5));
  const fortschritt = Object.fromEntries(pool.map(id => [id, eintrag(schwach.has(id) ? 1 : 5)]));
  let schwachVorne = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const stapel = baueStapel(pool, fortschritt, { ersterDurchgang: true, zufall: zufallMitSeed(seed) });
    schwachVorne += stapel.slice(0, 5).filter(id => schwach.has(id)).length;
  }
  // Uniform shuffling would put about 5/30 of them in front; weighting far more.
  assert.ok(schwachVorne / (200 * 5) > 0.6, `${schwachVorne}`);
});

test('later decks: weak words always, well-known words only sometimes', () => {
  const fortschritt = { 'L01-001': eintrag(1), 'L01-002': eintrag(5) };
  let schwachDrin = 0;
  let gutDrin = 0;
  const zufall = zufallMitSeed(3);
  for (let i = 0; i < 400; i++) {
    const stapel = baueStapel(['L01-001', 'L01-002'], fortschritt, { ersterDurchgang: false, zufall });
    if (stapel.includes('L01-001')) schwachDrin++;
    if (stapel.includes('L01-002')) gutDrin++;
  }
  assert.equal(schwachDrin, 400);
  assert.ok(gutDrin > 0 && gutDrin < 60, `${gutDrin}`); // expected about 400 * 0.5/8 = 25
});

test('later decks are never empty', () => {
  const fortschritt = Object.fromEntries(pool.map(id => [id, eintrag(5)]));
  const stapel = baueStapel(pool, fortschritt, { ersterDurchgang: false, zufall: () => 0.99 });
  assert.equal(stapel.length, pool.length);
});

test('the last word asked is not first in the next deck', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const stapel = baueStapel(['a', 'b', 'c'], {}, { ersterDurchgang: true, zuletztId: 'a', zufall: zufallMitSeed(seed) });
    assert.notEqual(stapel[0], 'a');
  }
  assert.deepEqual(baueStapel(['a'], {}, { ersterDurchgang: true, zuletztId: 'a' }), ['a']);
});

test('wrong word comes back after a few other cards', () => {
  const stapel = ['b', 'c', 'd', 'e', 'f'];
  assert.equal(wiederEinreihen(stapel, 'a', 3), 3);
  assert.deepEqual(stapel, ['b', 'c', 'd', 'a', 'e', 'f']);
  const kurz = ['b'];
  wiederEinreihen(kurz, 'a', 3);
  assert.deepEqual(kurz, ['b', 'a']);
  const leer = [];
  wiederEinreihen(leer, 'a', 3);
  assert.deepEqual(leer, ['a']);
  // already coming up soon: not added twice
  const bald = ['b', 'a', 'c', 'd'];
  assert.equal(wiederEinreihen(bald, 'a', 3), -1);
  assert.deepEqual(bald, ['b', 'a', 'c', 'd']);
});

test('weight: falls with level, follow-up questions add to it', () => {
  assert.equal(gewicht(undefined), 8);
  assert.ok(gewicht(eintrag(1)) > gewicht(eintrag(2)));
  assert.ok(gewicht(eintrag(4)) > gewicht(eintrag(5)));
  assert.equal(gewicht(eintrag(2, 2)), gewicht(eintrag(2)) + 2);
});
