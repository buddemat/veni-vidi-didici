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

// Wandelt die lektionsgruppierte Seed-Struktur in eine flache, nach
// Vokabel-ID indizierte Map um (eine Ebene, einfach zu durchsuchen/speichern).
// Inselwortschatz (optional) steht in seiner Lektion, markiert mit
// `fakultativ: true`.
function flacheVokabelnAusSeed(seedJson) {
  const vokabeln = {};
  for (const lektion of seedJson.lektionen || []) {
    for (const vokabel of lektion.vokabeln) {
      vokabeln[vokabel.id] = { ...vokabel, lektion: lektion.lektion };
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
// - Stores von vor 0.10.2 haben keine Liste gelöschter Vokabel-IDs.
// - Die zuletzt gestartete Abfrage-Auswahl ("Wie zuletzt") lag früher in
//   einstellungen.letzte_abfrage, gehört aber als persönlicher Stand ins
//   Profil (profil.letzteAbfrage).
export function migriereStore(store) {
  let geaendert = false;
  if (!store.profil) {
    store.profil = standardProfil();
    geaendert = true;
  }
  // Im Editor gelöschte Vokabel-IDs (siehe aktualisiereWortschatz) - gibt
  // es erst seit Version 0.10.2.
  if (!Array.isArray(store.geloeschteIds)) {
    store.geloeschteIds = [];
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
    geloeschteIds: [],
    seedVersion: SEED_VERSION,
  };
  speichereStore(neuerStore);
  return neuerStore;
}

// Gleicht den gespeicherten Wortschatz bei jedem App-Start mit dem
// mitgelieferten (vokabeln.json) ab, damit Korrekturen und neue Vokabeln
// eines App-Updates auf dem Handy ankommen - ohne Fortschritt oder eigene
// Änderungen zu verlieren. Regeln:
// - neue Vokabel im Wortschatz der App: hinzufügen (mit neuem Fortschritt)
// - Vokabel dort geändert, auf dem Handy nicht bearbeitet: aktualisieren,
//   Fortschritt bleibt - außer das lateinische Wort ist ein anderes
//   (gleiche ID, anderes Lemma, z.B. nach Umnummerierung): dann gehört der
//   bisherige Lernstand nicht dazu und wird zurückgesetzt
// - im Editor bearbeitete Vokabel (`bearbeitet`): bleibt unverändert
// - im Editor gelöschte Vokabel (`geloeschteIds`): bleibt gelöscht
// - Vokabel aus dem Wortschatz der App entfernt, auf dem Handy nicht
//   bearbeitet: wird samt Fortschritt entfernt
// - auf dem Handy angelegte Vokabeln (immer `bearbeitet`): bleiben
// Wiederholtes Aufrufen ändert nichts mehr. Gibt die Anzahl der
// hinzugefügten, aktualisierten und entfernten Vokabeln zurück.
export function aktualisiereWortschatz(store, seedJson) {
  const vokabelnAusSeed = flacheVokabelnAusSeed(seedJson);
  const geloescht = new Set(store.geloeschteIds || []);
  const anzahl = { neu: 0, aktualisiert: 0, entfernt: 0 };

  for (const [id, seedVokabel] of Object.entries(vokabelnAusSeed)) {
    if (geloescht.has(id)) continue;
    const vorhanden = store.vokabeln[id];
    if (!vorhanden) {
      store.vokabeln[id] = seedVokabel;
      store.fortschritt[id] = neuerFortschrittEintrag();
      anzahl.neu++;
      continue;
    }
    if (vorhanden.bearbeitet) continue;
    if (JSON.stringify(vorhanden) === JSON.stringify(seedVokabel)) continue;
    if (vorhanden.lemma !== seedVokabel.lemma || !store.fortschritt[id]) {
      store.fortschritt[id] = neuerFortschrittEintrag();
    }
    store.vokabeln[id] = seedVokabel;
    anzahl.aktualisiert++;
  }

  for (const [id, vokabel] of Object.entries(store.vokabeln)) {
    if (vokabelnAusSeed[id] || vokabel.bearbeitet) continue;
    delete store.vokabeln[id];
    delete store.fortschritt[id];
    anzahl.entfernt++;
  }

  return anzahl;
}

// Setzt den Wortschatz auf den mitgelieferten Stand zurück (Vokabelliste,
// "Wortschatz zurücksetzen"): im Editor bearbeitete Vokabeln bekommen
// wieder die Fassung der App, selbst angelegte werden samt Fortschritt
// entfernt, gelöschte kommen zurück. Der Lernstand bleibt erhalten, außer
// eine bearbeitete Vokabel war ein anderes lateinisches Wort (siehe
// aktualisiereWortschatz). Gibt die Anzahl je Fall zurück.
export function setzeWortschatzZurueck(store, seedJson) {
  const vokabelnAusSeed = flacheVokabelnAusSeed(seedJson);
  const anzahl = { zurueckgesetzt: 0, entfernt: 0, wiederhergestellt: 0 };

  for (const [id, vokabel] of Object.entries(store.vokabeln)) {
    if (!vokabel.bearbeitet) continue;
    const seedVokabel = vokabelnAusSeed[id];
    if (seedVokabel) {
      if (vokabel.lemma !== seedVokabel.lemma || !store.fortschritt[id]) {
        store.fortschritt[id] = neuerFortschrittEintrag();
      }
      store.vokabeln[id] = seedVokabel;
      anzahl.zurueckgesetzt++;
    } else {
      delete store.vokabeln[id];
      delete store.fortschritt[id];
      anzahl.entfernt++;
    }
  }

  // Ohne die Liste gelöschter IDs ergänzt der normale Abgleich sie wieder.
  store.geloeschteIds = [];
  anzahl.wiederhergestellt = aktualisiereWortschatz(store, seedJson).neu;
  return anzahl;
}

// Haelt den geladenen Store im Speicher, damit ihn alle Screens ueber
// getStore()/persistStore() gemeinsam nutzen koennen, ohne ihn
// durchzureichen oder bei jedem Zugriff neu aus localStorage zu lesen.
let aktuellerStore = null;
// Mitgelieferter Wortschatz (vokabeln.json) für "Wortschatz zurücksetzen" -
// null, wenn nur der Beispiel-Wortschatz geladen werden konnte.
let mitgelieferterWortschatz = null;

// `wortschatzAbgleichen`: false, wenn nur der Beispiel-Wortschatz geladen
// werden konnte - dann nicht abgleichen, sonst würde ein vorhandener echter
// Wortschatz als "aus der App entfernt" gelöscht.
export function initStore(seedJson, { wortschatzAbgleichen = true } = {}) {
  aktuellerStore = importiereSeedFallsNoetig(seedJson);
  mitgelieferterWortschatz = wortschatzAbgleichen ? seedJson : null;
  if (wortschatzAbgleichen) {
    const anzahl = aktualisiereWortschatz(aktuellerStore, seedJson);
    if (anzahl.neu || anzahl.aktualisiert || anzahl.entfernt) {
      console.log('Wortschatz abgeglichen:', anzahl);
      persistStore();
    }
  }
  return aktuellerStore;
}

export function kannWortschatzZuruecksetzen() {
  return mitgelieferterWortschatz !== null;
}

// Was "Wortschatz zurücksetzen" ändern würde (für die Rückfrage), ohne den
// Store anzufassen.
export function vorschauWortschatzZuruecksetzen() {
  return setzeWortschatzZurueck(JSON.parse(JSON.stringify(aktuellerStore)), mitgelieferterWortschatz);
}

export function wortschatzZuruecksetzen() {
  const anzahl = setzeWortschatzZurueck(aktuellerStore, mitgelieferterWortschatz);
  persistStore();
  return anzahl;
}

// Im Editor gelöscht: merken, damit der Abgleich beim nächsten Start
// (aktualisiereWortschatz) die Vokabel nicht wieder hinzufügt.
export function loescheVokabelAusStore(vokabelId) {
  delete aktuellerStore.vokabeln[vokabelId];
  delete aktuellerStore.fortschritt[vokabelId];
  if (!aktuellerStore.geloeschteIds.includes(vokabelId)) aktuellerStore.geloeschteIds.push(vokabelId);
  persistStore();
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
