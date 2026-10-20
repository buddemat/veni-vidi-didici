// Reihenfolge der Abfrage im gewichteten Modus.
//
// Statt jede Karte unabhängig per Zufall zu ziehen (dabei kommen manche
// Vokabeln mehrfach dran, bevor andere überhaupt einmal gefragt wurden),
// wird ein Stapel gebildet und abgearbeitet:
// - Erster Durchgang einer Runde: jede Vokabel genau einmal, schwächere
//   (höheres Gewicht) tendenziell weiter vorne.
// - Falsch beantwortete Vokabeln werden ein paar Karten später erneut
//   eingereiht (wiederEinreihen).
// - Ist der Stapel leer, wird ein neuer gebildet, in den jede Vokabel mit
//   Wahrscheinlichkeit Gewicht/Höchstgewicht kommt: schwache immer, gut
//   gekonnte nur gelegentlich.

// Leitner-Gewichte je Level (Index 0 = Level 1 ... Index 4 = Level 5),
// fallend mit steigendem Level.
export const LEITNER_GEWICHTE = [8, 4, 2, 1, 0.5];
const HOECHSTGEWICHT = LEITNER_GEWICHTE[0];

// Abstand (in Karten), nach dem eine falsch beantwortete Vokabel wiederkommt.
export const WIEDERHOLUNGS_ABSTAND = 3;

export function gewicht(eintrag) {
  const level = eintrag?.level || 1;
  const basisGewicht = LEITNER_GEWICHTE[Math.min(Math.max(level, 1), 5) - 1];
  // Vokabeln, die zuletzt Rückfragen brauchten, gelten als schwächer
  // sitzend, auch wenn die Antwort am Ende richtig war - pro nötiger
  // Rückfrage ein moderater Aufschlag aufs Grundgewicht.
  return basisGewicht + (eintrag?.rueckfragen || 0);
}

// Gewichtetes Mischen (Efraimidis-Spirakis): Schlüssel u^(1/w), absteigend
// sortiert - höheres Gewicht landet mit höherer Wahrscheinlichkeit vorne.
function gewichtetMischen(ids, fortschritt, zufall) {
  return ids
    .map(id => ({ id, schluessel: zufall() ** (1 / gewicht(fortschritt[id])) }))
    .sort((a, b) => b.schluessel - a.schluessel)
    .map(e => e.id);
}

// Bildet einen neuen Stapel (vorderstes Element = nächste Karte).
// ersterDurchgang: alle Vokabeln genau einmal. Sonst kommt jede Vokabel mit
// Wahrscheinlichkeit Gewicht/Höchstgewicht hinein; bleibt der Stapel dabei
// leer, wird einfach alles genommen. Die zuletzt gefragte Vokabel steht nie
// direkt wieder vorne (außer sie ist die einzige).
export function baueStapel(pool, fortschritt, { ersterDurchgang, zuletztId = null, zufall = Math.random }) {
  let auswahl = ersterDurchgang
    ? [...pool]
    : pool.filter(id => zufall() < gewicht(fortschritt[id]) / HOECHSTGEWICHT);
  if (auswahl.length === 0) auswahl = [...pool];

  const stapel = gewichtetMischen(auswahl, fortschritt, zufall);
  if (stapel.length > 1 && stapel[0] === zuletztId) {
    [stapel[0], stapel[1]] = [stapel[1], stapel[0]];
  }
  return stapel;
}

// Reiht eine (gerade falsch beantwortete) Vokabel erneut ein, sodass
// vorher noch `abstand` andere Karten drankommen - oder ans Ende, wenn der
// Stapel kürzer ist. Ein bereits weiter vorne liegender Eintrag derselben
// Vokabel bleibt bestehen (sie kommt dann eben früher).
export function wiederEinreihen(stapel, id, abstand = WIEDERHOLUNGS_ABSTAND) {
  if (stapel.slice(0, abstand + 1).includes(id)) return;
  stapel.splice(Math.min(abstand, stapel.length), 0, id);
}
