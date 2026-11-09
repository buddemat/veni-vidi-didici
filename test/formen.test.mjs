import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bildeFormen, bestimmungText, bestimmungenText, hinweisFormen, klammerVarianten } from '../www/js/formen.js';
import { sucheVokabeln } from '../www/js/suche.js';

// Beispiel- bzw. erfundene Einträge (keine Buchinhalte, PLAN.md Punkt 35).
function substantiv(lemma, genitiv_sg, genus, extra = {}) {
  return { id: 'X', wortart: 'substantiv', lemma, formen: { genitiv_sg, genus, ...extra.formen }, bedeutungen: [], hinweis: extra.hinweis };
}

// Paradigma als { 'Nom. Sg.': 'form1/form2', ... } zum Vergleichen.
function tabelle(vokabel) {
  const t = {};
  for (const { form, bestimmung } of bildeFormen(vokabel)) {
    const k = bestimmungText(bestimmung);
    t[k] = t[k] ? `${t[k]}/${form}` : form;
  }
  return t;
}

const reihe = (sg, pl) => ({
  'Nom. Sg.': sg[0], 'Gen. Sg.': sg[1], 'Dat. Sg.': sg[2], 'Akk. Sg.': sg[3], 'Abl. Sg.': sg[4],
  'Nom. Pl.': pl[0], 'Gen. Pl.': pl[1], 'Dat. Pl.': pl[2], 'Akk. Pl.': pl[3], 'Abl. Pl.': pl[4],
});

test('1. Deklination', () => {
  assert.deepEqual(tabelle(substantiv('rosa', 'rosae', 'f')), reihe(
    ['rosa', 'rosae', 'rosae', 'rosam', 'rosā'], ['rosae', 'rosārum', 'rosīs', 'rosās', 'rosīs'],
  ));
});

test('2. Deklination: -us mit Vokativ, -er, -ius, Neutrum', () => {
  assert.deepEqual(tabelle(substantiv('lupus', 'lupī', 'm')), {
    ...reihe(['lupus', 'lupī', 'lupō', 'lupum', 'lupō'], ['lupī', 'lupōrum', 'lupīs', 'lupōs', 'lupīs']),
    'Vok. Sg.': 'lupe',
  });
  assert.deepEqual(tabelle(substantiv('faber', 'fabrī', 'm')), reihe(
    ['faber', 'fabrī', 'fabrō', 'fabrum', 'fabrō'], ['fabrī', 'fabrōrum', 'fabrīs', 'fabrōs', 'fabrīs'],
  ));
  assert.equal(tabelle(substantiv('radius', 'radiī', 'm'))['Vok. Sg.'], 'radī');
  assert.deepEqual(tabelle(substantiv('templum', 'templī', 'n')), reihe(
    ['templum', 'templī', 'templō', 'templum', 'templō'], ['templa', 'templōrum', 'templīs', 'templa', 'templīs'],
  ));
});

test('3. Deklination: konsonantisch, Neutrum, i-Stämme', () => {
  assert.deepEqual(tabelle(substantiv('flōs', 'flōris', 'm')), reihe(
    ['flōs', 'flōris', 'flōrī', 'flōrem', 'flōre'], ['flōrēs', 'flōrum', 'flōribus', 'flōrēs', 'flōribus'],
  ));
  // Nominativ auf -us, aber 3. Deklination (Genitiv entscheidet).
  assert.equal(tabelle(substantiv('lepus', 'leporis', 'm'))['Akk. Pl.'], 'leporēs');
  assert.deepEqual(tabelle(substantiv('animal', 'animālis', 'n')), reihe(
    ['animal', 'animālis', 'animālī', 'animal', 'animālī'], ['animālia', 'animālium', 'animālibus', 'animālia', 'animālibus'],
  ));
  assert.equal(tabelle(substantiv('rēte', 'rētis', 'n'))['Nom. Pl.'], 'rētia');
  // Gleichsilbig ohne Angabe: beide Gen.-Pl.-Formen.
  assert.equal(tabelle(substantiv('ovis', 'ovis', 'f'))['Gen. Pl.'], 'ovium/ovum');
  // Angegebener Gen. Pl. hat Vorrang, auch mit optionalem i.
  assert.equal(tabelle(substantiv('vulpēs', 'vulpis', 'f', { formen: { genitiv_pl: 'vulp(i)um' } }))['Gen. Pl.'], 'vulpium/vulpum');
});

test('4. und 5. Deklination', () => {
  assert.deepEqual(tabelle(substantiv('portus', 'portūs', 'm')), reihe(
    ['portus', 'portūs', 'portuī', 'portum', 'portū'], ['portūs', 'portuum', 'portibus', 'portūs', 'portibus'],
  ));
  assert.deepEqual(tabelle(substantiv('cornū', 'cornūs', 'n')), reihe(
    ['cornū', 'cornūs', 'cornū', 'cornū', 'cornū'], ['cornua', 'cornuum', 'cornibus', 'cornua', 'cornibus'],
  ));
  assert.deepEqual(tabelle(substantiv('glaciēs', 'glaciēī', 'f')), reihe(
    ['glaciēs', 'glaciēī', 'glaciēī', 'glaciem', 'glaciē'], ['glaciēs', 'glaciērum', 'glaciēbus', 'glaciēs', 'glaciēbus'],
  ));
});

test('Pluralwörter: nur Pluralformen', () => {
  const pl = (nom, gen, dat, akk) => ({
    'Nom. Pl.': nom, 'Gen. Pl.': gen, 'Dat. Pl.': dat, 'Akk. Pl.': akk, 'Abl. Pl.': dat,
  });
  assert.deepEqual(tabelle(substantiv('tenebrae', 'tenebrārum', 'f')), pl('tenebrae', 'tenebrārum', 'tenebrīs', 'tenebrās'));
  assert.deepEqual(tabelle(substantiv('cancellī', 'cancellōrum', 'm')), pl('cancellī', 'cancellōrum', 'cancellīs', 'cancellōs'));
  assert.deepEqual(tabelle(substantiv('forēs', 'forum', 'f')), pl('forēs', 'forum', 'foribus', 'forēs'));
});

test('Lemma mit Schrägstrich: paarweise mit Genitiv und Genus', () => {
  const t = tabelle(substantiv('discipulus/discipula', 'discipulī/discipulae', 'm/f'));
  assert.equal(t['Akk. Sg.'], 'discipulum/discipulam');
  assert.equal(t['Vok. Sg.'], 'discipule');
  assert.equal(t['Dat. Pl.'], 'discipulīs');
});

test('mehrteiliges Lemma: Wörter einzeln dekliniert und zusammengesetzt', () => {
  const t = tabelle(substantiv('rosa alba', 'rosae albae', 'f'));
  assert.equal(t['Akk. Sg.'], 'rosam albam');
  assert.equal(t['Gen. Pl.'], 'rosārum albārum');
});

test('Formen aus dem Hinweis ersetzen die erzeugten, mit "auch" ergänzen sie', () => {
  assert.deepEqual(hinweisFormen('Abl. Sg. flōrī, Nom./Akk. Pl. n flōra; Nom. Pl. auch flī; Akk. vim; Pluralwort'), [
    { form: 'flōrī', bestimmung: { kasus: 'abl', numerus: 'sg' }, auch: false },
    { form: 'flōra', bestimmung: { kasus: 'nom', numerus: 'pl', genus: 'n' }, auch: false },
    { form: 'flōra', bestimmung: { kasus: 'akk', numerus: 'pl', genus: 'n' }, auch: false },
    { form: 'flī', bestimmung: { kasus: 'nom', numerus: 'pl' }, auch: true },
    { form: 'vim', bestimmung: { kasus: 'akk', numerus: 'sg' }, auch: false },
  ]);
  const t = tabelle(substantiv('flōs', 'flōris', 'm', { hinweis: 'Abl. Sg. flōrī; Nom. Pl. auch flī' }));
  assert.equal(t['Abl. Sg.'], 'flōrī');
  assert.equal(t['Nom. Pl.'], 'flōrēs/flī');
  // Ohne Genitiv nur die Formen aus dem Hinweis.
  assert.deepEqual(tabelle(substantiv('grax', undefined, 'f', { hinweis: 'Akk. gracem' })), { 'Akk. Sg.': 'gracem' });
});

test('ohne verwertbaren Genitiv oder bei anderen Wortarten: keine Formen', () => {
  assert.deepEqual(bildeFormen(substantiv('flōs', undefined, 'm')), []);
  assert.deepEqual(bildeFormen(substantiv('flōs', 'flōrō', 'm')), []);
  assert.deepEqual(bildeFormen({ id: 'X', wortart: 'sonstiges', lemma: 'et', formen: {} }), []);
});

test('klammerVarianten: optionale Buchstaben und Anmerkungen', () => {
  assert.deepEqual(klammerVarianten('vulp(i)um'), ['vulpium', 'vulpum']);
  assert.deepEqual(klammerVarianten('videō (m. Akk.)'), ['videō  ']);
});

test('sucheVokabeln: findet Substantive über gebeugte Formen, mit Bestimmung', () => {
  const vokabeln = {
    A: { ...substantiv('asinus', 'asinī', 'm'), id: 'A' },
    B: { ...substantiv('schola', 'scholae', 'f'), id: 'B' },
  };
  const treffer = sucheVokabeln(vokabeln, 'asinos');
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].vokabel.id, 'A');
  assert.deepEqual(treffer[0].felder, []);
  assert.deepEqual(treffer[0].bestimmungen, [{ kasus: 'akk', numerus: 'pl' }]);

  // Mehrdeutig: alle Lesarten.
  assert.deepEqual(sucheVokabeln(vokabeln, 'scholae')[0].bestimmungen.map(bestimmungText),
    ['Gen. Sg.', 'Dat. Sg.', 'Nom. Pl.']);
  // Gespeicherter Genitiv: Feld und Bestimmung.
  const gen = sucheVokabeln(vokabeln, 'asini')[0];
  assert.deepEqual(gen.felder, ['genitiv_sg']);
  assert.deepEqual(gen.bestimmungen.map(bestimmungText), ['Gen. Sg.', 'Nom. Pl.']);
});

test('Pluralwort der 3. Dekl. mit Genitiv auf -orum (Neutrum)', () => {
  const t = tabelle(substantiv('tempora', 'temporum', 'n'));
  assert.equal(t['Dat. Pl.'], 'temporibus');
  assert.equal(t['Akk. Pl.'], 'tempora');
});

// --- Adjektive ---

function adjektiv(lemma, formen = {}, hinweis) {
  return { id: 'X', wortart: 'adjektiv', lemma, formen, bedeutungen: [], hinweis };
}

test('Adjektiv a-/o-Dekl.: alle drei Genera, Vokativ m', () => {
  const t = tabelle(adjektiv('stultus', { f: 'stulta', n: 'stultum' }));
  assert.equal(t['Gen. Sg. m'], 'stultī');
  assert.equal(t['Vok. Sg. m'], 'stulte');
  assert.equal(t['Akk. Sg. f'], 'stultam');
  assert.equal(t['Abl. Sg. f'], 'stultā');
  assert.equal(t['Akk. Sg. n'], 'stultum');
  assert.equal(t['Nom. Pl. n'], 'stulta');
  assert.equal(t['Gen. Pl. f'], 'stultārum');
  assert.equal(t['Dat. Pl. m'], 'stultīs');
  // -er mit und ohne e im Stamm, beide Schreibweisen.
  const niger = tabelle(adjektiv('niger', { f: 'nig(e)ra', n: 'nig(e)rum' }));
  assert.equal(niger['Gen. Sg. m'], 'nigerī/nigrī');
  assert.equal(niger['Vok. Sg. m'], undefined);
});

test('Adjektiv a-/o-Dekl. ohne f/n-Angabe und pronominal', () => {
  assert.equal(tabelle(adjektiv('glaucus (m. Abl.)'))['Akk. Sg. f'], 'glaucam');
  const neuter = tabelle(adjektiv('neuter', { f: 'neutra', n: 'neutrum' }));
  assert.equal(neuter['Gen. Sg. f'], 'neutrīus');
  assert.equal(neuter['Dat. Sg. m'], 'neutrī');
  assert.equal(neuter['Akk. Sg. f'], 'neutram');
  // Genitiv-Angabe auf -īus macht ein Adjektiv ohne f/n pronominal.
  assert.equal(tabelle(adjektiv('glaucus', { genitiv: 'glaucīus' }))['Dat. Sg. f'], 'glaucī');
});

test('Adjektiv 3. Dekl.: drei-, zwei-, einendig, Komparativ', () => {
  const alacer = tabelle(adjektiv('alacer', { f: 'alacris', n: 'alacre' }));
  assert.equal(alacer['Nom. Sg. f'], 'alacris');
  assert.equal(alacer['Abl. Sg. m'], 'alacrī');
  assert.equal(alacer['Nom. Pl. n'], 'alacria');
  assert.equal(alacer['Gen. Pl. f'], 'alacrium');

  const tristis = tabelle(adjektiv('tristis', { n: 'triste' }));
  assert.equal(tristis['Nom. Sg. f'], 'tristis');
  assert.equal(tristis['Akk. Sg. m'], 'tristem');
  assert.equal(tristis['Akk. Sg. n'], 'triste');

  const audax = tabelle(adjektiv('audāx', { genitiv: 'audācis' }));
  assert.equal(audax['Nom. Sg. n'], 'audāx');
  assert.equal(audax['Akk. Sg. m'], 'audācem');
  assert.equal(audax['Nom. Pl. n'], 'audācia');

  const durior = tabelle(adjektiv('dūrior', { n: 'dūrius' }));
  assert.equal(durior['Gen. Sg. m'], 'dūriōris');
  assert.equal(durior['Abl. Sg. f'], 'dūriōre');
  assert.equal(durior['Nom. Pl. n'], 'dūriōra');
  assert.equal(durior['Gen. Pl. m'], 'dūriōrum');
  // "m, f, n" im Lemma.
  assert.equal(tabelle(adjektiv('dūrior, dūrior, dūrius'))['Akk. Sg. n'], 'dūrius');
});

test('Adjektiv: Pluralwörter, -que, Hinweis-Formen mit Genus', () => {
  const glauci = tabelle(adjektiv('glaucī', { f: 'glaucae', n: 'glauca/glaucum' }));
  assert.equal(glauci['Akk. Pl. f'], 'glaucās');
  assert.equal(glauci['Nom. Sg. m'], undefined);
  assert.equal(glauci['Abl. Sg. n'], 'glaucō');

  const que = tabelle(adjektiv('glaucīque', { f: 'glaucaeque', n: 'glaucaque' }));
  assert.equal(que['Gen. Pl. m'], 'glaucōrumque');

  const t = tabelle(adjektiv('audāx', { genitiv: 'audācis' }, 'Abl. Sg. audāce, Nom./Akk. Pl. n audāca, Gen. Pl. audācum'));
  assert.equal(t['Abl. Sg. m'], 'audāce');
  assert.equal(t['Nom. Pl. n'], 'audāca');
  assert.equal(t['Nom. Pl. m'], 'audācēs');
  assert.equal(t['Gen. Pl. f'], 'audācum');
});

test('bestimmungenText: Genera zusammengefasst', () => {
  const treffer = sucheVokabeln({ A: { ...adjektiv('tristis', { n: 'triste' }), id: 'A' } }, 'tristibus');
  assert.equal(bestimmungenText(treffer[0].bestimmungen), 'Dat. Pl. m/f/n, Abl. Pl. m/f/n');
  assert.equal(bestimmungenText([{ kasus: 'gen', numerus: 'sg' }, { kasus: 'nom', numerus: 'pl' }]), 'Gen. Sg., Nom. Pl.');
});
