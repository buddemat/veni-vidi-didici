import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeAntwort, aktiveAbfrageFelder, sollVarianten } from '../www/js/pruefung.js';
import { seed, beispielSeed, alleVokabelnAus } from './seed.mjs';

const alleVokabeln = alleVokabelnAus(seed);

// All fields that any word of this part of speech has - simulates
// "everything is ticked in the settings".
function alleFelderDerWortart(wortart) {
  const felder = new Set();
  for (const v of alleVokabeln.filter(v => v.wortart === wortart)) {
    Object.keys(v.formen).forEach(f => felder.add(f));
  }
  return [...felder];
}

// Complete, correct answer as a student would type it: for each item the
// first accepted spelling, i.e. without parentheses - e.g. "der Herr"
// instead of "der (Haus-)Herr".
function korrekteAntwort(vokabel, abfrageFelder) {
  const istVerb = vokabel.wortart === 'verb';
  const teile = [sollVarianten(vokabel.lemma)[0]];
  for (const feldKey of abfrageFelder) {
    // With two accepted genders ("m/f"), one is enough.
    teile.push(feldKey === 'genus'
      ? vokabel.formen.genus.split('/')[0]
      : sollVarianten(vokabel.formen[feldKey])[0]);
  }
  for (const b of vokabel.bedeutungen.filter(b => b.typ === 'muss')) {
    teile.push(sollVarianten(b.text, istVerb)[0]);
  }
  return teile.join(', ');
}

const nefas = {
  wortart: 'substantiv',
  lemma: 'nefās',
  formen: {},
  bedeutungen: [{ text: 'der Frevel', typ: 'muss' }, { text: 'das Verbrechen', typ: 'muss' }],
};

test('aktiveAbfrageFelder skips fields the word does not have', () => {
  assert.deepEqual(aktiveAbfrageFelder(nefas, ['genitiv_sg', 'genus']), []);
  assert.deepEqual(
    aktiveAbfrageFelder({ formen: { genitiv_sg: 'sōlis', genus: 'm' } }, ['genitiv_sg', 'genus']),
    ['genitiv_sg', 'genus'],
  );
  assert.deepEqual(aktiveAbfrageFelder(nefas, undefined), []);
});

test('indeclinable noun without forms (nefās) is checked instead of crashing', () => {
  const felder = aktiveAbfrageFelder(nefas, ['genitiv_sg', 'genus']);
  assert.equal(pruefeAntwort(nefas, felder, 'nefas, der Frevel, das Verbrechen').richtig, true);
  assert.equal(pruefeAntwort(nefas, felder, 'nefas, der Frevel').richtig, false);
});

function fehlerBeiKorrekterAntwort(vokabeln) {
  const fehler = [];
  for (const vokabel of vokabeln) {
    const felder = aktiveAbfrageFelder(vokabel, alleFelderDerWortart(vokabel.wortart));
    const antwort = korrekteAntwort(vokabel, felder);
    try {
      if (!pruefeAntwort(vokabel, felder, antwort).richtig) {
        fehler.push(`${vokabel.id}: correct answer rated wrong: "${antwort}"`);
      }
    } catch (e) {
      fehler.push(`${vokabel.id}: ${e.message}`);
    }
  }
  return fehler;
}

// Catches e.g. words with incomplete forms (nefās) and values containing
// commas (hic, haec, hoc) - every correct answer must be rated correct.
test('every word in the vocabulary can be quizzed with all fields active', () => {
  assert.deepEqual(fehlerBeiKorrekterAntwort(alleVokabeln), []);
});

test('every word in the example vocabulary can be quizzed with all fields active', () => {
  assert.deepEqual(fehlerBeiKorrekterAntwort(alleVokabelnAus(beispielSeed)), []);
});

const hic = {
  wortart: 'sonstiges',
  lemma: 'hic, haec, hoc',
  formen: {},
  bedeutungen: [{ text: 'dieser, diese, dieses', typ: 'muss' }],
};
const simulare = {
  wortart: 'verb',
  lemma: 'simulāre',
  formen: { praesens_1sg: 'simulō' },
  bedeutungen: [{ text: 'vortäuschen', typ: 'muss' }, { text: 'so tun, als ob', typ: 'muss' }],
};

test('values containing commas are assembled from several segments', () => {
  assert.equal(pruefeAntwort(hic, [], 'hic, haec, hoc, dieser, diese, dieses').richtig, true);
  assert.equal(pruefeAntwort(hic, [], 'hic,haec,hoc,dieser,diese,dieses').richtig, true);
  assert.equal(pruefeAntwort(simulare, ['praesens_1sg'], 'simulare, simulo, so tun, als ob, vortäuschen').richtig, true);
});

test('incomplete or wrong comma values stay wrong', () => {
  assert.equal(pruefeAntwort(hic, [], 'hic, haec, hoc, dieser, diese').richtig, false);
  assert.equal(pruefeAntwort(hic, [], 'hic, haec, hoc, dieser, diese, dieses, jener').richtig, false);
  assert.equal(pruefeAntwort(simulare, ['praesens_1sg'], 'simulare, simulo, vortäuschen, so tun').richtig, false);
});

const gens = {
  wortart: 'substantiv',
  lemma: 'gēns',
  formen: { genitiv_sg: 'gentis', genus: 'f', genitiv_pl: 'gentium' },
  bedeutungen: [{ text: 'das Volk', typ: 'muss' }, { text: 'das Geschlecht', typ: 'muss' }],
};

test('genitive plural is quizzed when enabled', () => {
  const felder = ['genitiv_sg', 'genitiv_pl', 'genus'];
  assert.equal(pruefeAntwort(gens, felder, 'gens, gentis, gentium, f, das Volk, das Geschlecht').richtig, true);
  assert.equal(pruefeAntwort(gens, felder, 'gens, gentis, f, das Volk, das Geschlecht').richtig, false);
  assert.equal(pruefeAntwort(gens, felder, 'gens, gentis, gentum, f, das Volk, das Geschlecht').richtig, false);
});

test('genitive plural may be given voluntarily even when not quizzed', () => {
  assert.equal(pruefeAntwort(gens, ['genus'], 'gens, gentium, f, das Volk, das Geschlecht').richtig, true);
});

test('genitive plural with optional letters (sēd(i)um) accepts both forms', () => {
  const sedes = {
    wortart: 'substantiv', lemma: 'sēdēs',
    formen: { genitiv_sg: 'sēdis', genus: 'f', genitiv_pl: 'sēd(i)um' },
    bedeutungen: [{ text: 'der Sitz', typ: 'muss' }],
  };
  for (const gp of ['sedum', 'sedium']) {
    assert.equal(pruefeAntwort(sedes, ['genitiv_pl'], `sedes, ${gp}, der Sitz`).richtig, true, gp);
  }
});

test('no placeholders ("—", "-", empty) as form values in the vocabulary', () => {
  const platzhalter = alleVokabeln.flatMap(v => Object.entries(v.formen)
    .filter(([, wert]) => ['', '-', '–', '—'].includes(wert.trim()))
    .map(([feld]) => `${v.id}.${feld}`));
  assert.deepEqual(platzhalter, []);
});

test('vītāre: perfect passive participle vītātum is quizzed and accepted', () => {
  const vitare = {
    wortart: 'verb', lemma: 'vītāre',
    formen: { praesens_1sg: 'vītō', perfekt_1sg: 'vītāvī', ppp: 'vītātum' },
    bedeutungen: [{ text: '(ver)meiden', typ: 'muss' }],
  };
  const felder = ['praesens_1sg', 'perfekt_1sg', 'ppp'];
  assert.equal(pruefeAntwort(vitare, felder, 'vitare, vito, vitavi, vitatum, meiden').richtig, true);
  assert.equal(pruefeAntwort(vitare, felder, 'vitare, vito, vitavi, meiden').richtig, false);
});

// Every optional ("kann") meaning given in addition to the correct answer
// keeps the answer correct - it does not count as a wrong item.
test('every optional meaning is accepted as an additional item', () => {
  const fehler = [];
  for (const vokabel of alleVokabeln) {
    const felder = aktiveAbfrageFelder(vokabel, alleFelderDerWortart(vokabel.wortart));
    const istVerb = vokabel.wortart === 'verb';
    for (const b of vokabel.bedeutungen.filter(b => b.typ === 'kann')) {
      const antwort = `${korrekteAntwort(vokabel, felder)}, ${sollVarianten(b.text, istVerb)[0]}`;
      if (!pruefeAntwort(vokabel, felder, antwort).richtig) fehler.push(`${vokabel.id}: "${antwort}"`);
    }
  }
  assert.deepEqual(fehler, []);
});

// Genitive equal to nominative (orbis, orbis): naming it once is enough,
// since the lemma itself is not rated - the segment belongs to the genitive.
test('genitive equal to lemma counts even when named only once', () => {
  const orbis = {
    wortart: 'substantiv', lemma: 'orbis',
    formen: { genitiv_sg: 'orbis', genus: 'm' },
    bedeutungen: [{ text: 'der Kreis', typ: 'muss' }],
  };
  const felder = ['genitiv_sg', 'genus'];
  for (const antwort of ['orbis, m, der Kreis', 'orbis, orbis, m, der Kreis']) {
    const ergebnis = pruefeAntwort(orbis, felder, antwort);
    assert.equal(ergebnis.richtig, true, antwort);
    assert.equal(ergebnis.formErgebnisse.genitiv_sg.ok, true, antwort);
  }
  assert.equal(pruefeAntwort(orbis, felder, 'orbis, orbis, orbis, m, der Kreis').richtig, true);
  assert.equal(pruefeAntwort(orbis, felder, 'm, der Kreis').richtig, false);
});

// Adjectives with a form missing in the data (e.g. no feminine, or neither
// feminine nor neuter): the missing form is neither quizzed nor shown (in
// red) in the solution - the display uses the same field list.
test('adjectives without f/n form: only existing forms are active fields', () => {
  const crudelis = { wortart: 'adjektiv', lemma: 'crūdēlis', formen: { n: 'crūdēle' }, bedeutungen: [] };
  const vehemens = { wortart: 'adjektiv', lemma: 'vehemēns', formen: { genitiv: 'vehementis' }, bedeutungen: [] };
  const alleAdjektivFelder = ['f', 'n', 'genitiv'];
  assert.deepEqual(aktiveAbfrageFelder(crudelis, alleAdjektivFelder), ['n']);
  assert.deepEqual(aktiveAbfrageFelder(vehemens, alleAdjektivFelder), ['genitiv']);
});

const dux = {
  wortart: 'substantiv', lemma: 'dux',
  formen: { genitiv_sg: 'ducis', genus: 'm/f' },
  bedeutungen: [{ text: 'der/die Führer(in)', typ: 'muss' }, { text: 'der Feldherr', typ: 'muss' }],
};

test('"der/die Führer(in)": masculine, feminine or both forms are accepted', () => {
  for (const b of ['der Führer', 'die Führerin', 'der Führer, die Führerin',
    'der Führer/die Führerin', 'der/die Führerin']) {
    assert.equal(pruefeAntwort(dux, [], `dux, ${b}, der Feldherr`).richtig, true, b);
  }
  for (const b of ['der Führerin', 'die Führer', 'Führer']) {
    assert.equal(pruefeAntwort(dux, [], `dux, ${b}, der Feldherr`).richtig, false, b);
  }
});

test('two accepted genders: one, both ("m, f", "m/f", "m oder f") - but no wrong one', () => {
  for (const g of ['m', 'f', 'm, f', 'f, m', 'm/f', 'm oder f', 'maskulinum, femininum']) {
    const ergebnis = pruefeAntwort(dux, ['genus'], `dux, ${g}, der Führer, der Feldherr`);
    assert.equal(ergebnis.richtig, true, g);
    assert.equal(ergebnis.genusErgebnis.ok, true, g);
  }
  for (const g of ['n', 'm, n', 'm/f/n']) {
    assert.equal(pruefeAntwort(dux, ['genus'], `dux, ${g}, der Führer, der Feldherr`).richtig, false, g);
  }
});

test('only one accepted gender: giving two is wrong', () => {
  const sol = {
    wortart: 'substantiv', lemma: 'sōl', formen: { genitiv_sg: 'sōlis', genus: 'm' },
    bedeutungen: [{ text: 'die Sonne', typ: 'muss' }],
  };
  assert.equal(pruefeAntwort(sol, ['genus'], 'sol, m, die Sonne').richtig, true);
  assert.equal(pruefeAntwort(sol, ['genus'], 'sol, m, f, die Sonne').richtig, false);
  assert.equal(pruefeAntwort(sol, ['genus'], 'sol, m/f, die Sonne').richtig, false);
});

test('coniūnx: "die Ehefrau, der Ehemann" and "f, m" are accepted', () => {
  const coniunx = {
    wortart: 'substantiv', lemma: 'coniūnx', formen: { genitiv_sg: 'coniugis', genus: 'f/m' },
    bedeutungen: [{ text: 'die (Ehe-)Frau/der (Ehe-)Mann', typ: 'muss' }],
  };
  for (const a of ['coniunx, m, f, die Ehefrau, der Ehemann', 'coniunx, f/m, die Frau', 'coniunx, m, der Mann']) {
    assert.equal(pruefeAntwort(coniunx, ['genus'], a).richtig, true, a);
  }
});

// Irregular imperatives (fac, dūc, fer) have their own field.
test('imperative singular (fac) is accepted and can be quizzed', () => {
  const facere = {
    wortart: 'verb', lemma: 'facere',
    formen: { praesens_1sg: 'faciō', perfekt_1sg: 'fēcī', ppp: 'factum', imperativ_sg: 'fac' },
    bedeutungen: [{ text: 'machen', typ: 'muss' }, { text: '(m. doppeltem Akk.) (jmdn.) machen (zu)', typ: 'kann' }],
  };
  const standard = ['praesens_1sg'];
  assert.equal(pruefeAntwort(facere, standard, 'facere, facio, fac, machen').richtig, true);
  const mitImperativ = ['praesens_1sg', 'imperativ_sg'];
  assert.equal(pruefeAntwort(facere, mitImperativ, 'facere, facio, fac, machen').richtig, true);
  assert.equal(pruefeAntwort(facere, mitImperativ, 'facere, facio, machen').richtig, false);
});

// Ellipses in meanings: the way the dots are typed does not matter, and a
// comma in their place or no dots at all also count.
test('"sowohl ... als auch": ellipsis, comma or nothing', () => {
  const etEt = {
    wortart: 'sonstiges', lemma: 'et ... et', formen: {},
    bedeutungen: [{ text: 'sowohl ... als auch', typ: 'muss' }, { text: 'einerseits ... andererseits', typ: 'muss' }],
  };
  const andere = 'einerseits ... andererseits';
  for (const b of ['sowohl ... als auch', 'sowohl...als auch', 'sowohl … als auch',
    'sowohl, als auch', 'sowohl als auch']) {
    assert.equal(pruefeAntwort(etEt, [], `et et, ${b}, ${andere}`).richtig, true, b);
  }
  assert.equal(pruefeAntwort(etEt, [], 'et et, sowohl, einerseits, andererseits').richtig, false);
  assert.equal(pruefeAntwort(etEt, [], 'et et, sowohl als auch, einerseits').richtig, false);
});

test('comma values still work even though commas also separate items', () => {
  const quiQuaeQuod = {
    wortart: 'sonstiges', lemma: 'quī, quae, quod', formen: {},
    bedeutungen: [{ text: 'der, die, das', typ: 'muss' }, { text: 'wer, was', typ: 'muss' }],
  };
  assert.equal(pruefeAntwort(quiQuaeQuod, [], 'qui, quae, quod, der, die, das, wer, was').richtig, true);
  assert.equal(pruefeAntwort(quiQuaeQuod, [], 'qui, quae, quod, der, die, wer, was').richtig, false);
});

// āiō/ait: required "ich sage", "er, sie, es sagt"; optional "(ich)
// behaupte", "(er, sie, es) behauptet" - optional parts with and without
// pronoun, and the commas inside values and parentheses must not confuse
// the matching.
test('āiō/ait: required and optional parts containing commas are matched correctly', () => {
  const aio = {
    wortart: 'sonstiges', lemma: 'āiō/ait', formen: {},
    bedeutungen: [
      { text: 'ich sage', typ: 'muss' }, { text: '(ich) behaupte', typ: 'kann' },
      { text: 'er, sie, es sagt', typ: 'muss' }, { text: '(er, sie, es) behauptet', typ: 'kann' },
    ],
  };
  for (const a of ['aio, ich sage, er, sie, es sagt',
    'aio, ich sage, behaupte, er, sie, es sagt, behauptet',
    'aio, ich sage, ich behaupte, er, sie, es sagt, er, sie, es behauptet']) {
    assert.equal(pruefeAntwort(aio, [], a).richtig, true, a);
  }
  assert.equal(pruefeAntwort(aio, [], 'aio, ich sage, behaupte').richtig, false);
  assert.equal(pruefeAntwort(aio, [], 'aio, er, sie, es sagt').richtig, false);
});
