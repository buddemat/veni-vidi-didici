// Bildet die gebeugten Formen einer Vokabel aus ihren gespeicherten Angaben
// (PLAN.md Punkt 37) - rein, ohne Store/DOM. Die Formen werden nicht
// gespeichert, sondern bei Bedarf erzeugt: so passen sie immer zu den
// aktuellen Angaben (z.B. nach einer Korrektur im Editor).
//
// Reicht die Angabe nicht für eine eindeutige Zuordnung, gibt es lieber gar
// keine Formen als falsche.
//
// Stufe 1: Substantive.

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

export function bestimmungText(bestimmung) {
  return `${KASUS_TEXT[bestimmung.kasus]} ${NUMERUS_TEXT[bestimmung.numerus]}`;
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
// "Nom. Pl. auch dī", "Akk. vim" (ohne Numerus: Singular). Ergänzt die
// erzeugten Formen (ersetzt sie nicht).
const KASUS_KUERZEL = { Nom: 'nom', Gen: 'gen', Dat: 'dat', Akk: 'akk', Abl: 'abl', Vok: 'vok' };
const HINWEIS_FORM = /^((?:Nom|Gen|Dat|Akk|Abl|Vok)\.(?:\/(?:Nom|Gen|Dat|Akk|Abl|Vok)\.)*)\s*(?:(Sg|Pl)\.)?\s*(?:auch\s+)?(\p{L}+)$/u;

export function hinweisFormen(hinweis) {
  if (!hinweis) return [];
  const formen = [];
  for (const teil of String(hinweis).normalize('NFC').split(/[;,]/)) {
    const m = teil.trim().match(HINWEIS_FORM);
    if (!m) continue;
    const numerus = m[2] === 'Pl' ? 'pl' : 'sg';
    for (const k of m[1].split('/')) {
      formen.push({ form: m[3], bestimmung: { kasus: KASUS_KUERZEL[k.replace('.', '')], numerus } });
    }
  }
  return formen;
}

function paradigmaAlsListe(p) {
  const liste = [];
  for (const numerus of ['sg', 'pl']) {
    for (const kasus of KASUS) {
      for (const form of p[`${kasus}.${numerus}`] || []) liste.push({ form, bestimmung: { kasus, numerus } });
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
  if (formen.length === 0) return [];
  return formen;
}

function ohneDoppelte(formen) {
  const gesehen = new Set();
  return formen.filter(({ form, bestimmung }) => {
    const schluessel = `${form}|${JSON.stringify(bestimmung)}`;
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
}

// Alle Formen einer Vokabel als [{ form, bestimmung }] - leer, wenn sich
// (noch) nichts ableiten lässt.
export function bildeFormen(vokabel) {
  if (vokabel.wortart === 'substantiv') {
    return ohneDoppelte([...substantivFormen(vokabel), ...hinweisFormen(vokabel.hinweis)]);
  }
  return [];
}
