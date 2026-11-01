import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeAntwort, aktiveAbfrageFelder, sollVarianten, kombiniereRohtext, hinweisAngaben } from '../www/js/pruefung.js';
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
// first accepted spelling, i.e. without parentheses - e.g. "das Haus"
// instead of "das (Bauern-)Haus".
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

const pondo = {
  wortart: 'substantiv',
  lemma: 'pondō',
  formen: {},
  bedeutungen: [{ text: 'das Pfund', typ: 'muss' }, { text: 'das Gewicht', typ: 'muss' }],
};

test('aktiveAbfrageFelder skips fields the word does not have', () => {
  assert.deepEqual(aktiveAbfrageFelder(pondo, ['genitiv_sg', 'genus']), []);
  assert.deepEqual(
    aktiveAbfrageFelder({ formen: { genitiv_sg: 'lupī', genus: 'm' } }, ['genitiv_sg', 'genus']),
    ['genitiv_sg', 'genus'],
  );
  assert.deepEqual(aktiveAbfrageFelder(pondo, undefined), []);
});

test('indeclinable noun without forms (pondō) is checked instead of crashing', () => {
  const felder = aktiveAbfrageFelder(pondo, ['genitiv_sg', 'genus']);
  assert.equal(pruefeAntwort(pondo, felder, 'pondo, das Pfund, das Gewicht').richtig, true);
  assert.equal(pruefeAntwort(pondo, felder, 'pondo, das Pfund').richtig, false);
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

// Catches e.g. words with incomplete forms (pondō) and values containing
// commas (quotus, quota, quotum) - every correct answer must be rated correct.
test('every word in the vocabulary can be quizzed with all fields active', () => {
  assert.deepEqual(fehlerBeiKorrekterAntwort(alleVokabeln), []);
});

test('every word in the example vocabulary can be quizzed with all fields active', () => {
  assert.deepEqual(fehlerBeiKorrekterAntwort(alleVokabelnAus(beispielSeed)), []);
});

const quotus = {
  wortart: 'sonstiges',
  lemma: 'quotus, quota, quotum',
  formen: {},
  bedeutungen: [{ text: 'der wievielte, die wievielte, das wievielte', typ: 'muss' }],
};
const quinEtiam = {
  wortart: 'sonstiges',
  lemma: 'quīn etiam',
  formen: {},
  bedeutungen: [{ text: 'vielmehr', typ: 'muss' }, { text: 'ja, sogar', typ: 'muss' }],
};

test('values containing commas are assembled from several segments', () => {
  assert.equal(pruefeAntwort(quotus, [], 'quotus, quota, quotum, der wievielte, die wievielte, das wievielte').richtig, true);
  assert.equal(pruefeAntwort(quotus, [], 'quotus,quota,quotum,der wievielte,die wievielte,das wievielte').richtig, true);
  assert.equal(pruefeAntwort(quinEtiam, [], 'quin etiam, ja, sogar, vielmehr').richtig, true);
});

test('incomplete or wrong comma values stay wrong', () => {
  assert.equal(pruefeAntwort(quotus, [], 'quotus, quota, quotum, der wievielte, die wievielte').richtig, false);
  assert.equal(pruefeAntwort(quotus, [], 'quotus, quota, quotum, der wievielte, die wievielte, das wievielte, der letzte').richtig, false);
  assert.equal(pruefeAntwort(quinEtiam, [], 'quin etiam, vielmehr, ja').richtig, false);
});

const nubes = {
  wortart: 'substantiv',
  lemma: 'nūbēs',
  formen: { genitiv_sg: 'nūbis', genus: 'f', genitiv_pl: 'nūbium' },
  bedeutungen: [{ text: 'die Wolke', typ: 'muss' }, { text: 'der Nebel', typ: 'muss' }],
};

test('genitive plural is quizzed when enabled', () => {
  const felder = ['genitiv_sg', 'genitiv_pl', 'genus'];
  assert.equal(pruefeAntwort(nubes, felder, 'nubes, nubis, nubium, f, die Wolke, der Nebel').richtig, true);
  assert.equal(pruefeAntwort(nubes, felder, 'nubes, nubis, f, die Wolke, der Nebel').richtig, false);
  assert.equal(pruefeAntwort(nubes, felder, 'nubes, nubis, nubum, f, die Wolke, der Nebel').richtig, false);
});

test('genitive plural may be given voluntarily even when not quizzed', () => {
  assert.equal(pruefeAntwort(nubes, ['genus'], 'nubes, nubium, f, die Wolke, der Nebel').richtig, true);
});

test('genitive plural with optional letters (ap(i)um) accepts both forms', () => {
  const apis = {
    wortart: 'substantiv', lemma: 'apis',
    formen: { genitiv_sg: 'apis', genus: 'f', genitiv_pl: 'ap(i)um' },
    bedeutungen: [{ text: 'die Biene', typ: 'muss' }],
  };
  for (const gp of ['apum', 'apium']) {
    assert.equal(pruefeAntwort(apis, ['genitiv_pl'], `apis, ${gp}, die Biene`).richtig, true, gp);
  }
});

test('no placeholders ("—", "-", empty) as form values in the vocabulary', () => {
  const platzhalter = alleVokabeln.flatMap(v => Object.entries(v.formen)
    .filter(([, wert]) => ['', '-', '–', '—'].includes(wert.trim()))
    .map(([feld]) => `${v.id}.${feld}`));
  assert.deepEqual(platzhalter, []);
});

test('perfect passive participle (cantātum) is quizzed and accepted', () => {
  const cantare = {
    wortart: 'verb', lemma: 'cantāre',
    formen: { praesens_1sg: 'cantō', perfekt_1sg: 'cantāvī', ppp: 'cantātum' },
    bedeutungen: [{ text: 'singen', typ: 'muss' }],
  };
  const felder = ['praesens_1sg', 'perfekt_1sg', 'ppp'];
  assert.equal(pruefeAntwort(cantare, felder, 'cantare, canto, cantavi, cantatum, singen').richtig, true);
  assert.equal(pruefeAntwort(cantare, felder, 'cantare, canto, cantavi, singen').richtig, false);
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

// Genitive equal to nominative (ovis, ovis): naming it once is enough,
// since the lemma itself is not rated - the segment belongs to the genitive.
test('genitive equal to lemma counts even when named only once', () => {
  const ovis = {
    wortart: 'substantiv', lemma: 'ovis',
    formen: { genitiv_sg: 'ovis', genus: 'f' },
    bedeutungen: [{ text: 'das Schaf', typ: 'muss' }],
  };
  const felder = ['genitiv_sg', 'genus'];
  for (const antwort of ['ovis, f, das Schaf', 'ovis, ovis, f, das Schaf']) {
    const ergebnis = pruefeAntwort(ovis, felder, antwort);
    assert.equal(ergebnis.richtig, true, antwort);
    assert.equal(ergebnis.formErgebnisse.genitiv_sg.ok, true, antwort);
  }
  assert.equal(pruefeAntwort(ovis, felder, 'ovis, ovis, ovis, f, das Schaf').richtig, true);
  assert.equal(pruefeAntwort(ovis, felder, 'f, das Schaf').richtig, false);
});

// Adjectives with a form missing in the data (e.g. no feminine, or neither
// feminine nor neuter): the missing form is neither quizzed nor shown (in
// red) in the solution - the display uses the same field list.
test('adjectives without f/n form: only existing forms are active fields', () => {
  const tristis = { wortart: 'adjektiv', lemma: 'tristis', formen: { n: 'triste' }, bedeutungen: [] };
  const prudens = { wortart: 'adjektiv', lemma: 'prūdēns', formen: { genitiv: 'prūdentis' }, bedeutungen: [] };
  const alleAdjektivFelder = ['f', 'n', 'genitiv'];
  assert.deepEqual(aktiveAbfrageFelder(tristis, alleAdjektivFelder), ['n']);
  assert.deepEqual(aktiveAbfrageFelder(prudens, alleAdjektivFelder), ['genitiv']);
});

const artifex = {
  wortart: 'substantiv', lemma: 'artifex',
  formen: { genitiv_sg: 'artificis', genus: 'm/f' },
  bedeutungen: [{ text: 'der/die Künstler(in)', typ: 'muss' }, { text: 'der Handwerker', typ: 'muss' }],
};

test('"der/die Künstler(in)": masculine, feminine or both forms are accepted', () => {
  for (const b of ['der Künstler', 'die Künstlerin', 'der Künstler, die Künstlerin',
    'der Künstler/die Künstlerin', 'der/die Künstlerin']) {
    assert.equal(pruefeAntwort(artifex, [], `artifex, ${b}, der Handwerker`).richtig, true, b);
  }
  for (const b of ['der Künstlerin', 'die Künstler', 'Künstler']) {
    assert.equal(pruefeAntwort(artifex, [], `artifex, ${b}, der Handwerker`).richtig, false, b);
  }
});

test('two accepted genders: one, both ("m, f", "m/f", "m oder f") - but no wrong one', () => {
  for (const g of ['m', 'f', 'm, f', 'f, m', 'm/f', 'm oder f', 'maskulinum, femininum']) {
    const ergebnis = pruefeAntwort(artifex, ['genus'], `artifex, ${g}, der Künstler, der Handwerker`);
    assert.equal(ergebnis.richtig, true, g);
    assert.equal(ergebnis.genusErgebnis.ok, true, g);
  }
  for (const g of ['n', 'm, n', 'm/f/n']) {
    assert.equal(pruefeAntwort(artifex, ['genus'], `artifex, ${g}, der Künstler, der Handwerker`).richtig, false, g);
  }
});

test('only one accepted gender: giving two is wrong', () => {
  const lupus = {
    wortart: 'substantiv', lemma: 'lupus', formen: { genitiv_sg: 'lupī', genus: 'm' },
    bedeutungen: [{ text: 'der Wolf', typ: 'muss' }],
  };
  assert.equal(pruefeAntwort(lupus, ['genus'], 'lupus, m, der Wolf').richtig, true);
  assert.equal(pruefeAntwort(lupus, ['genus'], 'lupus, m, f, der Wolf').richtig, false);
  assert.equal(pruefeAntwort(lupus, ['genus'], 'lupus, m/f, der Wolf').richtig, false);
});

test('cōnsors: "die Briefpartnerin, der Briefpartner" and "f, m" are accepted', () => {
  const consors = {
    wortart: 'substantiv', lemma: 'cōnsors', formen: { genitiv_sg: 'cōnsortis', genus: 'f/m' },
    bedeutungen: [{ text: 'die (Brief-)Partnerin/der (Brief-)Partner', typ: 'muss' }],
  };
  for (const a of ['consors, m, f, die Briefpartnerin, der Briefpartner', 'consors, f/m, die Partnerin', 'consors, m, der Partner']) {
    assert.equal(pruefeAntwort(consors, ['genus'], a).richtig, true, a);
  }
});

// Irregular imperatives (fac, dūc, fer) have their own field.
test('imperative singular (ēdūc) is accepted and can be quizzed', () => {
  const educere = {
    wortart: 'verb', lemma: 'ēdūcere',
    formen: { praesens_1sg: 'ēdūcō', perfekt_1sg: 'ēdūxī', ppp: 'ēductum', imperativ_sg: 'ēdūc' },
    bedeutungen: [{ text: 'herausführen', typ: 'muss' }, { text: '(Truppen) ausrücken lassen', typ: 'kann' }],
  };
  const standard = ['praesens_1sg'];
  assert.equal(pruefeAntwort(educere, standard, 'educere, educo, educ, herausführen').richtig, true);
  const mitImperativ = ['praesens_1sg', 'imperativ_sg'];
  assert.equal(pruefeAntwort(educere, mitImperativ, 'educere, educo, educ, herausführen').richtig, true);
  assert.equal(pruefeAntwort(educere, mitImperativ, 'educere, educo, herausführen').richtig, false);
});

// Ellipses in meanings: the way the dots are typed does not matter, and a
// comma in their place or no dots at all also count.
test('"sei es ... sei es": ellipsis, comma or nothing', () => {
  const siveSive = {
    wortart: 'sonstiges', lemma: 'sīve ... sīve', formen: {},
    bedeutungen: [{ text: 'sei es ... sei es', typ: 'muss' }, { text: 'ob ... oder', typ: 'muss' }],
  };
  const andere = 'ob ... oder';
  for (const b of ['sei es ... sei es', 'sei es...sei es', 'sei es … sei es',
    'sei es, sei es', 'sei es sei es']) {
    assert.equal(pruefeAntwort(siveSive, [], `sive sive, ${b}, ${andere}`).richtig, true, b);
  }
  assert.equal(pruefeAntwort(siveSive, [], 'sive sive, sei es, ob, oder').richtig, false);
  assert.equal(pruefeAntwort(siveSive, [], 'sive sive, sei es sei es, ob').richtig, false);
});

test('comma values still work even though commas also separate items', () => {
  const quicumque = {
    wortart: 'sonstiges', lemma: 'quīcumque, quaecumque, quodcumque', formen: {},
    bedeutungen: [{ text: 'jeder, der', typ: 'muss' }, { text: 'wer auch immer, was auch immer', typ: 'muss' }],
  };
  const lemma = 'quicumque, quaecumque, quodcumque';
  assert.equal(pruefeAntwort(quicumque, [], `${lemma}, jeder, der, wer auch immer, was auch immer`).richtig, true);
  assert.equal(pruefeAntwort(quicumque, [], `${lemma}, jeder, der, wer auch immer`).richtig, false);
});

// volō/vult: required "ich will", "er, sie, es will"; optional "(ich)
// wünsche", "(er, sie, es) wünscht" - optional parts with and without
// pronoun, and the commas inside values and parentheses must not confuse
// the matching.
test('volō/vult: required and optional parts containing commas are matched correctly', () => {
  const volo = {
    wortart: 'sonstiges', lemma: 'volō/vult', formen: {},
    bedeutungen: [
      { text: 'ich will', typ: 'muss' }, { text: '(ich) wünsche', typ: 'kann' },
      { text: 'er, sie, es will', typ: 'muss' }, { text: '(er, sie, es) wünscht', typ: 'kann' },
    ],
  };
  for (const a of ['volo, ich will, er, sie, es will',
    'volo, ich will, wünsche, er, sie, es will, wünscht',
    'volo, ich will, ich wünsche, er, sie, es will, er, sie, es wünscht']) {
    assert.equal(pruefeAntwort(volo, [], a).richtig, true, a);
  }
  assert.equal(pruefeAntwort(volo, [], 'volo, ich will, wünsche').richtig, false);
  assert.equal(pruefeAntwort(volo, [], 'volo, er, sie, es will').richtig, false);
});

// Meaning typed literally, parentheses included (e.g. "(be)glückwünschen")
// - user feedback 2026-10-29.
test('meaning typed exactly as listed, with parentheses, is accepted', () => {
  const gratulari = {
    wortart: 'verb', lemma: 'grātulārī',
    formen: { praesens_1sg: 'grātulor', perfekt_1sg: 'grātulātus sum' },
    bedeutungen: [{ text: '(be)glückwünschen', typ: 'muss' }],
  };
  const felder = ['praesens_1sg', 'perfekt_1sg'];
  for (const bedeutung of ['(be)glückwünschen', '(be)glueckwuenschen', 'beglückwünschen', 'glückwünschen']) {
    assert.equal(pruefeAntwort(gratulari, felder, `gratulari, gratulor, gratulatus sum, ${bedeutung}`).richtig, true, bedeutung);
  }
});

test('every meaning with parentheses is accepted when typed exactly as listed', () => {
  const fehler = [];
  for (const vokabel of alleVokabeln) {
    const felder = aktiveAbfrageFelder(vokabel, alleFelderDerWortart(vokabel.wortart));
    const muss = vokabel.bedeutungen.filter(b => b.typ === 'muss');
    muss.forEach((b, i) => {
      if (!b.text.includes('(')) return;
      const andere = muss.filter((_, j) => j !== i).map(a => sollVarianten(a.text, vokabel.wortart === 'verb')[0]);
      const lemmaUndFormen = [sollVarianten(vokabel.lemma)[0], ...felder.map(f => (f === 'genus'
        ? vokabel.formen.genus.split('/')[0]
        : sollVarianten(vokabel.formen[f])[0]))];
      const antwort = [...lemmaUndFormen, b.text, ...andere].join(', ');
      if (!pruefeAntwort(vokabel, felder, antwort).richtig) fehler.push(`${vokabel.id}: "${antwort}"`);
    });
  }
  assert.deepEqual(fehler, []);
});

// "/" between single words of a longer expression: each full expression
// counts on its own, and both together - user feedback 2026-10-29.
test('slash between single words: every full expression is accepted', () => {
  const tace = {
    wortart: 'sonstiges', lemma: 'tacē!/tacēte!', formen: {},
    bedeutungen: [{ text: 'sei/seid still!', typ: 'muss' }],
  };
  for (const bedeutung of ['sei still', 'seid still!', 'sei still, seid still', 'sei/seid still!']) {
    assert.equal(pruefeAntwort(tace, [], `tace, ${bedeutung}`).richtig, true, bedeutung);
  }
  // One side alone is incomplete and does not count.
  for (const bedeutung of ['sei', 'seid still, sei']) {
    assert.equal(pruefeAntwort(tace, [], `tace, ${bedeutung}`).richtig, false, bedeutung);
  }
  assert.deepEqual(sollVarianten('die vordere Tür/Seite').sort(),
    ['die vordere Seite', 'die vordere Tür', 'die vordere Tür/Seite']);
  // Left side ends with "!"/"?": both sides are complete exclamations.
  assert.deepEqual(sollVarianten('hör zu!/hört!').sort(), ['hör zu!', 'hör zu!/hört!', 'hört!']);
  // Both sides several words: already complete alternatives, nothing mixed.
  assert.deepEqual(sollVarianten('der Lehrer/die Lehrerin').sort(),
    ['der Lehrer', 'der Lehrer/die Lehrerin', 'die Lehrerin']);
});

test('every meaning with a slash is accepted with each full expression', () => {
  const fehler = [];
  for (const vokabel of alleVokabeln) {
    const felder = aktiveAbfrageFelder(vokabel, alleFelderDerWortart(vokabel.wortart));
    const istVerb = vokabel.wortart === 'verb';
    const lemmaUndFormen = [sollVarianten(vokabel.lemma)[0], ...felder.map(f => (f === 'genus'
      ? vokabel.formen.genus.split('/')[0]
      : sollVarianten(vokabel.formen[f])[0]))];
    const muss = vokabel.bedeutungen.filter(b => b.typ === 'muss');
    muss.forEach((b, i) => {
      // "der/die Künstler(in)" has its own rule (ARTIKEL_PAAR), tested elsewhere.
      if (b.text.startsWith('der/die ')) return;
      const seiten = b.text.split('/');
      if (seiten.length !== 2) return;
      if (/[!?]$/.test(seiten[0].trim())) return;
      const [links, rechts] = seiten.map(s => s.trim().split(/\s+/));
      let ausdruecke;
      if (links.length === 1 && rechts.length > 1) ausdruecke = [[links[0], ...rechts.slice(1)], rechts];
      else if (rechts.length === 1 && links.length > 1) ausdruecke = [links, [...links.slice(0, -1), rechts[0]]];
      else return;
      const andere = muss.filter((_, j) => j !== i).map(a => sollVarianten(a.text, istVerb)[0]);
      for (const ausdruck of ausdruecke) {
        const antwort = [...lemmaUndFormen, ausdruck.join(' ').replace(/[()]/g, ''), ...andere].join(', ');
        if (!pruefeAntwort(vokabel, felder, antwort).richtig) fehler.push(`${vokabel.id}: "${antwort}"`);
      }
    });
  }
  assert.deepEqual(fehler, []);
});

// Missing-article follow-up only for meanings that start with der/die/das:
// "leiben" + "das" must not pass as "da bleiben" via typo tolerance.
test('no article follow-up for a meaning without an article', () => {
  const remanere = {
    wortart: 'verb', lemma: 'remanēre',
    formen: { praesens_1sg: 'remaneō', perfekt_1sg: 'remānsī' },
    bedeutungen: [{ text: '(da)bleiben', typ: 'muss' }],
  };
  const [bedeutung] = pruefeAntwort(remanere, ['praesens_1sg'], 'remanere, remaneo, leiben').bedeutungErgebnisse;
  assert.equal(bedeutung.ok, false);
  assert.equal(bedeutung.fehltNurArtikel, false);
  const lupus = {
    wortart: 'substantiv', lemma: 'lupus', formen: {},
    bedeutungen: [{ text: 'der Wolf', typ: 'muss' }],
  };
  assert.equal(pruefeAntwort(lupus, [], 'lupus, Wolf').bedeutungErgebnisse[0].fehltNurArtikel, true);
});

// Optional meaning given without its article ("Windstille" for
// tranquillitās): it is recognised as such, so the follow-up can ask for
// the article.
test('missing article is detected for optional meanings too', () => {
  const tranquillitas = {
    wortart: 'substantiv', lemma: 'tranquillitās',
    formen: { genitiv_sg: 'tranquillitātis', genus: 'f' },
    bedeutungen: [
      { text: 'die Gelassenheit', typ: 'muss' },
      { text: 'die Windstille', typ: 'kann' },
      { text: 'das Gleichmaß', typ: 'kann' },
    ],
  };
  const ergebnis = pruefeAntwort(tranquillitas, [], 'tranquillitas, Windstille');
  assert.equal(ergebnis.bedeutungErgebnisse[0].fehltNurArtikel, false);
  assert.equal(ergebnis.kannBedeutungErgebnisse[0].fehltNurArtikel, true);
  assert.equal(ergebnis.kannBedeutungErgebnisse[0].artikelKandidatSegment, 'Windstille');
  assert.equal(ergebnis.kannBedeutungErgebnisse[1].fehltNurArtikel, false);
  // A segment is the article candidate of at most one meaning.
  const doppelt = {
    ...tranquillitas,
    bedeutungen: [{ text: 'die Gelassenheit', typ: 'muss' }, { text: 'die Gelassenheit', typ: 'kann' }],
  };
  const r = pruefeAntwort(doppelt, [], 'tranquillitas, Gelassenheit');
  assert.equal(r.bedeutungErgebnisse[0].fehltNurArtikel, true);
  assert.equal(r.kannBedeutungErgebnisse[0].fehltNurArtikel, false);
});

// Two genders, each said along with its meaning - as the quiz hint suggests
// ("Genus kannst du einfach mit dazusagen"). Previously only the first one
// was recognised, the second meaning counted as a wrong extra item.
test('two genders, each attached to its meaning, are accepted', () => {
  const discipulus = {
    wortart: 'substantiv', lemma: 'discipulus/discipula', formen: { genus: 'm/f' },
    bedeutungen: [{ text: 'der Schüler/die Schülerin', typ: 'muss' }],
  };
  for (const antwort of [
    'discipulus, der Schüler maskulinum, die Schülerin femininum',
    'discipulus, maskulinum der Schüler, femininum die Schülerin',
    'discipulus, der Schüler maskulinum',
    'discipulus, maskulinum oder femininum, der Schüler',
  ]) {
    assert.equal(pruefeAntwort(discipulus, ['genus'], antwort).richtig, true, antwort);
  }
  // a gender that does not fit still makes the answer wrong
  assert.equal(pruefeAntwort(discipulus, ['genus'], 'discipulus, der Schüler maskulinum, die Schülerin neutrum').richtig, false);
  // one-gender noun: a second, different gender is wrong
  const lupus = { wortart: 'substantiv', lemma: 'lupus', formen: { genus: 'm' }, bedeutungen: [{ text: 'der Wolf', typ: 'muss' }, { text: 'der Räuber', typ: 'kann' }] };
  assert.equal(pruefeAntwort(lupus, ['genus'], 'lupus, der Wolf maskulinum, der Räuber femininum').richtig, false);
  assert.equal(pruefeAntwort(lupus, ['genus'], 'lupus, der Wolf maskulinum, der Räuber maskulinum').richtig, true);
});

// Article follow-up when the gender was attached to the meaning ("Wolf m"):
// the answer "der" must go in front of "Wolf" inside that segment, not
// become a separate segment that counts as a second (wrong) gender.
test('article follow-up works when the gender is attached to the meaning', () => {
  const lupus = {
    wortart: 'substantiv', lemma: 'lupus', formen: { genitiv_sg: 'lupī', genus: 'm' },
    bedeutungen: [{ text: 'der Wolf', typ: 'muss' }],
  };
  for (const erste of ['lupus, lupi, Wolf m', 'lupus, lupi, maskulinum Wolf', 'lupus, lupi, m, Wolf']) {
    const ergebnis = pruefeAntwort(lupus, ['genitiv_sg', 'genus'], erste);
    const [bedeutung] = ergebnis.bedeutungErgebnisse;
    assert.equal(bedeutung.fehltNurArtikel, true, erste);
    const eintrag = { segment: bedeutung.artikelKandidatSegment, korrektesWort: 'Wolf' };
    for (const antwort of ['der', 'der Wolf']) {
      const rohtext = kombiniereRohtext(eintrag, erste, antwort);
      assert.equal(pruefeAntwort(lupus, ['genitiv_sg', 'genus'], rohtext).richtig, true, `${erste} + ${antwort}: ${rohtext}`);
    }
  }
});


const fodere = {
  wortart: 'verb',
  lemma: 'fodere',
  formen: { praesens_1sg: 'fodiō', perfekt_1sg: 'fōdī' },
  bedeutungen: [{ text: 'graben (nach)', typ: 'muss' }],
};
const agricola = {
  wortart: 'substantiv',
  lemma: 'agricola',
  formen: { genitiv_sg: 'agricolae', genus: 'm', genitiv_pl: 'agricolārum' },
  bedeutungen: [{ text: 'der Landwirt', typ: 'muss' }],
};

test('no typo tolerance in the ending of Latin forms (fodeo is not fodio)', () => {
  const felder = ['praesens_1sg', 'perfekt_1sg'];
  assert.equal(pruefeAntwort(fodere, felder, 'fodere, fodio, fodi, graben').richtig, true);
  assert.equal(pruefeAntwort(fodere, felder, 'fodere, fodeo, fodi, graben').richtig, false);
  assert.equal(pruefeAntwort(agricola, ['genitiv_pl'], 'agricola, agricolorum, der Landwirt').richtig, false);
  // The lemma is Latin as well.
  assert.equal(pruefeAntwort(fodere, felder, 'fodare, fodio, fodi, graben').richtig, false);
});

test('typos in the stem of Latin forms and in German meanings are still tolerated', () => {
  assert.equal(pruefeAntwort(agricola, ['genitiv_pl'], 'agricola, acricolarum, der Landwirt').richtig, true);
  assert.equal(pruefeAntwort(fodere, ['praesens_1sg', 'perfekt_1sg'], 'fodere, fodio, fodi, grabem').richtig, true);
});

test('tolerated typos are reported, normalisation differences are not', () => {
  const felder = ['praesens_1sg', 'perfekt_1sg'];
  assert.deepEqual(pruefeAntwort(fodere, felder, 'fodere, fodio, fodi, grabem').tippfehler,
    [{ getippt: 'grabem', soll: 'graben' }]);
  assert.deepEqual(pruefeAntwort(agricola, ['genitiv_pl'], 'acricola, acricolarum, der Lamdwirt').tippfehler, [
    { getippt: 'acricola', soll: 'agricola' },
    { getippt: 'acricolarum', soll: 'agricolārum' },
    { getippt: 'der Lamdwirt', soll: 'der Landwirt' },
  ]);
  assert.deepEqual(pruefeAntwort(fodere, felder, 'fodere, fodiō, fōdī, graben nach').tippfehler, []);
  assert.deepEqual(pruefeAntwort(fodere, felder, 'fodere, fodio, fodi, graben').tippfehler, []);
});

const cremare = {
  wortart: 'verb',
  lemma: 'cremāre',
  formen: { praesens_1sg: 'cremō' },
  bedeutungen: [{ text: 'verbrennen', typ: 'muss' }, { text: 'einäschern', typ: 'kann' }],
};
const speculari = {
  wortart: 'verb',
  lemma: 'speculārī',
  formen: { praesens_1sg: 'speculor', perfekt_1sg: 'speculātus sum' },
  bedeutungen: [{ text: 'auskundschaften', typ: 'muss' }],
};
const peritus = {
  wortart: 'adjektiv',
  lemma: 'perītus',
  formen: {},
  bedeutungen: [{ text: 'erfahren', typ: 'muss' }],
};

test('a doubled or missing double letter is tolerated from 7 letters on', () => {
  assert.equal(pruefeAntwort(cremare, [], 'verbrennnen').richtig, true);
  assert.equal(pruefeAntwort(cremare, [], 'verbrenen').richtig, true);
  const mitKann = pruefeAntwort(cremare, [], 'verbrennen, einäschhern');
  assert.equal(mitKann.richtig, true);
  assert.deepEqual(mitKann.tippfehler, [{ getippt: 'einäschhern', soll: 'einäschern' }]);
  assert.equal(pruefeAntwort(speculari, ['perfekt_1sg'], 'specculatus sum, auskundschaften').richtig, true);
});

test('no other missing or extra letters, none in short words or Latin endings', () => {
  assert.equal(pruefeAntwort(cremare, [], 'vebrennen').richtig, false);
  assert.equal(pruefeAntwort(speculari, ['perfekt_1sg'], 'spculatus sum, auskundschaften').richtig, false);
  assert.equal(pruefeAntwort(fodere, [], 'graen').richtig, false);
  assert.equal(pruefeAntwort(fodere, [], 'grabben').richtig, false);
  assert.equal(pruefeAntwort(peritus, [], 'erfahrene').richtig, false);
  assert.equal(pruefeAntwort(cremare, [], 'verbrenne').richtig, false);
  assert.equal(pruefeAntwort(speculari, ['perfekt_1sg'], 'speculatu sum, auskundschaften').richtig, false);
  assert.equal(pruefeAntwort(speculari, ['perfekt_1sg'], 'speculatus suum, auskundschaften').richtig, false);
  assert.equal(pruefeAntwort(speculari, ['praesens_1sg'], 'speculori, auskundschaften').richtig, false);
});

const neuter = {
  wortart: 'sonstiges',
  lemma: 'neuter, neutra, neutrum',
  formen: { genitiv: 'neutrīus' },
  bedeutungen: [{ text: 'keiner (von beiden)', typ: 'muss' }],
  hinweis: 'Dat. neutrī',
};
const ecquis = {
  wortart: 'sonstiges',
  lemma: 'ecquis',
  formen: {},
  bedeutungen: [{ text: 'ob jemand', typ: 'muss' }],
  hinweis: 'Fragewort: erwartet die Antwort nein; "etwa jemand?" in direkter Frage',
};

test('hinweisAngaben: parts, forms without case label, text after a colon', () => {
  const texte = h => hinweisAngaben(h).map(a => a.text);
  assert.deepEqual(texte('Dat. neutrī'), ['Dat. neutrī', 'neutrī']);
  assert.deepEqual(texte('Akk. puppim, Abl. puppī; Pl. puppēs'),
    ['Akk. puppim, Abl. puppī', 'Akk. puppim', 'puppim', 'Abl. puppī', 'puppī', 'Pl. puppēs', 'puppēs']);
  assert.deepEqual(texte('Nom./Akk. Pl. n memora'), ['Nom./Akk. Pl. n memora', 'memora']);
  assert.deepEqual(texte('Gen. Pl. auch nummum'), ['Gen. Pl. auch nummum', 'nummum']);
  assert.deepEqual(texte(ecquis.hinweis),
    ['Fragewort: erwartet die Antwort nein', 'erwartet die Antwort nein', 'etwa jemand? in direkter Frage']);
  assert.deepEqual(texte('Deponens'), ['Deponens']);
  assert.deepEqual(hinweisAngaben(undefined), []);
});

test('details from the hint are accepted as extras, but not required', () => {
  assert.equal(pruefeAntwort(neuter, ['genitiv'], 'neutrius, neutri, keiner von beiden').richtig, true);
  assert.equal(pruefeAntwort(neuter, ['genitiv'], 'neutrius, Dat. neutri, keiner von beiden').richtig, true);
  assert.equal(pruefeAntwort(neuter, ['genitiv'], 'neutrius, keiner von beiden').richtig, true);
  assert.equal(pruefeAntwort(ecquis, [], 'ob jemand, Fragewort: erwartet die Antwort nein').richtig, true);
  assert.equal(pruefeAntwort(ecquis, [], 'ob jemand, erwartet die Antwort nein').richtig, true);
  // Still graded: the hint does not replace a meaning, and Latin endings stay strict.
  assert.equal(pruefeAntwort(ecquis, [], 'erwartet die Antwort nein').richtig, false);
  assert.equal(pruefeAntwort(neuter, ['genitiv'], 'neutrius, neutre, keiner von beiden').richtig, false);
});
