import { getStore } from './store.js';
import { starteRunde } from './lektionsauswahl.js';
import {
  gruppiereNachLektion, gruppiereInselNachLektion, bauePool, schwacheVokabelIds, neuesteLektionAuswahl,
  beschreibeAuswahl, wichtigeVokabelIds,
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
// Verfügbarkeit nach einer Runde oder Profil-Änderung stimmen. Alle sind
// immer sichtbar, nicht anwendbare (noch keine Auswahl gespeichert, noch
// nichts geübt, keine schwachen/wichtigen Vokabeln) nur ausgegraut.
export function renderSchnellstart() {
  const store = getStore();
  const gruppen = gruppiereNachLektion(store.vokabeln);
  const inselGruppen = gruppiereInselNachLektion(store.vokabeln);
  const letzte = store.profil.letzteAbfrage || null;
  const abfrageModus = letzte?.abfrageModus || STANDARD_ABFRAGEMODUS;
  const rundenende = letzte?.rundenende || STANDARD_RUNDENENDE;
  // Ohne/mit/nur Inselwortschatz: wie bei der letzten Auswahl.
  const inselwortschatz = letzte?.inselwortschatz || 'ohne';

  const letztePool = letzte ? bauePool(gruppen, letzte, inselGruppen) : [];
  const wieZuletzt = letztePool.length > 0
    ? knopf(`Wie zuletzt (${beschreibeAuswahl(gruppen, letzte)})`, () => {
      starteRunde(bauePool(gruppen, letzte, inselGruppen), abfrageModus, rundenende);
    })
    : knopf('Wie zuletzt', () => {}, true);

  const neuesteGefunden = neuesteLektionAuswahl(store.vokabeln, store.fortschritt, store.profil);
  const neueste = neuesteGefunden && { ...neuesteGefunden, inselwortschatz };
  const neuestePool = neueste ? bauePool(gruppen, neueste, inselGruppen) : [];
  const neuesteLektion = neueste
    ? knopf(`Neueste Lektion (${beschreibeAuswahl(gruppen, neueste)})`, () => {
      starteRunde(bauePool(gruppen, neueste, inselGruppen), abfrageModus, rundenende);
    }, neuestePool.length === 0)
    : knopf('Neueste Lektion', () => {}, true);

  // Bei schwachen Vokabeln geht es ums Festigen - die Runde endet erst,
  // wenn jede einmal richtig war.
  const schwache = schwacheVokabelIds(store.vokabeln, store.fortschritt);
  const alleSchwachen = knopf(`Alle schwachen (${schwache.length})`, () => {
    starteRunde(schwacheVokabelIds(store.vokabeln, store.fortschritt), abfrageModus, 'alle-richtig');
  }, schwache.length === 0);

  // Wichtigste Wörter bis zur aktuellen Lektion - wie "Alle schwachen" zum
  // Festigen: Runde endet erst, wenn jedes einmal richtig war.
  const wichtige = wichtigeVokabelIds(store.vokabeln, store.fortschritt, store.profil, inselwortschatz);
  const wichtigsteWoerter = wichtige
    ? knopf(`Wichtigste Wörter (${wichtige.length})`, () => {
      starteRunde(
        wichtigeVokabelIds(store.vokabeln, store.fortschritt, store.profil, inselwortschatz), abfrageModus, 'alle-richtig'
      );
    }, wichtige.length === 0)
    : knopf('Wichtigste Wörter', () => {}, true);

  document.getElementById('start-schnellstart-knoepfe')
    .replaceChildren(wieZuletzt, neuesteLektion, alleSchwachen, wichtigsteWoerter);
}

export function initStartseite() {
  document.addEventListener('screen-gezeigt', e => {
    if (e.detail.id === 'start') renderSchnellstart();
  });
  renderSchnellstart();
}
