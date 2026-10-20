import { getStore, persistStore, exportiereProfil, importiereProfil } from './store.js';
import { initExportKnopf, initImportKnopf } from './datenaustausch.js';
import { renderEinstellungen } from './einstellungen.js';
import { gruppiereNachLektion, zuletztGeuebteLektion } from './schnellstart.js';

// Begrüßung auf der Startseite - mit Namen, wenn im Profil einer hinterlegt
// ist, sonst neutral (kein "Hallo !").
function aktualisiereBegruessung() {
  const element = document.getElementById('start-begruessung');
  if (!element) return;
  const name = (getStore().profil.name || '').trim();
  element.textContent = name ? `Hallo ${name}! Was möchtest du tun?` : 'Was möchtest du tun?';
}

function option(value, text) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = text;
  return element;
}

// "Aktuelle Lektion": Automatisch (= zuletzt geübte) oder eine feste Lektion,
// bei fester Lektion optional nur bis zu einem Wort.
function renderAktuelleLektion() {
  const store = getStore();
  const gruppen = gruppiereNachLektion(store.vokabeln);
  const lektionAuswahl = document.getElementById('profil-lektion-auswahl');
  const bisBereich = document.getElementById('profil-bis-bereich');
  const bisAuswahl = document.getElementById('profil-bis-auswahl');

  const automatisch = zuletztGeuebteLektion(store.vokabeln, store.fortschritt);
  lektionAuswahl.replaceChildren(
    option('', automatisch === null ? 'Automatisch (noch nichts geübt)' : `Automatisch (zurzeit Lektion ${automatisch})`),
    ...Object.keys(gruppen).map(Number).sort((a, b) => a - b).map(nr => option(String(nr), `Lektion ${nr}`)),
  );
  const eingestellt = store.profil.aktuelleLektion;
  lektionAuswahl.value = eingestellt && gruppen[eingestellt] ? String(eingestellt) : '';

  bisBereich.hidden = lektionAuswahl.value === '';
  if (!bisBereich.hidden) {
    bisAuswahl.replaceChildren(
      option('', 'Ganze Lektion'),
      ...gruppen[eingestellt].map((v, i) => option(v.id, `${i + 1}. ${v.lemma}`)),
    );
    const bisId = store.profil.aktuelleBisId;
    bisAuswahl.value = bisId && gruppen[eingestellt].some(v => v.id === bisId) ? bisId : '';
  }
}

export function initProfil() {
  const lektionAuswahl = document.getElementById('profil-lektion-auswahl');
  const bisAuswahl = document.getElementById('profil-bis-auswahl');
  lektionAuswahl.addEventListener('change', () => {
    getStore().profil.aktuelleLektion = lektionAuswahl.value ? Number(lektionAuswahl.value) : null;
    getStore().profil.aktuelleBisId = null;
    persistStore();
    renderAktuelleLektion();
  });
  bisAuswahl.addEventListener('change', () => {
    getStore().profil.aktuelleBisId = bisAuswahl.value || null;
    persistStore();
  });
  // Die automatische Lektion hängt vom Fortschritt ab - beim Öffnen des
  // Profils jeweils aktualisieren.
  document.addEventListener('screen-gezeigt', e => {
    if (e.detail.id === 'profil') renderAktuelleLektion();
  });
  renderAktuelleLektion();

  const nameEingabe = document.getElementById('profil-name-eingabe');
  nameEingabe.value = getStore().profil.name || '';
  nameEingabe.addEventListener('input', () => {
    getStore().profil.name = nameEingabe.value;
    persistStore();
    aktualisiereBegruessung();
  });

  initExportKnopf('profil-export-button', () => ({
    dateiname: `profil-${new Date().toISOString().slice(0, 10)}.json`,
    daten: exportiereProfil(),
  }));
  initImportKnopf('profil-import-button', 'profil-import-datei', json => {
    importiereProfil(json);
    nameEingabe.value = getStore().profil.name || '';
    renderAktuelleLektion();
    aktualisiereBegruessung();
    renderEinstellungen();
    alert('Profil importiert (Name, Fortschritt und Einstellungen wurden ersetzt).');
  });

  aktualisiereBegruessung();
}
