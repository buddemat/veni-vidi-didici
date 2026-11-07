// Reine Suchlogik für "Vokabel nachschlagen" - ohne Store/DOM, damit sie
// sich in Node testen lässt.
//
// Gesucht wird das eingegebene lateinische Wort im Lemma und in allen
// angegebenen Formen (Genitiv, 1. Sg. Präs., Perfekt, PPP, f/n-Formen, ...),
// also z.B. auch "vēnī" -> venīre. Verglichen wird normalisiert (ohne
// Makrons, Groß/klein, u/v, i/j, wie in der Antwortprüfung), aber exakt:
// keine Teilwörter, keine Tippfehlertoleranz.

import { normalisiere, levenshteinDistanz } from './pruefung.js';

// Klammern: an ein Wort angehängte Buchstaben sind optional ("caerul(e)a" ->
// "caerulea" und "caerula"); alles andere ist eine Anmerkung und fällt weg
// ("videō (m. Akk.)", "(...) utinam").
const OPTIONALE_BUCHSTABEN = /(\p{L})\((\p{L}+)\)|\((\p{L}+)\)(?=\p{L})/u;

function klammerVarianten(text) {
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

// Alle normalisierten Suchschlüssel eines Lemma- oder Formtexts. Mehrere
// Angaben ("servus/serva", "is, ea, id") ergeben je einen Schlüssel.
export function suchSchluessel(text) {
  if (!text) return [];
  const schluessel = new Set();
  for (const variante of klammerVarianten(String(text))) {
    for (const teil of variante.split(/[/,]/)) {
      const n = normalisiere(teil);
      if (n) schluessel.add(n);
    }
  }
  return [...schluessel];
}

// Suchschlüssel einer Vokabel je Feld (Lemma + alle Formen außer Genus),
// zwischengespeichert, da bei jeder Eingabe alle Vokabeln durchsucht werden.
const schluesselCache = new WeakMap();

function feldSchluessel(vokabel) {
  let eintraege = schluesselCache.get(vokabel);
  if (!eintraege) {
    eintraege = [['lemma', suchSchluessel(vokabel.lemma)]];
    for (const [feld, wert] of Object.entries(vokabel.formen || {})) {
      if (feld !== 'genus') eintraege.push([feld, suchSchluessel(wert)]);
    }
    schluesselCache.set(vokabel, eintraege);
  }
  return eintraege;
}

// Bewertet den ganzen Schlüssel ("non venire") und, bei mehreren Wörtern,
// jedes einzelne ("venire", "sive" in "sīve ... sīve") - ein Treffer nur in
// einem Wort zählt etwas schlechter als einer im ganzen Schlüssel.
const ABZUG_EINZELWORT = 0.5;

function bewerteSchluessel(schluessel, bewerte) {
  const werte = [bewerte(schluessel)];
  const woerter = schluessel.split(' ');
  if (woerter.length > 1) {
    for (const wort of woerter) {
      const wert = bewerte(wort);
      werte.push(wert === null ? null : wert + ABZUG_EINZELWORT);
    }
  }
  return werte.filter(w => w !== null);
}

// Bewertet jede Vokabel mit `bewerte(schluessel)` (Zahl = Treffer, kleiner
// ist besser; null = kein Treffer) und liefert [{ vokabel, felder, wert }],
// `felder` sind die Felder mit dem besten Wert ('lemma' oder ein
// Form-Schlüssel wie 'perfekt_1sg'). Sortiert nach Wert, dann Treffer im
// Lemma vor Treffern in Formen, dann alphabetisch.
function finde(vokabeln, bewerte, ausgenommen = new Set()) {
  const treffer = [];
  for (const vokabel of Object.values(vokabeln)) {
    if (ausgenommen.has(vokabel.id)) continue;
    let bester = null;
    let felder = [];
    for (const [feld, schluessel] of feldSchluessel(vokabel)) {
      const werte = schluessel.flatMap(k => bewerteSchluessel(k, bewerte));
      if (werte.length === 0) continue;
      const wert = Math.min(...werte);
      if (bester === null || wert < bester) {
        bester = wert;
        felder = [feld];
      } else if (wert === bester) {
        felder.push(feld);
      }
    }
    if (bester !== null) treffer.push({ vokabel, felder, wert: bester });
  }
  const imLemma = t => (t.felder.includes('lemma') ? 0 : 1);
  const sortierName = t => normalisiere(t.vokabel.lemma);
  return treffer.sort((a, b) => a.wert - b.wert || imLemma(a) - imLemma(b)
    || sortierName(a).localeCompare(sortierName(b)) || a.vokabel.id.localeCompare(b.vokabel.id));
}

// Exakte Suche (siehe oben): Lemma oder eine der angegebenen Formen.
export function sucheVokabeln(vokabeln, eingabe) {
  const suche = normalisiere(eingabe);
  if (!suche) return [];
  return finde(vokabeln, s => (s === suche ? 0 : null));
}

// "*" als Platzhalter für beliebig viele (auch keine) Zeichen, z.B. "*are"
// oder "con*". Gilt für den ganzen Schlüssel oder ein einzelnes Wort daraus.
export const PLATZHALTER = '*';

function platzhalterMuster(eingabe) {
  // Platzhalter durch ein Zeichen ersetzen, das normalisiere() nicht
  // verändert, dann den Rest wie üblich normalisieren.
  const n = normalisiere(eingabe.replaceAll(PLATZHALTER, ' # ')).replace(/ ?# ?/g, '#');
  if (!n.replaceAll('#', '').trim()) return null;
  const quelle = n.split('#').map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${quelle}$`);
}

// Mindestlänge für Teilwort- und Ähnlichkeitssuche - kürzere Eingaben
// träfen fast jedes Wort.
export const MIN_LAENGE_TEILWORT = 2;
export const MIN_LAENGE_AEHNLICH = 4;

// Erlaubte Abweichung für "ähnliche Wörter" - großzügiger als die
// Tippfehlertoleranz der Abfrage, da hier nur Vorschläge entstehen. Am
// echten Wortschatz geprüft: 2 Abweichungen bei 5-6 Buchstaben ergäben
// meist 10-35 Vorschläge, 1 nur eine Handvoll.
export function aehnlichkeitsSchwelle(laenge) {
  if (laenge < MIN_LAENGE_AEHNLICH) return -1;
  if (laenge <= 6) return 1;
  if (laenge <= 10) return 2;
  return 3;
}

// Erweiterte Suche in Abschnitten, jede Vokabel nur im ersten passenden:
// - mit "*": nur { platzhalter } (Musterabgleich).
// - sonst { exakt, teilwort, aehnlich }: exakte Treffer; Schlüssel, die die
//   Eingabe enthalten (Wortanfang zuerst); ähnlich geschriebene Wörter
//   (Levenshtein-Distanz, kleinste zuerst).
export function sucheErweitert(vokabeln, eingabe) {
  if (eingabe.includes(PLATZHALTER)) {
    const muster = platzhalterMuster(eingabe);
    return { platzhalter: muster ? finde(vokabeln, s => (muster.test(s) ? 0 : null)) : [] };
  }
  const suche = normalisiere(eingabe);
  if (!suche) return { exakt: [], teilwort: [], aehnlich: [] };

  const exakt = sucheVokabeln(vokabeln, eingabe);
  const gefunden = new Set(exakt.map(t => t.vokabel.id));

  const teilwort = suche.length < MIN_LAENGE_TEILWORT ? [] : finde(vokabeln, s => {
    if (s.startsWith(suche)) return 0;
    return s.includes(suche) ? 1 : null;
  }, gefunden);
  for (const t of teilwort) gefunden.add(t.vokabel.id);

  const schwelle = aehnlichkeitsSchwelle(suche.length);
  const aehnlich = schwelle < 1 ? [] : finde(vokabeln, s => {
    // Schneller Ausschluss über die Länge, bevor gerechnet wird.
    if (Math.abs(s.length - suche.length) > schwelle) return null;
    const d = levenshteinDistanz(s, suche);
    return d <= schwelle ? d : null;
  }, gefunden);

  return { exakt, teilwort, aehnlich };
}
