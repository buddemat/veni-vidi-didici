import { getStore, persistStore } from './store.js';
import { zeigeScreen } from './screens.js';
import { starteAbfrage } from './abfrage.js';
import { gruppiereNachLektion, bauePool } from './schnellstart.js';

// Vokabeln nach Lektion gruppiert, je Lektion sortiert nach ID (= Reihenfolge
// im Buch). Wird bei jedem Rendern neu aus dem Store aufgebaut, damit später
// im Editor (Schritt 9) hinzugefügte Vokabeln automatisch berücksichtigt werden.
let gruppenNachLektion = {};

// Zuletzt zusammengestellter Pool - wird von der Abfrage (Schritt 6) gelesen.
let aktuellerPool = [];
let aktuellerAbfrageModus = 'gleichverteilt';
let aktuellesRundenende = 'alle-einmal';

export function getAktuellenPool() {
  return aktuellerPool;
}

export function getAktuellenAbfrageModus() {
  return aktuellerAbfrageModus;
}

export function getAktuellesRundenende() {
  return aktuellesRundenende;
}

// Startet eine Runde mit fertigem Pool - gemeinsamer Einstieg für den
// "Abfrage starten"-Knopf und die Schnellstart-Knöpfe der Startseite.
export function starteRunde(pool, abfrageModus, rundenende) {
  aktuellerPool = pool;
  aktuellerAbfrageModus = abfrageModus;
  aktuellesRundenende = rundenende;
  console.log(
    `Vokabel-Pool zusammengestellt: ${pool.length} Vokabeln, Modus "${abfrageModus}".`,
    pool
  );
  zeigeScreen('abfrage');
  starteAbfrage();
}

function lektionsNummern() {
  return Object.keys(gruppenNachLektion).map(Number).sort((a, b) => a - b);
}

function radioZeile(name, value, labelText, checked) {
  const zeile = document.createElement('label');
  zeile.className = 'einstellungen-zeile';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = name;
  radio.value = value;
  radio.checked = !!checked;

  const text = document.createElement('span');
  text.textContent = labelText;

  zeile.appendChild(radio);
  zeile.appendChild(text);
  return { zeile, radio };
}

function lektionOptionenBefuellen(select) {
  select.innerHTML = '';
  for (const nr of lektionsNummern()) {
    const option = document.createElement('option');
    option.value = String(nr);
    option.textContent = `Lektion ${nr} (${gruppenNachLektion[nr].length} Vokabeln)`;
    select.appendChild(option);
  }
}

function bisOptionenBefuellen(select, lektionNr) {
  select.innerHTML = '';
  const liste = gruppenNachLektion[lektionNr] || [];
  liste.forEach((vokabel, index) => {
    const option = document.createElement('option');
    option.value = vokabel.id;
    option.textContent = `${index + 1}. ${vokabel.lemma}`;
    select.appendChild(option);
  });
}

export function renderLektionsauswahl() {
  gruppenNachLektion = gruppiereNachLektion(getStore().vokabeln);
  const container = document.getElementById('lektionsauswahl-inhalt');
  container.innerHTML = '';

  // --- Modus-Auswahl ---
  const modusKarte = document.createElement('div');
  modusKarte.className = 'karte';
  const modusTitel = document.createElement('h3');
  modusTitel.textContent = 'Was möchtest du abfragen?';
  modusKarte.appendChild(modusTitel);

  const { zeile: zeileEinzel, radio: radioEinzel } = radioZeile('modus', 'einzel', 'Eine Lektion', true);
  const { zeile: zeileMehrere, radio: radioMehrere } = radioZeile('modus', 'mehrere', 'Mehrere Lektionen');
  modusKarte.append(zeileEinzel, zeileMehrere);
  container.appendChild(modusKarte);

  // --- Unterbereich: eine Lektion ---
  const einzelKarte = document.createElement('div');
  einzelKarte.className = 'karte';
  const einzelLabel = document.createElement('label');
  einzelLabel.textContent = 'Lektion';
  const einzelSelect = document.createElement('select');
  lektionOptionenBefuellen(einzelSelect);
  einzelKarte.append(einzelLabel, einzelSelect);
  container.appendChild(einzelKarte);

  // --- Unterbereich: mehrere Lektionen ---
  const mehrereKarte = document.createElement('div');
  mehrereKarte.className = 'karte';
  mehrereKarte.hidden = true;
  const mehrereTitel = document.createElement('h3');
  mehrereTitel.textContent = 'Lektionen auswählen';
  mehrereKarte.appendChild(mehrereTitel);
  const mehrereListe = document.createElement('div');
  mehrereListe.className = 'checkbox-liste';
  const mehrereCheckboxen = [];
  for (const nr of lektionsNummern()) {
    const zeile = document.createElement('label');
    zeile.className = 'einstellungen-zeile';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(nr);
    const text = document.createElement('span');
    text.textContent = `Lektion ${nr} (${gruppenNachLektion[nr].length} Vokabeln)`;
    zeile.append(checkbox, text);
    checkbox.addEventListener('change', () => bisAuswahlAktualisieren());
    mehrereListe.appendChild(zeile);
    mehrereCheckboxen.push(checkbox);
  }
  mehrereKarte.appendChild(mehrereListe);
  container.appendChild(mehrereKarte);

  // Liefert die "letzte" (höchste) aktuell ausgewählte Lektionsnummer, oder
  // null, falls (im Modus "mehrere") noch keine Lektion angehakt ist.
  function letzteAusgewaehlteLektion() {
    if (radioEinzel.checked) return Number(einzelSelect.value);
    const ausgewaehlt = mehrereCheckboxen.filter(c => c.checked).map(c => Number(c.value));
    return ausgewaehlt.length ? Math.max(...ausgewaehlt) : null;
  }

  // --- Unterbereich: bis zu einer Stelle (gilt für die jeweils letzte Lektion) ---
  const bisKarte = document.createElement('div');
  bisKarte.className = 'karte';
  const bisCheckboxZeile = document.createElement('label');
  bisCheckboxZeile.className = 'einstellungen-zeile';
  const bisCheckbox = document.createElement('input');
  bisCheckbox.type = 'checkbox';
  const bisCheckboxText = document.createElement('span');
  bisCheckboxText.textContent = 'Nur bis zu einer Stelle abfragen';
  bisCheckboxZeile.append(bisCheckbox, bisCheckboxText);
  bisKarte.appendChild(bisCheckboxZeile);

  const bisAuswahlBereich = document.createElement('div');
  bisAuswahlBereich.hidden = true;
  const bisLabel = document.createElement('label');
  bisLabel.textContent = 'Bis zu welchem Wort?';
  const bisSelect = document.createElement('select');
  bisAuswahlBereich.append(bisLabel, bisSelect);
  bisKarte.appendChild(bisAuswahlBereich);
  container.appendChild(bisKarte);

  function bisAuswahlAktualisieren() {
    const letzteLektion = letzteAusgewaehlteLektion();
    bisOptionenBefuellen(bisSelect, letzteLektion);
  }
  bisCheckbox.addEventListener('change', () => {
    bisAuswahlBereich.hidden = !bisCheckbox.checked;
    if (bisCheckbox.checked) bisAuswahlAktualisieren();
  });
  einzelSelect.addEventListener('change', () => {
    if (bisCheckbox.checked) bisAuswahlAktualisieren();
  });

  function modusAktualisieren() {
    einzelKarte.hidden = !radioEinzel.checked;
    mehrereKarte.hidden = !radioMehrere.checked;
    if (bisCheckbox.checked) bisAuswahlAktualisieren();
  }
  radioEinzel.addEventListener('change', modusAktualisieren);
  radioMehrere.addEventListener('change', modusAktualisieren);

  // --- Abfragemodus ---
  const abfrageModusKarte = document.createElement('div');
  abfrageModusKarte.className = 'karte';
  const abfrageModusTitel = document.createElement('h3');
  abfrageModusTitel.textContent = 'Wie sollen die Vokabeln drankommen?';
  abfrageModusKarte.appendChild(abfrageModusTitel);
  const { zeile: zeileGleich, radio: radioGleich } = radioZeile('abfragemodus', 'gleichverteilt', 'Gleichverteilt', true);
  const { zeile: zeileGewichtet, radio: radioGewichtet } = radioZeile(
    'abfragemodus', 'gewichtet', 'Gewichtet (schwache Vokabeln öfter)'
  );
  abfrageModusKarte.append(zeileGleich, zeileGewichtet);
  container.appendChild(abfrageModusKarte);

  // --- Rundenende ---
  const rundenendeKarte = document.createElement('div');
  rundenendeKarte.className = 'karte';
  const rundenendeTitel = document.createElement('h3');
  rundenendeTitel.textContent = 'Wann soll die Abfrage enden?';
  rundenendeKarte.appendChild(rundenendeTitel);
  const { zeile: zeileAlleEinmal, radio: radioAlleEinmal } = radioZeile(
    'rundenende', 'alle-einmal', 'Wenn jede Vokabel mindestens einmal dran war', true
  );
  const { zeile: zeileAlleRichtig, radio: radioAlleRichtig } = radioZeile(
    'rundenende', 'alle-richtig', 'Wenn jede Vokabel mindestens einmal richtig war'
  );
  const { zeile: zeileManuell, radio: radioManuell } = radioZeile(
    'rundenende', 'manuell', 'Immer weiter, bis ich selbst beende'
  );
  rundenendeKarte.append(zeileAlleEinmal, zeileAlleRichtig, zeileManuell);
  container.appendChild(rundenendeKarte);

  // --- Start-Button ---
  const startButton = document.createElement('button');
  startButton.className = 'primaer';
  startButton.textContent = 'Abfrage starten';
  startButton.addEventListener('click', () => {
    const lektionen = radioEinzel.checked
      ? [Number(einzelSelect.value)]
      : mehrereCheckboxen.filter(c => c.checked).map(c => Number(c.value));
    if (lektionen.length === 0) {
      alert('Bitte mindestens eine Lektion auswählen.');
      return;
    }

    // Für "Wie zuletzt" auf der Startseite und zum Vorbelegen dieses
    // Screens beim nächsten Mal (nur hier, nicht bei den Schnellstarts).
    const auswahl = {
      modus: radioEinzel.checked ? 'einzel' : 'mehrere',
      lektionen,
      bisId: bisCheckbox.checked ? bisSelect.value : null,
      abfrageModus: radioGewichtet.checked ? 'gewichtet' : 'gleichverteilt',
      rundenende: radioAlleRichtig.checked ? 'alle-richtig' : radioManuell.checked ? 'manuell' : 'alle-einmal',
    };
    getStore().profil.letzteAbfrage = auswahl;
    persistStore();

    starteRunde(bauePool(gruppenNachLektion, auswahl), auswahl.abfrageModus, auswahl.rundenende);
  });
  container.appendChild(startButton);

  // --- Mit der zuletzt gestarteten Auswahl vorbelegen ---
  const letzte = getStore().profil.letzteAbfrage;
  if (letzte) {
    const vorhandene = letzte.lektionen.filter(nr => gruppenNachLektion[nr]);
    if (vorhandene.length > 0) {
      if (letzte.modus === 'mehrere') {
        radioMehrere.checked = true;
        for (const c of mehrereCheckboxen) c.checked = vorhandene.includes(Number(c.value));
      } else {
        einzelSelect.value = String(vorhandene[0]);
      }
      modusAktualisieren();
      if (letzte.bisId) {
        bisCheckbox.checked = true;
        bisAuswahlBereich.hidden = false;
        bisAuswahlAktualisieren();
        if ([...bisSelect.options].some(o => o.value === letzte.bisId)) bisSelect.value = letzte.bisId;
      }
    }
    radioGewichtet.checked = letzte.abfrageModus === 'gewichtet';
    radioGleich.checked = !radioGewichtet.checked;
    radioAlleRichtig.checked = letzte.rundenende === 'alle-richtig';
    radioManuell.checked = letzte.rundenende === 'manuell';
    radioAlleEinmal.checked = !radioAlleRichtig.checked && !radioManuell.checked;
  }
}

export function initLektionsauswahl() {
  document.getElementById('start-lektionsauswahl-button').addEventListener('click', () => {
    renderLektionsauswahl();
    zeigeScreen('lektionsauswahl');
  });
}
