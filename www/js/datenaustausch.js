// Export/Import von JSON-Dateien - Profil und Wortschatz getrennt
// voneinander (siehe store.js), aber über dieselbe Dateimechanik.
//
// Im Browser (Entwicklung): Download über Blob + <a download>.
// Auf dem Handy: Datei über @capacitor/filesystem im Ordner
// Documents/VeniVidiDidici speichern (dort findet sie der Import über die
// Dateiauswahl wieder) und danach auf Wunsch zusätzlich über
// @capacitor/share teilen (E-Mail/Messenger/Google Drive) - kein Kabel
// nötig. Nur Teilen reichte nicht: Der Teilen-Dialog bietet nicht auf jedem
// Handy "Als Datei speichern" an. Wie schon bei der Spracheingabe (Schritt
// 10/11): Plugins über die von Capacitor injizierte globale Registry
// (window.Capacitor.Plugins) ansprechen, NICHT per import - ohne Bundler
// ließe sich ein npm-Paket im Browser gar nicht auflösen.

function istCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor;
}

function ladeAlsBrowserDownload(dateiname, inhalt) {
  const blob = new Blob([inhalt], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = dateiname;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const EXPORT_ORDNER = 'VeniVidiDidici';

async function speichereUndTeileDatei(dateiname, inhalt) {
  const { Filesystem, Share } = window.Capacitor.Plugins;
  // Ab Android 11 ohne Berechtigung (eigene Dateien in Documents); bis
  // Android 10 fragt das Plugin hier nach der Speicher-Berechtigung.
  await Filesystem.requestPermissions();
  let geschrieben;
  try {
    geschrieben = await Filesystem.writeFile({
      path: `${EXPORT_ORDNER}/${dateiname}`,
      data: inhalt,
      directory: 'DOCUMENTS',
      encoding: 'utf8',
      recursive: true,
    });
  } catch (fehler) {
    // Typischer Fall: Die Datei stammt noch von einer früheren Installation
    // der App - die darf Android die neue Installation nicht überschreiben.
    throw new Error(
      `${fehler?.message || fehler}\n\nFalls es „Documents/${EXPORT_ORDNER}/${dateiname}“ schon gibt `
      + '(z.B. von vor einer Neuinstallation der App): die alte Datei löschen oder umbenennen und '
      + 'nochmal exportieren.'
    );
  }
  const teilen = confirm(
    `Gespeichert im Ordner „Documents/${EXPORT_ORDNER}“ als „${dateiname}“. `
    + 'Ein weiterer Export am selben Tag überschreibt diese Datei.\n\n'
    + 'Zusätzlich teilen (z.B. per E-Mail oder in Google Drive)?'
  );
  if (teilen) await Share.share({ title: dateiname, url: geschrieben.uri });
}

// datenObjekt wird als hübsch formatiertes JSON exportiert.
export async function exportiereDatei(dateiname, datenObjekt) {
  const inhalt = JSON.stringify(datenObjekt, null, 2);
  if (istCapacitor()) {
    await speichereUndTeileDatei(dateiname, inhalt);
  } else {
    ladeAlsBrowserDownload(dateiname, inhalt);
  }
}

// Liest eine vom Nutzer ausgewählte Datei (z.B. aus <input type="file">) und
// gibt das geparste JSON zurück.
export function leseJsonDatei(datei) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch {
        reject(new Error('Die Datei enthält kein gültiges JSON.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsText(datei);
  });
}

// Verdrahtet einen Export-Button (ruft datenFn() -> {dateiname, daten} auf)
// und ein Button+verstecktes <input type="file">-Paar für den Import (ruft
// verarbeiteFn(json) mit dem eingelesenen Inhalt auf).
export function initExportKnopf(buttonId, datenFn) {
  const button = document.getElementById(buttonId);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { dateiname, daten } = datenFn();
      await exportiereDatei(dateiname, daten);
    } catch (fehler) {
      console.error('Export fehlgeschlagen:', fehler);
      alert(`Export fehlgeschlagen: ${fehler?.message || fehler}`);
    } finally {
      button.disabled = false;
    }
  });
}

export function initImportKnopf(buttonId, dateiInputId, verarbeiteFn) {
  const button = document.getElementById(buttonId);
  const dateiInput = document.getElementById(dateiInputId);
  button.addEventListener('click', () => dateiInput.click());
  dateiInput.addEventListener('change', async () => {
    const datei = dateiInput.files[0];
    dateiInput.value = ''; // dieselbe Datei später erneut auswählbar machen
    if (!datei) return;
    try {
      const json = await leseJsonDatei(datei);
      verarbeiteFn(json);
    } catch (fehler) {
      console.error('Import fehlgeschlagen:', fehler);
      alert(`Import fehlgeschlagen: ${fehler?.message || fehler}`);
    }
  });
}
