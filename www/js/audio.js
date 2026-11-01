// Aussprache-Audio: je Vokabel höchstens eine Datei mit dem lateinischen
// Lemma. Zwei Quellen:
//   - mitgeliefert: assets/audio/ (bzw. assets/audio-beispiel/ beim
//     Beispiel-Wortschatz) mit index.json { ID: { datei, lemma } },
//   - eigene Aufnahmen/Importe: IndexedDB (localStorage ist für Audio zu
//     klein), je ID { id, lemma, blob }.
// Eigene gehen vor. Abgespielt wird nur, wenn das gespeicherte Lemma zum
// aktuellen Wort passt - gehört eine ID später zu einem anderen Wort, bleibt
// die alte Datei stumm, statt das falsche Wort vorzusprechen.

const DB_NAME = 'venividididici_audio';
const DB_STORE = 'aufnahmen';

let mitgeliefert = {}; // ID -> { url, lemma }
let eigene = {}; // ID -> lemma (Blobs werden erst beim Abspielen geladen)
let player = null;
let playerUrl = null;

// --- Reine Hilfsfunktionen (ohne DOM/IndexedDB, mit Node testbar) ---

// Vergleich ohne Makronen und Groß-/Kleinschreibung: Eine Korrektur der
// Längenzeichen im Wortschatz soll die Aufnahme nicht stumm schalten.
export function lemmaPasst(a, b) {
  const n = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return n(a) !== '' && n(a) === n(b);
}

// Dateiname für Export/Import: "<ID>_<lemma-ascii>.<ext>", z.B.
// "L01-001_venire.webm" - die ID ist maßgeblich, das Lemma nur zur
// Lesbarkeit.
export function audioDateiname(id, lemma, ext) {
  const ascii = String(lemma).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${id}${ascii ? `_${ascii}` : ''}.${ext}`;
}

// ID aus einem Dateinamen (auch mit Ordnerpfad im ZIP) - oder null.
export function idAusDateiname(name) {
  const basis = String(name).split('/').pop();
  const treffer = basis.match(/^([A-Za-z]+\d*-\d+)(?:_[^.]*)?\.[A-Za-z0-9]+$/);
  return treffer ? treffer[1] : null;
}

// Welche Quelle für eine Vokabel gilt: 'eigen', 'mitgeliefert' oder null.
export function audioQuelle(vokabel, eigeneLemmata, mitgelieferteEintraege) {
  if (!vokabel) return null;
  if (lemmaPasst(eigeneLemmata[vokabel.id], vokabel.lemma)) return 'eigen';
  if (lemmaPasst(mitgelieferteEintraege[vokabel.id]?.lemma, vokabel.lemma)) return 'mitgeliefert';
  return null;
}

// --- IndexedDB ---

function oeffneDb() {
  return new Promise((resolve, reject) => {
    const anfrage = indexedDB.open(DB_NAME, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  });
}

async function mitStore(modus, aktion) {
  const db = await oeffneDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaktion = db.transaction(DB_STORE, modus);
      const ergebnis = aktion(transaktion.objectStore(DB_STORE));
      transaktion.oncomplete = () => resolve(ergebnis.result);
      transaktion.onerror = () => reject(transaktion.error);
    });
  } finally {
    db.close();
  }
}

export async function eigeneAufnahmeSpeichern(id, lemma, blob) {
  await mitStore('readwrite', store => store.put({ id, lemma, blob }));
  eigene[id] = lemma;
}

export async function eigeneAufnahmeLoeschen(id) {
  await mitStore('readwrite', store => store.delete(id));
  delete eigene[id];
}

export async function eigeneAufnahmeLaden(id) {
  return mitStore('readonly', store => store.get(id));
}

// Alle eigenen Aufnahmen (mit Blob) - für den Export.
export async function alleEigenenAufnahmen() {
  return mitStore('readonly', store => store.getAll());
}

// --- Laden und Abspielen ---

async function ladeIndex(ordner) {
  try {
    const antwort = await fetch(`${ordner}/index.json`);
    if (!antwort.ok) return {};
    const index = await antwort.json();
    return Object.fromEntries(Object.entries(index).map(([id, e]) => [id, { url: `${ordner}/${e.datei}`, lemma: e.lemma }]));
  } catch (e) {
    return {};
  }
}

// Beim App-Start: mitgelieferten Index und die Liste eigener Aufnahmen
// laden, damit hatAudio() danach ohne Warten antworten kann. Fehlt etwas
// (kein Audio-Ordner, IndexedDB nicht verfügbar), gibt es eben kein Audio.
export async function initAudio(istBeispiel) {
  mitgeliefert = await ladeIndex(istBeispiel ? 'assets/audio-beispiel' : 'assets/audio');
  try {
    const alle = await mitStore('readonly', store => store.getAll());
    eigene = Object.fromEntries(alle.map(a => [a.id, a.lemma]));
  } catch (e) {
    console.warn('Eigene Aufnahmen nicht verfügbar:', e);
    eigene = {};
  }
  console.log(`Audio: ${Object.keys(mitgeliefert).length} mitgeliefert, ${Object.keys(eigene).length} eigene.`);
}

export function quelleFuer(vokabel) {
  return audioQuelle(vokabel, eigene, mitgeliefert);
}

// Gibt es eine mitgelieferte Aufnahme (unabhängig von einer eigenen)?
export function hatMitgelieferteAudio(vokabel) {
  return !!vokabel && lemmaPasst(mitgeliefert[vokabel.id]?.lemma, vokabel.lemma);
}

export function hatAudio(vokabel) {
  return quelleFuer(vokabel) !== null;
}

// URL zum Abspielen (bei eigener Aufnahme eine Objekt-URL, die der
// Aufrufer nach Gebrauch freigibt - siehe spieleAudio) oder null.
async function audioUrl(vokabel) {
  const quelle = quelleFuer(vokabel);
  if (quelle === 'mitgeliefert') return { url: mitgeliefert[vokabel.id].url, eigen: false };
  if (quelle === 'eigen') {
    const eintrag = await eigeneAufnahmeLaden(vokabel.id);
    return eintrag ? { url: URL.createObjectURL(eintrag.blob), eigen: true } : null;
  }
  return null;
}

async function abspielen(url, objektUrl) {
  player = new Audio(url);
  if (objektUrl) playerUrl = url;
  try {
    await player.play();
    return true;
  } catch (e) {
    console.warn('Audio-Wiedergabe nicht möglich:', e);
    return false;
  }
}

// Spielt das Lemma ab; eine laufende Wiedergabe wird vorher beendet.
// Gibt false zurück, wenn es nichts abzuspielen gibt oder der Browser die
// Wiedergabe verweigert (z.B. Autoplay ohne vorheriges Antippen).
export async function spieleAudio(vokabel) {
  stoppeAudio();
  const quelle = await audioUrl(vokabel);
  if (!quelle) return false;
  return abspielen(quelle.url, quelle.eigen);
}

// Spielt eine noch nicht gespeicherte Aufnahme ab (Editor).
export async function spieleBlob(blob) {
  stoppeAudio();
  return abspielen(URL.createObjectURL(blob), true);
}

export function stoppeAudio() {
  if (player) {
    player.pause();
    player = null;
  }
  if (playerUrl) {
    URL.revokeObjectURL(playerUrl);
    playerUrl = null;
  }
}
