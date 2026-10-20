import { getStore } from './store.js';
import { starteRunde } from './lektionsauswahl.js';
import {
  gruppiereNachLektion, bauePool, schwacheVokabelIds, neuesteLektionAuswahl, beschreibeAuswahl,
} from './schnellstart.js';

// Ohne gespeicherte Auswahl (noch nie über "Abfrage starten" gestartet)
// gelten die Standardwerte der Lektionsauswahl.
const STANDARD_ABFRAGEMODUS = 'gleichverteilt';
const STANDARD_RUNDENENDE = 'alle-einmal';

function knopf(text, onClick, deaktiviert = false) {
  const button = document.createElement('button');
  button.textContent = text;
  button.disabled = deaktiviert;
  button.addEventListener('click', onClick);
  return button;
}

// Schnellstart-Knöpfe: werden bei jedem Anzeigen der Startseite neu
// aufgebaut, damit Beschriftung (z.B. Anzahl schwacher Vokabeln) und
// Verfügbarkeit nach einer Runde oder Profil-Änderung stimmen. Alle drei
// sind immer sichtbar, nicht anwendbare (noch keine Auswahl gespeichert,
// noch nichts geübt, keine schwachen Vokabeln) nur ausgegraut.
export function renderSchnellstart() {
  const store = getStore();
  const gruppen = gruppiereNachLektion(store.vokabeln);
  const letzte = store.profil.letzteAbfrage || null;
  const abfrageModus = letzte?.abfrageModus || STANDARD_ABFRAGEMODUS;
  const rundenende = letzte?.rundenende || STANDARD_RUNDENENDE;

  const letztePool = letzte ? bauePool(gruppen, letzte) : [];
  const wieZuletzt = letztePool.length > 0
    ? knopf(`Wie zuletzt (${beschreibeAuswahl(gruppen, letzte)})`, () => {
      starteRunde(bauePool(gruppen, letzte), abfrageModus, rundenende);
    })
    : knopf('Wie zuletzt', () => {}, true);

  const neueste = neuesteLektionAuswahl(store.vokabeln, store.fortschritt, store.profil);
  const neuesteLektion = neueste
    ? knopf(`Neueste Lektion (${beschreibeAuswahl(gruppen, neueste)})`, () => {
      starteRunde(bauePool(gruppen, neueste), abfrageModus, rundenende);
    })
    : knopf('Neueste Lektion', () => {}, true);

  // Bei schwachen Vokabeln geht es ums Festigen - die Runde endet erst,
  // wenn jede einmal richtig war.
  const schwache = schwacheVokabelIds(store.vokabeln, store.fortschritt);
  const alleSchwachen = knopf(`Alle schwachen (${schwache.length})`, () => {
    starteRunde(schwacheVokabelIds(store.vokabeln, store.fortschritt), abfrageModus, 'alle-richtig');
  }, schwache.length === 0);

  document.getElementById('start-schnellstart-knoepfe').replaceChildren(wieZuletzt, neuesteLektion, alleSchwachen);
}

export function initStartseite() {
  document.addEventListener('screen-gezeigt', e => {
    if (e.detail.id === 'start') renderSchnellstart();
  });
  renderSchnellstart();
}
