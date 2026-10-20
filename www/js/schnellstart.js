// Reine Logik für die Abfrage-Auswahl und die Schnellstart-Modi auf der
// Startseite ("Wie zuletzt", "Neueste Lektion", "Alle schwachen") - bewusst
// ohne Abhängigkeit zu Store/DOM, damit sie sich mit Node testen lässt.

// Bis zu diesem Level gilt eine Vokabel, die schon einmal falsch war, als
// "schwach": Level 1 = zuletzt falsch, Level 2 = seit dem letzten Fehler
// erst einmal richtig (siehe aktualisiereFortschritt in store.js - falsch
// setzt auf Level 1 zurück, richtig zählt hoch). Ohne Fehler ist ein Wort
// nie schwach - sonst stünde jedes neue Wort nach der ersten richtigen
// Antwort (Level 1 -> 2) fälschlich auf der Liste.
export const SCHWACH_BIS_LEVEL = 2;

// Vokabeln nach Lektion gruppiert, je Lektion sortiert nach ID (= Reihenfolge
// im Buch). Inselwortschatz hat keine Lektionsnummer und fehlt hier.
export function gruppiereNachLektion(vokabeln) {
  const gruppen = {};
  for (const vokabel of Object.values(vokabeln)) {
    if (!vokabel.lektion) continue;
    if (!gruppen[vokabel.lektion]) gruppen[vokabel.lektion] = [];
    gruppen[vokabel.lektion].push(vokabel);
  }
  for (const liste of Object.values(gruppen)) {
    liste.sort((a, b) => a.id.localeCompare(b.id));
  }
  return gruppen;
}

// Pool (Liste von Vokabel-IDs) aus einer Auswahl { lektionen, bisId }:
// alle Vokabeln der gewählten Lektionen, bei der höchsten davon optional nur
// bis einschließlich bisId. Nicht (mehr) vorhandene Lektionen werden
// ignoriert, ebenso eine bisId, die nicht in dieser Lektion liegt.
export function bauePool(gruppen, { lektionen, bisId = null }) {
  const vorhanden = [...new Set(lektionen)].filter(nr => gruppen[nr]).sort((a, b) => a - b);
  if (vorhanden.length === 0) return [];
  const hoechste = vorhanden[vorhanden.length - 1];
  const pool = [];
  for (const nr of vorhanden) {
    let liste = gruppen[nr];
    if (nr === hoechste && bisId) {
      const index = liste.findIndex(v => v.id === bisId);
      if (index !== -1) liste = liste.slice(0, index + 1);
    }
    pool.push(...liste.map(v => v.id));
  }
  return pool;
}

// Mindestens einmal falsch beantwortet und Level <= SCHWACH_BIS_LEVEL.
// Nie abgefragte und bisher immer richtig beantwortete Vokabeln zählen
// nicht als schwach.
export function schwacheVokabelIds(vokabeln, fortschritt) {
  return Object.keys(vokabeln)
    .filter(id => {
      const eintrag = fortschritt[id];
      return eintrag && eintrag.zuletzt > 0 && eintrag.fehler > 0 && eintrag.level <= SCHWACH_BIS_LEVEL;
    })
    .sort();
}

// Höchste Lektion, aus der schon einmal eine Vokabel abgefragt wurde - oder
// null, wenn noch nichts abgefragt wurde.
export function zuletztGeuebteLektion(vokabeln, fortschritt) {
  let hoechste = null;
  for (const [id, vokabel] of Object.entries(vokabeln)) {
    if (!vokabel.lektion || !(fortschritt[id]?.zuletzt > 0)) continue;
    if (hoechste === null || vokabel.lektion > hoechste) hoechste = vokabel.lektion;
  }
  return hoechste;
}

// Auswahl für "Neueste Lektion": die im Profil eingestellte aktuelle Lektion
// (optional nur bis zu einem Wort), sonst automatisch die zuletzt geübte.
// null, wenn sich keine Lektion bestimmen lässt.
export function neuesteLektionAuswahl(vokabeln, fortschritt, profil) {
  const gruppen = gruppiereNachLektion(vokabeln);
  const eingestellt = profil?.aktuelleLektion;
  if (eingestellt && gruppen[eingestellt]) {
    const bisId = profil.aktuelleBisId
      && gruppen[eingestellt].some(v => v.id === profil.aktuelleBisId)
      ? profil.aktuelleBisId
      : null;
    return { lektionen: [eingestellt], bisId };
  }
  const automatisch = zuletztGeuebteLektion(vokabeln, fortschritt);
  return automatisch === null ? null : { lektionen: [automatisch], bisId: null };
}

// Kurzbeschreibung einer Auswahl für die Schnellstart-Knöpfe, z.B. "L23",
// "L20–24", "L5, L7" oder "L24 bis Nr. 12". Aufeinanderfolgende Lektionen
// werden zu Bereichen zusammengefasst.
export function beschreibeAuswahl(gruppen, { lektionen, bisId = null }) {
  const nummern = [...new Set(lektionen)].filter(nr => gruppen[nr]).sort((a, b) => a - b);
  const bereiche = [];
  for (const nr of nummern) {
    const letzter = bereiche[bereiche.length - 1];
    if (letzter && nr === letzter[1] + 1) letzter[1] = nr;
    else bereiche.push([nr, nr]);
  }
  let text = bereiche.map(([von, bis]) => (von === bis ? `L${von}` : `L${von}–${bis}`)).join(', ');
  if (bisId && nummern.length > 0) {
    const index = gruppen[nummern[nummern.length - 1]].findIndex(v => v.id === bisId);
    if (index !== -1) text += ` bis Nr. ${index + 1}`;
  }
  return text;
}
