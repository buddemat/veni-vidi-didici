// Reine Suchlogik für "Vokabel nachschlagen" - ohne Store/DOM, damit sie
// sich in Node testen lässt.
//
// Gesucht wird das eingegebene lateinische Wort im Lemma und in allen
// angegebenen Formen (Genitiv, 1. Sg. Präs., Perfekt, PPP, f/n-Formen, ...),
// also z.B. auch "vēnī" -> venīre. Verglichen wird normalisiert (ohne
// Makrons, Groß/klein, u/v, i/j, wie in der Antwortprüfung), aber exakt:
// keine Teilwörter, keine Tippfehlertoleranz.

import { normalisiere } from './pruefung.js';

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

// Passt die (normalisierte) Suche zu einem Schlüssel? Ganzer Schlüssel
// ("non venire") oder ein einzelnes Wort daraus ("venire", "sive" in
// "sīve ... sīve").
function passt(suche, schluessel) {
  return schluessel === suche || schluessel.split(' ').includes(suche);
}

// Liefert die passenden Vokabeln als [{ vokabel, felder }], `felder` sind
// die getroffenen Felder ('lemma' oder ein Form-Schlüssel wie
// 'perfekt_1sg'). Treffer im Lemma zuerst, sonst nach ID sortiert.
export function sucheVokabeln(vokabeln, eingabe) {
  const suche = normalisiere(eingabe);
  if (!suche) return [];
  const treffer = [];
  for (const vokabel of Object.values(vokabeln)) {
    const felder = [];
    if (suchSchluessel(vokabel.lemma).some(s => passt(suche, s))) felder.push('lemma');
    for (const [feld, wert] of Object.entries(vokabel.formen || {})) {
      if (feld === 'genus') continue;
      if (suchSchluessel(wert).some(s => passt(suche, s))) felder.push(feld);
    }
    if (felder.length > 0) treffer.push({ vokabel, felder });
  }
  const imLemma = t => (t.felder.includes('lemma') ? 0 : 1);
  return treffer.sort((a, b) => imLemma(a) - imLemma(b) || a.vokabel.id.localeCompare(b.vokabel.id));
}
