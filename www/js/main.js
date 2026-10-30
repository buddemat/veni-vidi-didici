import { initNavigation } from './screens.js';
import { initStore, getStore } from './store.js';
import { renderEinstellungen } from './einstellungen.js';
import { renderLektionsauswahl, initLektionsauswahl } from './lektionsauswahl.js';
import { initAbfrage } from './abfrage.js';
import { initEditor } from './editor.js';
import { initProfil } from './profil.js';
import { initStartseite } from './startseite.js';
import { APP_VERSION } from './version.js';

initNavigation();
document.getElementById('einstellungen-version').textContent = `Version ${APP_VERSION}`;

// Der eigentliche Wortschatz (assets/vokabeln.json) ist nicht im Repository.
// Fehlt er, startet die App mit dem kleinen Beispiel-Wortschatz.
async function ladeSeed() {
  try {
    const antwort = await fetch('assets/vokabeln.json');
    if (antwort.ok) return { seedJson: await antwort.json(), istBeispiel: false };
  } catch (e) {
    // fällt unten auf das Beispiel zurück
  }
  console.log('assets/vokabeln.json fehlt - verwende Beispiel-Wortschatz.');
  const beispiel = await fetch('assets/vokabeln.beispiel.json');
  return { seedJson: await beispiel.json(), istBeispiel: true };
}

async function starteApp() {
  const { seedJson, istBeispiel } = await ladeSeed();
  const store = initStore(seedJson, { wortschatzAbgleichen: !istBeispiel });

  const anzahlVokabeln = Object.keys(store.vokabeln).length;
  const anzahlLektionen = new Set(
    Object.values(store.vokabeln)
      .filter(v => v.lektion)
      .map(v => v.lektion)
  ).size;
  console.log(
    `Store geladen: ${anzahlVokabeln} Vokabeln in ${anzahlLektionen} Lektionen ` +
    `(Seed-Version ${store.seedVersion}).`
  );

  renderEinstellungen();
  renderLektionsauswahl();
  initAbfrage();
  initEditor();
  initLektionsauswahl();
  initProfil();
  initStartseite();
}

starteApp();
