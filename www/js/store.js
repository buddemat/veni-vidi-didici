const SPEICHER_SCHLUESSEL = 'venividididici_v1';
const SEED_VERSION = 1;

function standardAbfrageFelder() {
  return {
    substantiv: ['genus'],
    verb: ['praesens_1sg'],
    adjektiv: ['f', 'n', 'genitiv'],
    sonstiges: [],
  };
}

export function neuerFortschrittEintrag() {
  return { level: 1, fehler: 0, zuletzt: 0, rueckfragen: 0 };
}

function standardEinstellungen() {
  return {
    abfrage_felder: standardAbfrageFelder(),
    // Bei unvollständigen (aber nicht falschen) Antworten gezielt nachfragen
    // statt sofort "falsch" zu werten - siehe Plan Punkt 9.
    rueckfragen_aktiv: false,
    // Kleine Tippfehler (z.B. vocare/vokare) trotzdem als richtig werten.
    tippfehlertoleranz_aktiv: true,
    // Nach einer falschen Antwort einen Button "Als richtig werten" zeigen
    // (für Antworten, die nur an Komma, Tippfehler o.Ä. gescheitert sind).
    als_richtig_werten_aktiv: false,
  };
}

// Profil: persönliche Angaben, getrennt von Fortschritt/Einstellungen und
// vom Wortschatz - Name (später ggf. Profilbild) wird auf der Startseite
// in der Begrüßung angezeigt.
// aktuelleLektion: für den Schnellstart "Neueste Lektion" (null = automatisch
// die zuletzt geübte), aktuelleBisId: optional nur bis zu diesem Wort.
// letzteAbfrage: zuletzt über "Abfrage starten" gewählte Auswahl (für den
// Schnellstart "Wie zuletzt" und zum Vorbelegen der Lektionsauswahl).
function standardProfil() {
  return { name: '', aktuelleLektion: null, aktuelleBisId: null, letzteAbfrage: null };
}

// Wandelt die lektions-/inselgruppierte Seed-Struktur in eine flache,
// nach Vokabel-ID indizierte Map um (eine Ebene, einfach zu durchsuchen/speichern).
function flacheVokabelnAusSeed(seedJson) {
  const vokabeln = {};
  for (const lektion of seedJson.lektionen || []) {
    for (const vokabel of lektion.vokabeln) {
      vokabeln[vokabel.id] = { ...vokabel, lektion: lektion.lektion };
    }
  }
  for (const insel of seedJson.inselwortschatz || []) {
    for (const vokabel of insel.vokabeln) {
      vokabeln[vokabel.id] = { ...vokabel, insel: insel.insel, fakultativ: true };
    }
  }
  return vokabeln;
}

export function ladeStore() {
  const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
  return roh ? JSON.parse(roh) : null;
}

export function speichereStore(store) {
  localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(store));
}

// Beim allerersten Start (kein Store vorhanden): aus dem mitgelieferten
// vokabeln.json seeden. Existiert bereits ein Store, wird er unverändert
// zurückgegeben - die App-JSON-Datei ist dann nur noch Ausgangsmaterial,
// nicht mehr die Quelle der Wahrheit.
// Bringt einen gespeicherten oder importierten Store-/Profil-Stand auf die
// aktuelle Struktur. Gibt true zurück, wenn etwas geändert wurde.
// - Stores von vor Einführung des Profils haben kein profil-Objekt.
// - Die zuletzt gestartete Abfrage-Auswahl ("Wie zuletzt") lag früher in
//   einstellungen.letzte_abfrage, gehört aber als persönlicher Stand ins
//   Profil (profil.letzteAbfrage).
export function migriereStore(store) {
  let geaendert = false;
  if (!store.profil) {
    store.profil = standardProfil();
    geaendert = true;
  }
  if (store.einstellungen && 'letzte_abfrage' in store.einstellungen) {
    if (!store.profil.letzteAbfrage) store.profil.letzteAbfrage = store.einstellungen.letzte_abfrage;
    delete store.einstellungen.letzte_abfrage;
    geaendert = true;
  }
  return geaendert;
}

export function importiereSeedFallsNoetig(seedJson) {
  const vorhandenerStore = ladeStore();
  if (vorhandenerStore) {
    if (migriereStore(vorhandenerStore)) speichereStore(vorhandenerStore);
    return vorhandenerStore;
  }

  const vokabeln = flacheVokabelnAusSeed(seedJson);
  const fortschritt = {};
  for (const id of Object.keys(vokabeln)) {
    fortschritt[id] = neuerFortschrittEintrag();
  }

  const neuerStore = {
    vokabeln,
    fortschritt,
    einstellungen: standardEinstellungen(),
    profil: standardProfil(),
    seedVersion: SEED_VERSION,
  };
  speichereStore(neuerStore);
  return neuerStore;
}

// Ergänzt einen bestehenden Store um neue Lektionen/Vokabeln aus einer
// aktualisierten Seed-Datei (App-Update). Bestehende Vokabel-IDs werden
// nie überschrieben, damit Korrekturen/Fortschritt erhalten bleiben.
export function ergaenzeNeueLektionen(store, seedJson) {
  const vokabelnAusSeed = flacheVokabelnAusSeed(seedJson);
  let neuHinzugefuegt = 0;

  for (const [id, vokabel] of Object.entries(vokabelnAusSeed)) {
    if (store.vokabeln[id]) continue;
    store.vokabeln[id] = vokabel;
    store.fortschritt[id] = neuerFortschrittEintrag();
    neuHinzugefuegt++;
  }

  if (neuHinzugefuegt > 0) {
    store.seedVersion = SEED_VERSION;
    speichereStore(store);
  }
  return neuHinzugefuegt;
}

// Haelt den geladenen Store im Speicher, damit ihn alle Screens ueber
// getStore()/persistStore() gemeinsam nutzen koennen, ohne ihn
// durchzureichen oder bei jedem Zugriff neu aus localStorage zu lesen.
let aktuellerStore = null;

export function initStore(seedJson) {
  aktuellerStore = importiereSeedFallsNoetig(seedJson);
  return aktuellerStore;
}

export function getStore() {
  return aktuellerStore;
}

export function persistStore() {
  speichereStore(aktuellerStore);
}

// Level nach Leitner-Prinzip: richtig -> eine Stufe hoch (max. 5), falsch ->
// zurück auf Stufe 1. Wird direkt gespeichert, damit der Fortschritt auch
// bei abruptem Schließen der App nicht verloren geht.
// `rueckfragenAnzahl` (Punkt 9): wie viele Rückfragen für diese Runde nötig
// waren (0, wenn die Einstellung aus ist oder alles auf Anhieb stimmte) -
// wird für die nächste Runde als Gewichtungs-Bonus verwendet (Schritt 6).
export function aktualisiereFortschritt(vokabelId, richtig, rueckfragenAnzahl = 0) {
  const eintrag = aktuellerStore.fortschritt[vokabelId] || neuerFortschrittEintrag();
  eintrag.level = richtig ? Math.min(5, eintrag.level + 1) : 1;
  if (!richtig) eintrag.fehler += 1;
  eintrag.rueckfragen = rueckfragenAnzahl;
  eintrag.zuletzt = Date.now();
  aktuellerStore.fortschritt[vokabelId] = eintrag;
  persistStore();
  return eintrag;
}

// Setzt den Fortschritt einer Vokabel auf einen früheren Stand zurück
// (null/undefined = Eintrag gab es vorher nicht) - für "Als richtig werten",
// damit die vorherige Falsch-Wertung keine Spuren hinterlässt.
export function stelleFortschrittWiederHer(vokabelId, eintrag) {
  if (eintrag) aktuellerStore.fortschritt[vokabelId] = { ...eintrag };
  else delete aktuellerStore.fortschritt[vokabelId];
  persistStore();
}

// --- Export/Import: Profil (Fortschritt + Einstellungen) und Wortschatz
// (nur Vokabeln) bewusst als ZWEI getrennte Dateien/Funktionen, nicht ein
// gemeinsamer Gesamt-Export - deckt beide Anwendungsfälle sauber getrennt
// ab: Profil für Gerätewechsel/Sicherung, Wortschatz für die Vokabelpflege
// (Korrekturen an einem PC zurückspielen, mit anderen Geräten teilen).

export function exportiereProfil() {
  return {
    formatVersion: 1,
    exportiertAm: new Date().toISOString(),
    profil: aktuellerStore.profil,
    fortschritt: aktuellerStore.fortschritt,
    einstellungen: aktuellerStore.einstellungen,
  };
}

// Ersetzt Fortschritt/Einstellungen komplett (Gerätewechsel-Fall - die
// importierte Datei ist dann die "Wahrheit"). Vokabeln bleiben unangetastet;
// Fortschritt-Einträge, die zu keiner aktuell vorhandenen Vokabel gehören,
// bleiben harmlos ungenutzt liegen (falls das Wort später wieder auftaucht).
export function importiereProfil(importierteDaten) {
  aktuellerStore.profil = importierteDaten.profil || standardProfil();
  aktuellerStore.fortschritt = importierteDaten.fortschritt || {};
  aktuellerStore.einstellungen = importierteDaten.einstellungen || standardEinstellungen();
  migriereStore(aktuellerStore); // ältere Exportdateien
  persistStore();
}

export function exportiereWortschatz() {
  return {
    formatVersion: 1,
    exportiertAm: new Date().toISOString(),
    vokabeln: aktuellerStore.vokabeln,
  };
}

// Ergänzt (wie ergaenzeNeueLektionen) nur neue IDs, überschreibt nie
// bestehende - sicher für wiederholten Import derselben/ähnlicher Dateien.
export function importiereWortschatz(importierteDaten) {
  const vokabeln = importierteDaten.vokabeln || {};
  let neuHinzugefuegt = 0;

  for (const [id, vokabel] of Object.entries(vokabeln)) {
    if (aktuellerStore.vokabeln[id]) continue;
    aktuellerStore.vokabeln[id] = vokabel;
    aktuellerStore.fortschritt[id] = neuerFortschrittEintrag();
    neuHinzugefuegt++;
  }

  if (neuHinzugefuegt > 0) persistStore();
  return neuHinzugefuegt;
}
