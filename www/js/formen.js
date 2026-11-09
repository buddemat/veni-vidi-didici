// Bildet die gebeugten Formen einer Vokabel aus ihren gespeicherten Angaben
// (PLAN.md Punkt 37) - rein, ohne Store/DOM. Die Formen werden nicht
// gespeichert, sondern bei Bedarf erzeugt: so passen sie immer zu den
// aktuellen Angaben (z.B. nach einer Korrektur im Editor).
//
// Reicht die Angabe nicht für eine eindeutige Zuordnung, gibt es lieber gar
// keine Formen als falsche.
//
// Stufe 1-3: Substantive, Adjektive, Verben (ohne unregelmäßige Präsensformen).

// Klammern: an ein Wort angehängte Buchstaben sind optional ("caerul(e)a" ->
// "caerulea" und "caerula"); alles andere ist eine Anmerkung und fällt weg
// ("videō (m. Akk.)", "(...) utinam").
const OPTIONALE_BUCHSTABEN = /(\p{L})\((\p{L}+)\)|\((\p{L}+)\)(?=\p{L})/u;

export function klammerVarianten(text) {
  const m = text.match(OPTIONALE_BUCHSTABEN);
  if (!m) return [text.replace(/\([^)]*\)/g, ' ')];
  const vorher = m[1] ?? '';
  const inhalt = m[2] ?? m[3];
  const davor = text.slice(0, m.index);
  const danach = text.slice(m.index + m[0].length);
  return [
    ...klammerVarianten(`${davor}${vorher}${inhalt}${danach}`),
    ...klammerVarianten(`${davor}${vorher}${danach}`),
  ];
}

// Varianten einer Angabe ohne Anmerkungen, Satzzeichen und überflüssige
// Leerzeichen, in NFC (Makrons als ein Zeichen, damit Endungen per Länge
// abgeschnitten werden können).
function varianten(text) {
  return [...new Set(klammerVarianten(String(text).normalize('NFC'))
    .map(t => t.replace(/[!?]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean))];
}

// Endungsvergleich ohne Makrons und Groß/klein.
function ohneMakrons(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();
}

function endetAuf(wort, endung) {
  return ohneMakrons(wort).endsWith(endung);
}

function ohneEndung(wort, endung) {
  return wort.slice(0, wort.length - endung.length);
}

// --- Bestimmung ---

export const KASUS = ['nom', 'gen', 'dat', 'akk', 'abl', 'vok'];
const KASUS_TEXT = { nom: 'Nom.', gen: 'Gen.', dat: 'Dat.', akk: 'Akk.', abl: 'Abl.', vok: 'Vok.' };
const NUMERUS_TEXT = { sg: 'Sg.', pl: 'Pl.' };

const TEMPUS_TEXT = { praes: 'Präs.', impf: 'Impf.', fut1: 'Fut. I', perf: 'Perf.', plqpf: 'Plqpf.', fut2: 'Fut. II' };
const GENUS_VERBI_TEXT = { akt: 'Akt.', pass: 'Pass.' };

// Verbformen: "3. Sg. Impf. Ind. Akt.", "Inf. Perf. Pass.", "Imp. Pl.";
// bei Deponentien ohne Genus verbi.
function verbBestimmungText(b) {
  const genusVerbi = b.genusVerbi ? ` ${GENUS_VERBI_TEXT[b.genusVerbi]}` : '';
  if (b.modus === 'imp') return `Imp. ${NUMERUS_TEXT[b.numerus]}`;
  if (b.modus === 'inf') return `Inf. ${TEMPUS_TEXT[b.tempus]}${genusVerbi}`;
  return `${b.person}. ${NUMERUS_TEXT[b.numerus]} ${TEMPUS_TEXT[b.tempus]} Ind.${genusVerbi}`;
}

export function bestimmungText(bestimmung) {
  if (!bestimmung.kasus) return verbBestimmungText(bestimmung);
  const text = `${KASUS_TEXT[bestimmung.kasus]} ${NUMERUS_TEXT[bestimmung.numerus]}`;
  return bestimmung.genus ? `${text} ${bestimmung.genus}` : text;
}

// Mehrere Bestimmungen kompakt: gleiche Kasus/Numerus mit zusammengefassten
// Genera, z.B. "Gen. Sg. m/f/n, Nom. Pl. m/f".
export function bestimmungenText(bestimmungen) {
  const gruppen = new Map();
  for (const b of bestimmungen) {
    const k = b.kasus ? `${KASUS_TEXT[b.kasus]} ${NUMERUS_TEXT[b.numerus]}` : verbBestimmungText(b);
    if (!gruppen.has(k)) gruppen.set(k, []);
    if (b.genus && !gruppen.get(k).includes(b.genus)) gruppen.get(k).push(b.genus);
  }
  return [...gruppen].map(([k, genera]) => (genera.length > 0 ? `${k} ${genera.join('/')}` : k)).join(', ');
}

// --- Substantive ---

// Paradigma als { 'nom.sg': [formen], ... }; mehrere Formen je Zelle sind
// erlaubt (z.B. Gen. Pl. -um und -ium).
function zelle(paradigma, kasus, numerus, ...formen) {
  const schluessel = `${kasus}.${numerus}`;
  paradigma[schluessel] = [...new Set([...(paradigma[schluessel] || []), ...formen])];
}

function singularUndPlural(paradigma, numerus, endungen, stamm) {
  KASUS.forEach((kasus, i) => {
    if (endungen[i] !== null && endungen[i] !== undefined) zelle(paradigma, kasus, numerus, stamm + endungen[i]);
  });
}

// Plural nach Deklination (Nom., Gen., Dat., Akk., Abl.); `stamm` ohne
// Endung. Der Vokativ Plural ist immer gleich dem Nominativ und wird daher
// nicht eigens aufgeführt.
const PLURAL = {
  1: ['ae', 'ārum', 'īs', 'ās', 'īs'],
  2: ['ī', 'ōrum', 'īs', 'ōs', 'īs'],
  '2n': ['a', 'ōrum', 'īs', 'a', 'īs'],
  3: ['ēs', 'um', 'ibus', 'ēs', 'ibus'],
  '3n': ['a', 'um', 'ibus', 'a', 'ibus'],
  4: ['ūs', 'uum', 'ibus', 'ūs', 'ibus'],
  '4n': ['ua', 'uum', 'ibus', 'ua', 'ibus'],
  5: ['ēs', 'ērum', 'ēbus', 'ēs', 'ēbus'],
};

// Deklination aus der Genitiv-Endung; Pluralwörter haben einen
// Genitiv Plural als Genitiv-Angabe. Bei -ōrum entscheidet der Nominativ
// zwischen 2. Dekl. (Stamm + -ī/-a) und 3. Dekl. auf -um mit Stamm auf -or
// (z.B. "forēs, forum").
function deklination(genitiv, nominativ) {
  if (endetAuf(genitiv, 'arum')) return { dekl: 1, nurPlural: true, endung: 'ārum' };
  if (endetAuf(genitiv, 'orum')) {
    const stamm = ohneMakrons(ohneEndung(genitiv, 'ōrum'));
    const nom = ohneMakrons(nominativ);
    if (nom === `${stamm}i` || nom === `${stamm}a`) return { dekl: 2, nurPlural: true, endung: 'ōrum' };
  }
  if (endetAuf(genitiv, 'ium')) return { dekl: 3, nurPlural: true, endung: 'ium' };
  if (endetAuf(genitiv, 'um')) return { dekl: 3, nurPlural: true, endung: 'um' };
  if (endetAuf(genitiv, 'ae')) return { dekl: 1, endung: 'ae' };
  if (endetAuf(genitiv, 'ei')) return { dekl: 5, endung: genitiv.slice(-2) };
  if (endetAuf(genitiv, 'us')) return { dekl: 4, endung: 'ūs' };
  if (endetAuf(genitiv, 'is')) return { dekl: 3, endung: 'is' };
  if (endetAuf(genitiv, 'i')) return { dekl: 2, endung: 'ī' };
  return null;
}

// Neutra der 3. Dekl. auf -e, -al, -ar sind i-Stämme (Abl. -ī, Pl. -ia, -ium).
function istNeutrumIStamm(nominativ) {
  return /(e|al|ar)$/.test(ohneMakrons(nominativ));
}

// Gleichsilbige auf -is/-ēs (Nom. und Gen. gleich lang) haben meist -ium,
// einige aber -um - ohne Angabe im Wortschatz werden beide erzeugt.
function istGleichsilbig(nominativ, genitiv) {
  return /(is|es)$/.test(ohneMakrons(nominativ)) && nominativ.length === genitiv.length;
}

// Ein Wort: Nominativ + Genitiv (+ ggf. Gen. Pl.) -> Paradigma oder null.
function deklinierePaar(nominativ, genitiv, neutrum, genitivPlural) {
  const d = deklination(genitiv, nominativ);
  if (!d) return null;
  const stamm = ohneEndung(genitiv, d.endung);
  if (!stamm) return null;
  const p = {};

  if (d.nurPlural) {
    zelle(p, 'nom', 'pl', nominativ);
    zelle(p, 'gen', 'pl', genitiv);
    if (d.dekl === 3) {
      zelle(p, 'dat', 'pl', `${stamm}ibus`);
      zelle(p, 'akk', 'pl', nominativ);
      zelle(p, 'abl', 'pl', `${stamm}ibus`);
    } else {
      const endungen = PLURAL[d.dekl === 2 && neutrum ? '2n' : d.dekl];
      zelle(p, 'dat', 'pl', stamm + endungen[2]);
      zelle(p, 'akk', 'pl', stamm + endungen[3]);
      zelle(p, 'abl', 'pl', stamm + endungen[4]);
    }
    return p;
  }

  zelle(p, 'nom', 'sg', nominativ);
  zelle(p, 'gen', 'sg', genitiv);
  switch (d.dekl) {
    case 1:
      singularUndPlural(p, 'sg', [null, null, 'ae', 'am', 'ā'], stamm);
      singularUndPlural(p, 'pl', PLURAL[1], stamm);
      break;
    case 2:
      if (neutrum) {
        singularUndPlural(p, 'sg', [null, null, 'ō', null, 'ō'], stamm);
        zelle(p, 'akk', 'sg', nominativ);
        singularUndPlural(p, 'pl', PLURAL['2n'], stamm);
      } else {
        singularUndPlural(p, 'sg', [null, null, 'ō', 'um', 'ō'], stamm);
        singularUndPlural(p, 'pl', PLURAL[2], stamm);
        // Vokativ nur, wo er sich vom Nominativ unterscheidet.
        if (endetAuf(nominativ, 'ius')) zelle(p, 'vok', 'sg', `${stamm.slice(0, -1)}ī`);
        else if (endetAuf(nominativ, 'us')) zelle(p, 'vok', 'sg', `${stamm}e`);
      }
      break;
    case 3: {
      const iStammNeutrum = neutrum && istNeutrumIStamm(nominativ);
      zelle(p, 'dat', 'sg', `${stamm}ī`);
      zelle(p, 'akk', 'sg', neutrum ? nominativ : `${stamm}em`);
      zelle(p, 'abl', 'sg', iStammNeutrum ? `${stamm}ī` : `${stamm}e`);
      const plural = [...PLURAL[neutrum ? '3n' : 3]];
      if (iStammNeutrum) {
        plural[0] = 'ia';
        plural[3] = 'ia';
      }
      singularUndPlural(p, 'pl', plural.map((e, i) => (i === 1 ? null : e)), stamm);
      if (genitivPlural) zelle(p, 'gen', 'pl', ...genitivPlural);
      else if (iStammNeutrum) zelle(p, 'gen', 'pl', `${stamm}ium`);
      else if (istGleichsilbig(nominativ, genitiv)) zelle(p, 'gen', 'pl', `${stamm}ium`, `${stamm}um`);
      else zelle(p, 'gen', 'pl', `${stamm}um`);
      break;
    }
    case 4:
      if (neutrum) {
        singularUndPlural(p, 'sg', [null, null, 'ū', 'ū', 'ū'], stamm);
        singularUndPlural(p, 'pl', PLURAL['4n'], stamm);
      } else {
        singularUndPlural(p, 'sg', [null, null, 'uī', 'um', 'ū'], stamm);
        singularUndPlural(p, 'pl', PLURAL[4], stamm);
      }
      break;
    case 5:
      zelle(p, 'dat', 'sg', genitiv);
      singularUndPlural(p, 'sg', [null, null, null, 'em', 'ē'], stamm);
      singularUndPlural(p, 'pl', PLURAL[5], stamm);
      break;
    default:
      return null;
  }
  return p;
}

// Mehrteilige Lemmata ("rosa alba", Gen. "rosae albae"): jedes Wort
// einzeln deklinieren, dann zellenweise zusammensetzen (nur Zellen, die alle
// Wörter haben).
function deklinierePhrase(nominativ, genitiv, neutrum, genitivPlural) {
  const nomWoerter = nominativ.split(' ');
  const genWoerter = genitiv.split(' ');
  if (nomWoerter.length === 1) return deklinierePaar(nominativ, genitiv, neutrum, genitivPlural);
  if (genWoerter.length !== nomWoerter.length || genitivPlural) return null;
  const teile = nomWoerter.map((n, i) => deklinierePaar(n, genWoerter[i], neutrum, null));
  if (teile.some(t => !t)) return null;
  const p = {};
  for (const schluessel of Object.keys(teile[0])) {
    if (!teile.every(t => t[schluessel])) continue;
    let kombis = [''];
    for (const t of teile) kombis = kombis.flatMap(k => t[schluessel].map(f => (k ? `${k} ${f}` : f)));
    p[schluessel] = kombis;
  }
  return p;
}

// Formen aus dem Lern-Hinweis, z.B. "Abl. Sg. marī, Nom./Akk. Pl. maria",
// "Nom./Akk. Pl. n vetera" (nur Neutrum), "Nom. Pl. auch dī", "Akk. vim"
// (ohne Numerus: Singular). Sie ersetzen die erzeugte Form dieser Zelle
// (das Buch nennt die abweichende Form), mit "auch" ergänzen sie sie.
const KASUS_KUERZEL = { Nom: 'nom', Gen: 'gen', Dat: 'dat', Akk: 'akk', Abl: 'abl', Vok: 'vok' };
const HINWEIS_FORM = new RegExp(
  '^((?:Nom|Gen|Dat|Akk|Abl|Vok)\\.(?:\\/(?:Nom|Gen|Dat|Akk|Abl|Vok)\\.)*)\\s*(?:(Sg|Pl)\\.)?'
  + '\\s*(?:([mfn])\\s+)?(auch\\s+)?(\\p{L}+)$', 'u',
);

export function hinweisFormen(hinweis) {
  if (!hinweis) return [];
  const formen = [];
  for (const teil of String(hinweis).normalize('NFC').split(/[;,]/)) {
    const m = teil.trim().match(HINWEIS_FORM);
    if (!m) continue;
    const numerus = m[2] === 'Pl' ? 'pl' : 'sg';
    for (const k of m[1].split('/')) {
      const bestimmung = { kasus: KASUS_KUERZEL[k.replace('.', '')], numerus };
      if (m[3]) bestimmung.genus = m[3];
      formen.push({ form: m[5], bestimmung, auch: !!m[4] });
    }
  }
  return formen;
}

// Hinweis-Formen einarbeiten: ersetzen die erzeugten Formen derselben
// Zelle (ohne Genus-Angabe im Hinweis: in allen Genera), mit "auch" nur
// ergänzend.
function mitHinweisFormen(formen, hinweis) {
  const hinweise = hinweisFormen(hinweis);
  const ersetzt = h => f => f.bestimmung.kasus === h.bestimmung.kasus && f.bestimmung.numerus === h.bestimmung.numerus
    && (!h.bestimmung.genus || f.bestimmung.genus === h.bestimmung.genus);
  let ergebnis = formen;
  for (const h of hinweise.filter(x => !x.auch)) ergebnis = ergebnis.filter(f => !ersetzt(h)(f));
  // Hat das Wort Genera (Adjektiv), gilt eine Hinweis-Form ohne Genus für alle.
  const genera = [...new Set(formen.map(f => f.bestimmung.genus).filter(Boolean))];
  for (const { form, bestimmung } of hinweise) {
    if (bestimmung.genus || genera.length === 0) ergebnis.push({ form, bestimmung });
    else for (const genus of genera) ergebnis.push({ form, bestimmung: { ...bestimmung, genus } });
  }
  return ergebnis;
}

function paradigmaAlsListe(p, genus) {
  const liste = [];
  for (const numerus of ['sg', 'pl']) {
    for (const kasus of KASUS) {
      for (const form of p[`${kasus}.${numerus}`] || []) {
        liste.push({ form, bestimmung: genus ? { kasus, numerus, genus } : { kasus, numerus } });
      }
    }
  }
  return liste;
}

// Lemma "servus/serva" mit Genitiv "servī/servae" (und Genus "m/f"):
// paarweise. Ein gemeinsamer Genitiv für mehrere Nominative ("x/y", "z")
// gilt für alle.
function substantivFormen(vokabel) {
  const f = vokabel.formen || {};
  if (!f.genitiv_sg) return [];
  const nominative = String(vokabel.lemma).split('/');
  const genitive = String(f.genitiv_sg).split('/');
  const genera = String(f.genus || '').split('/');
  if (genitive.length !== nominative.length && genitive.length !== 1) return [];
  const genitivPlural = f.genitiv_pl ? String(f.genitiv_pl).split('/').flatMap(varianten) : null;

  const formen = [];
  nominative.forEach((nomText, i) => {
    const genText = genitive.length === 1 ? genitive[0] : genitive[i];
    const genus = genera.length === nominative.length ? genera[i] : genera[0];
    for (const nom of varianten(nomText)) {
      for (const gen of varianten(genText)) {
        const p = deklinierePhrase(nom, gen, genus === 'n', genitivPlural);
        if (p) formen.push(...paradigmaAlsListe(p));
      }
    }
  });
  return formen;
}

// --- Adjektive ---

// Adjektiv der a-/o-Deklination: Maskulinum und Neutrum wie Substantive der
// 2. Dekl., Femininum wie die 1. Dekl.; `neutrum` ist die Nom.-Sg.-Form
// (meist -um, bei "alius" z.B. "aliud").
function aoAdjektiv(m, stamm, neutrum, pronominal) {
  const formen = [
    ...paradigmaAlsListe(deklinierePaar(m, `${stamm}ī`, false), 'm'),
    ...paradigmaAlsListe(deklinierePaar(`${stamm}a`, `${stamm}ae`, false), 'f'),
    ...paradigmaAlsListe(deklinierePaar(`${stamm}um`, `${stamm}ī`, true), 'n'),
  ];
  let ergebnis = formen;
  if (neutrum && !endetAuf(neutrum, 'um')) {
    ergebnis = ergebnis.filter(f => !(f.bestimmung.genus === 'n' && f.bestimmung.numerus === 'sg'
      && ['nom', 'akk'].includes(f.bestimmung.kasus)));
    ergebnis.push({ form: neutrum, bestimmung: { kasus: 'nom', numerus: 'sg', genus: 'n' } });
    ergebnis.push({ form: neutrum, bestimmung: { kasus: 'akk', numerus: 'sg', genus: 'n' } });
  }
  // Pronominale Adjektive (Gen. -īus, Dat. -ī in allen Genera).
  if (pronominal) {
    ergebnis = ergebnis.filter(f => !(f.bestimmung.numerus === 'sg' && ['gen', 'dat'].includes(f.bestimmung.kasus)));
    for (const genus of ['m', 'f', 'n']) {
      ergebnis.push({ form: `${stamm}īus`, bestimmung: { kasus: 'gen', numerus: 'sg', genus } });
      ergebnis.push({ form: `${stamm}ī`, bestimmung: { kasus: 'dat', numerus: 'sg', genus } });
    }
  }
  return ergebnis;
}

// Adjektiv der 3. Deklination. `nominative` je Genus, `stamm` aus Genitiv
// oder Neutrum. i-Stamm (Normalfall): Abl. -ī, Gen. Pl. -ium, Neutrum Pl.
// -ia; konsonantisch (Komparativ): Abl. -e, Gen. Pl. -um, Neutrum Pl. -a.
function adjektiv3(nominative, stamm, iStamm) {
  const formen = [];
  for (const genus of ['m', 'f', 'n']) {
    const p = {};
    const neutrum = genus === 'n';
    zelle(p, 'nom', 'sg', nominative[genus]);
    zelle(p, 'gen', 'sg', `${stamm}is`);
    zelle(p, 'dat', 'sg', `${stamm}ī`);
    zelle(p, 'akk', 'sg', neutrum ? nominative.n : `${stamm}em`);
    zelle(p, 'abl', 'sg', iStamm ? `${stamm}ī` : `${stamm}e`);
    const nomPl = neutrum ? `${stamm}${iStamm ? 'ia' : 'a'}` : `${stamm}ēs`;
    zelle(p, 'nom', 'pl', nomPl);
    zelle(p, 'gen', 'pl', `${stamm}${iStamm ? 'ium' : 'um'}`);
    zelle(p, 'dat', 'pl', `${stamm}ibus`);
    zelle(p, 'akk', 'pl', nomPl);
    zelle(p, 'abl', 'pl', `${stamm}ibus`);
    formen.push(...paradigmaAlsListe(p, genus));
  }
  return formen;
}

function nurPlural(formen) {
  return formen.filter(f => f.bestimmung.numerus === 'pl');
}

// Pronominale Adjektive (Gen. Sg. -īus, Dat. Sg. -ī in allen Genera) -
// auch ohne Genitiv-Angabe im Wortschatz. "alius" hat Gen. "alterīus".
const PRONOMINALE_ADJEKTIVE = ['unus', 'solus', 'totus', 'ullus', 'nullus', 'alius', 'alter', 'uter', 'neuter'];
const PRONOMINAL_GENITIV = { alius: 'alterīus' };

// Ermittelt aus Lemma (m), f-, n- und Genitiv-Angabe die Bildungsweise.
// Gibt [] zurück, wenn keine passt.
function adjektivFormenAus(m, f, n, genitiv) {
  // Pluralwörter der a-/o-Dekl. ("-ī, -ae, -a"); ein Neutrum auf -um
  // daneben ("-a/-um") ist zusätzlich Singular.
  if (endetAuf(m, 'i') && f && endetAuf(f, 'ae')) {
    const stamm = ohneEndung(f, 'ae');
    const formen = nurPlural(aoAdjektiv(`${stamm}us`, stamm, null, false));
    const neutrumSg = (n || []).find(x => endetAuf(x, 'um'));
    if (neutrumSg) {
      formen.push(...paradigmaAlsListe(deklinierePaar(neutrumSg, `${stamm}ī`, true), 'n')
        .filter(x => x.bestimmung.numerus === 'sg'));
    }
    return formen;
  }
  const neutrum = n?.[0];
  // a-/o-Deklination mit Femininum-Angabe.
  if (f && endetAuf(f, 'a')) {
    const pronominal = PRONOMINALE_ADJEKTIVE.includes(ohneMakrons(m));
    const formen = aoAdjektiv(m, ohneEndung(f, 'a'), neutrum, pronominal);
    const genitivSonder = PRONOMINAL_GENITIV[ohneMakrons(m)];
    if (!genitivSonder) return formen;
    return [
      ...formen.filter(x => !(x.bestimmung.kasus === 'gen' && x.bestimmung.numerus === 'sg')),
      ...['m', 'f', 'n'].map(genus => ({ form: genitivSonder, bestimmung: { kasus: 'gen', numerus: 'sg', genus } })),
    ];
  }
  // Pronominal ("-us", Gen. "-īus") oder ganz ohne f/n-Angabe ("-us").
  if (!f && !neutrum && endetAuf(m, 'us')) {
    if (genitiv && endetAuf(genitiv, 'ius')) return aoAdjektiv(m, ohneEndung(genitiv, 'īus'), null, true);
    if (!genitiv) return aoAdjektiv(m, ohneEndung(m, 'us'), null, false);
  }
  // Dreiendig ("ācer, ācris, ācre") und zweiendig ("-is, -e").
  if (neutrum && endetAuf(neutrum, 'e') && (endetAuf(m, 'is') || (f && endetAuf(f, 'is')))) {
    const stamm = ohneEndung(neutrum, 'e');
    return adjektiv3({ m, f: f || m, n: neutrum }, stamm, true);
  }
  // Komparativ ("-ior, -ius").
  if (neutrum && endetAuf(m, 'ior') && endetAuf(neutrum, 'ius')) {
    return adjektiv3({ m, f: m, n: neutrum }, `${ohneEndung(m, 'or')}ōr`, false);
  }
  // Einendig mit Genitiv ("-ns, -ntis").
  if (genitiv && endetAuf(genitiv, 'is')) {
    return adjektiv3({ m, f: m, n: m }, ohneEndung(genitiv, 'is'), true);
  }
  // Pluralwörter der 3. Dekl. ("-ēs", Gen. "-ium"): ohne den unsicheren
  // Neutrum-Nominativ/Akkusativ.
  if (genitiv && endetAuf(m, 'es') && endetAuf(genitiv, 'ium')) {
    const stamm = ohneEndung(genitiv, 'ium');
    return nurPlural(adjektiv3({ m, f: m, n: m }, stamm, true))
      .filter(x => !(x.bestimmung.genus === 'n' && ['nom', 'akk'].includes(x.bestimmung.kasus)));
  }
  return [];
}

// Angehängtes "-que" (an allen Formen): abtrennen, deklinieren, anhängen.
function adjektivFormen(vokabel) {
  const fo = vokabel.formen || {};
  const teile = varianten(vokabel.lemma);
  if (teile.length !== 1) return [];
  // "m, f, n" direkt im Lemma.
  let [m, fText, nText] = teile[0].split(/\s*,\s*/);
  fText = fText ?? fo.f;
  nText = nText ?? fo.n;
  // Mehrere Schreibweisen ("dext(e)ra") je für sich.
  const fVarianten = fText ? varianten(fText) : [null];
  const n = nText ? String(nText).split('/').flatMap(varianten) : null;
  const genitiv = fo.genitiv ? varianten(fo.genitiv)[0] : null;
  if (!m || m.includes(' ')) return [];

  const que = endetAuf(m, 'que') && fVarianten.every(f => !f || endetAuf(f, 'que'));
  const ohneQue = t => (t && que ? ohneEndung(t, 'que') : t);
  const formen = fVarianten.flatMap(f => adjektivFormenAus(ohneQue(m), ohneQue(f), n?.map(ohneQue), ohneQue(genitiv)));
  return que ? formen.map(x => ({ ...x, form: `${x.form}que` })) : formen;
}

// --- Verben ---

const PERSONEN = [[1, 'sg'], [2, 'sg'], [3, 'sg'], [1, 'pl'], [2, 'pl'], [3, 'pl']];

// Endungen je Konjugation, an die Wurzel (1. Sg. ohne -ō/-eō/-iō bzw.
// -or/-eor/-ior) angehängt. impf: Bindevokal + b, dann die Endungen
// IMPF_AKT/IMPF_PASS.
const KONJUGATION = {
  1: {
    praes: ['ō', 'ās', 'at', 'āmus', 'ātis', 'ant'], praesPass: ['or', 'āris', 'ātur', 'āmur', 'āminī', 'antur'],
    impf: 'āb', fut: ['ābō', 'ābis', 'ābit', 'ābimus', 'ābitis', 'ābunt'],
    futPass: ['ābor', 'āberis', 'ābitur', 'ābimur', 'ābiminī', 'ābuntur'], infPass: 'ārī', imp: ['ā', 'āte'], impDep: 'āre',
  },
  2: {
    praes: ['eō', 'ēs', 'et', 'ēmus', 'ētis', 'ent'], praesPass: ['eor', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur'],
    impf: 'ēb', fut: ['ēbō', 'ēbis', 'ēbit', 'ēbimus', 'ēbitis', 'ēbunt'],
    futPass: ['ēbor', 'ēberis', 'ēbitur', 'ēbimur', 'ēbiminī', 'ēbuntur'], infPass: 'ērī', imp: ['ē', 'ēte'], impDep: 'ēre',
  },
  3: {
    praes: ['ō', 'is', 'it', 'imus', 'itis', 'unt'], praesPass: ['or', 'eris', 'itur', 'imur', 'iminī', 'untur'],
    impf: 'ēb', fut: ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'],
    futPass: ['ar', 'ēris', 'ētur', 'ēmur', 'ēminī', 'entur'], infPass: 'ī', imp: ['e', 'ite'], impDep: 'ere',
  },
  '3io': {
    praes: ['iō', 'is', 'it', 'imus', 'itis', 'iunt'], praesPass: ['ior', 'eris', 'itur', 'imur', 'iminī', 'iuntur'],
    impf: 'iēb', fut: ['iam', 'iēs', 'iet', 'iēmus', 'iētis', 'ient'],
    futPass: ['iar', 'iēris', 'iētur', 'iēmur', 'iēminī', 'ientur'], infPass: 'ī', imp: ['e', 'ite'], impDep: 'ere',
  },
  4: {
    praes: ['iō', 'īs', 'it', 'īmus', 'ītis', 'iunt'], praesPass: ['ior', 'īris', 'ītur', 'īmur', 'īminī', 'iuntur'],
    impf: 'iēb', fut: ['iam', 'iēs', 'iet', 'iēmus', 'iētis', 'ient'],
    futPass: ['iar', 'iēris', 'iētur', 'iēmur', 'iēminī', 'ientur'], infPass: 'īrī', imp: ['ī', 'īte'], impDep: 'īre',
  },
};
const IMPF_AKT = ['am', 'ās', 'at', 'āmus', 'ātis', 'ant'];
const IMPF_PASS = ['ar', 'āris', 'ātur', 'āmur', 'āminī', 'antur'];
const PERF_AKT = ['ī', 'istī', 'it', 'imus', 'istis', 'ērunt'];
const PLQPF_AKT = ['eram', 'erās', 'erat', 'erāmus', 'erātis', 'erant'];
const FUT2_AKT = ['erō', 'eris', 'erit', 'erimus', 'eritis', 'erint'];
const ESSE = {
  perf: ['sum', 'es', 'est', 'sumus', 'estis', 'sunt'],
  plqpf: ['eram', 'erās', 'erat', 'erāmus', 'erātis', 'erant'],
  fut2: ['erō', 'eris', 'erit', 'erimus', 'eritis', 'erunt'],
};

// Konjugation aus Infinitiv (Lemma) und 1. Sg. - ohne Makrons verglichen,
// die Endung der 1. Sg. entscheidet zwischen 2. und 3. Konjugation.
// Unregelmäßige (esse, īre, ferre, velle, fierī, ...) passen auf keine
// Regel und bekommen hier keine Präsensformen (Stufe 4).
function konjugation(infinitiv, praesens) {
  const inf = ohneMakrons(infinitiv);
  const p = ohneMakrons(praesens);
  const regeln = [
    // [1. Sg., Infinitiv, Konjugation, Endung der 1. Sg., Deponens]
    ['eor', 'eri', 2, 'eor', true], ['ior', 'iri', 4, 'ior', true], ['ior', 'i', '3io', 'ior', true],
    ['or', 'ari', 1, 'or', true], ['or', 'i', 3, 'or', true],
    ['eo', 'ere', 2, 'eō', false], ['io', 'ire', 4, 'iō', false], ['io', 'ere', '3io', 'iō', false],
    ['o', 'are', 1, 'ō', false], ['o', 'ere', 3, 'ō', false],
  ];
  for (const [pEnd, infEnd, konj, endung, deponens] of regeln) {
    if (p.endsWith(pEnd) && inf.endsWith(infEnd)) {
      const wurzel = ohneEndung(praesens, endung);
      return wurzel ? { konj, wurzel, deponens } : null;
    }
  }
  return null;
}

function verbForm(form, bestimmung) {
  return { form, bestimmung };
}

function personenFormen(stamm, endungen, tempus, genusVerbi) {
  return PERSONEN.map(([person, numerus], i) => verbForm(
    stamm + endungen[i],
    { person, numerus, tempus, modus: 'ind', ...(genusVerbi ? { genusVerbi } : {}) },
  ));
}

function praesensSystem(infinitiv, { konj, wurzel, deponens }, imperativSg) {
  const k = KONJUGATION[konj];
  const formen = [];
  // Deponentien: Passivformen, aber ohne Angabe des Genus verbi.
  const akt = deponens ? null : 'akt';
  const pass = deponens ? null : 'pass';
  if (!deponens) {
    formen.push(...personenFormen(wurzel, k.praes, 'praes', akt));
    formen.push(...personenFormen(wurzel + k.impf, IMPF_AKT, 'impf', akt));
    formen.push(...personenFormen(wurzel, k.fut, 'fut1', akt));
    formen.push(verbForm(infinitiv, { modus: 'inf', tempus: 'praes', genusVerbi: 'akt' }));
    const [impSg, impPl] = k.imp;
    for (const form of imperativSg || [wurzel + impSg]) formen.push(verbForm(form, { modus: 'imp', numerus: 'sg' }));
    formen.push(verbForm(wurzel + impPl, { modus: 'imp', numerus: 'pl' }));
  }
  formen.push(...personenFormen(wurzel, k.praesPass, 'praes', pass));
  formen.push(...personenFormen(wurzel + k.impf, IMPF_PASS, 'impf', pass));
  formen.push(...personenFormen(wurzel, k.futPass, 'fut1', pass));
  formen.push(verbForm(deponens ? infinitiv : wurzel + k.infPass, { modus: 'inf', tempus: 'praes', ...(pass ? { genusVerbi: pass } : {}) }));
  if (deponens) {
    formen.push(verbForm(wurzel + k.impDep, { modus: 'imp', numerus: 'sg' }));
    formen.push(verbForm(wurzel + k.praesPass[4], { modus: 'imp', numerus: 'pl' }));
  }
  return formen;
}

// Perfekt aktiv aus der gespeicherten 1. Sg. Perf. ("vīdī").
function perfektAktiv(perfekt) {
  const stamm = ohneEndung(perfekt, 'ī');
  return [
    ...personenFormen(stamm, PERF_AKT, 'perf', 'akt'),
    ...personenFormen(stamm, PLQPF_AKT, 'plqpf', 'akt'),
    ...personenFormen(stamm, FUT2_AKT, 'fut2', 'akt'),
    verbForm(`${stamm}isse`, { modus: 'inf', tempus: 'perf', genusVerbi: 'akt' }),
  ];
}

// Perfekt passiv (bzw. bei Deponentien das Perfekt): Partizip + esse,
// Partizip in allen Genera ("monitus/monita/monitum est").
function perfektMitPartizip(partizipStamm, genusVerbi) {
  const formen = [];
  const endungen = { sg: ['us', 'a', 'um'], pl: ['ī', 'ae', 'a'] };
  for (const [tempus, esse] of Object.entries(ESSE)) {
    PERSONEN.forEach(([person, numerus], i) => {
      for (const e of endungen[numerus]) {
        formen.push(verbForm(`${partizipStamm}${e} ${esse[i]}`,
          { person, numerus, tempus, modus: 'ind', ...(genusVerbi ? { genusVerbi } : {}) }));
      }
    });
  }
  for (const e of ['um', 'us', 'a', 'ōs', 'ās', 'ī', 'ae']) {
    formen.push(verbForm(`${partizipStamm}${e} esse`, { modus: 'inf', tempus: 'perf', ...(genusVerbi ? { genusVerbi } : {}) }));
  }
  return formen;
}

function verbFormen(vokabel) {
  const fo = vokabel.formen || {};
  const infinitive = varianten(vokabel.lemma);
  if (infinitive.length !== 1 || infinitive[0].includes(' ')) return [];
  const infinitiv = infinitive[0];
  const formen = [];

  let deponens = false;
  for (const praesens of fo.praesens_1sg ? varianten(fo.praesens_1sg) : []) {
    const k = konjugation(infinitiv, praesens);
    if (!k) continue;
    deponens = k.deponens;
    const imperativ = fo.imperativ_sg ? varianten(fo.imperativ_sg) : null;
    formen.push(...praesensSystem(infinitiv, k, imperativ));
  }

  for (const perfekt of fo.perfekt_1sg ? String(fo.perfekt_1sg).split('/').flatMap(varianten) : []) {
    if (perfekt.endsWith(' sum')) {
      // Deponens/Semideponens ("hortātus sum"): Perfekt ohne Genus verbi.
      const partizip = ohneEndung(perfekt, ' sum');
      if (endetAuf(partizip, 'us')) formen.push(...perfektMitPartizip(ohneEndung(partizip, 'us'), null));
    } else if (!perfekt.includes(' ') && endetAuf(perfekt, 'i')) {
      formen.push(...perfektAktiv(perfekt));
    }
  }

  // Perfekt passiv aus dem PPP bzw. Supin ("monitum").
  if (!deponens && fo.ppp) {
    for (const ppp of varianten(fo.ppp)) {
      if (!ppp.includes(' ') && endetAuf(ppp, 'um')) formen.push(...perfektMitPartizip(ohneEndung(ppp, 'um'), 'pass'));
    }
  }
  return formen;
}

// --- Gesamt ---

function ohneDoppelte(formen) {
  const gesehen = new Set();
  return formen.filter(({ form, bestimmung }) => {
    const schluessel = `${form}|${bestimmungText(bestimmung)}`;
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
}

// Alle Formen einer Vokabel als [{ form, bestimmung }] - leer, wenn sich
// (noch) nichts ableiten lässt.
export function bildeFormen(vokabel) {
  let formen;
  if (vokabel.wortart === 'substantiv') formen = substantivFormen(vokabel);
  else if (vokabel.wortart === 'adjektiv') formen = adjektivFormen(vokabel);
  else if (vokabel.wortart === 'verb') return ohneDoppelte(verbFormen(vokabel));
  else return [];
  return ohneDoppelte(mitHinweisFormen(formen, vokabel.hinweis));
}
