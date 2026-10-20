import { getStore, persistStore } from './store.js';

const FELD_DEFINITIONEN = {
  substantiv: [
    { key: 'genus', label: 'Genus (m/f/n)' },
    { key: 'genitiv_sg', label: 'Genitiv' },
    { key: 'genitiv_pl', label: 'Genitiv Plural (wo angegeben)' },
  ],
  verb: [
    { key: 'praesens_1sg', label: 'Präsens (1. Person Singular)' },
    { key: 'perfekt_1sg', label: 'Perfekt (1. Person Singular)' },
    { key: 'ppp', label: 'PPP / Supin' },
    { key: 'imperativ_sg', label: 'Imperativ Singular (wo angegeben)' },
  ],
  adjektiv: [
    { key: 'f', label: 'Femininum-Form' },
    { key: 'n', label: 'Neutrum-Form' },
    { key: 'genitiv', label: 'Genitiv (bei einendigen Adjektiven)' },
  ],
};

export function feldLabel(wortart, feldKey) {
  const eintrag = (FELD_DEFINITIONEN[wortart] || []).find(f => f.key === feldKey);
  return eintrag ? eintrag.label : feldKey;
}

// Kurzform für die Abfrage (Eingabehinweis, Rückfrage, Lösung): ohne die
// Klammer-Erläuterungen der Einstellungen, z.B. "Genitiv Plural" statt
// "Genitiv Plural (wo angegeben)".
export function abfrageLabel(wortart, feldKey) {
  return feldLabel(wortart, feldKey).replace(/\s*\([^)]*\)/g, '');
}

// Alle Formfelder einer Wortart (nicht nur die aktuell abgefragten) - wird
// im Editor (Schritt 9) gebraucht, der immer alle Felder zeigt.
export function feldDefinitionenFuer(wortart) {
  return FELD_DEFINITIONEN[wortart] || [];
}

const WORTART_LABEL = {
  substantiv: 'Substantive',
  verb: 'Verben',
  adjektiv: 'Adjektive',
};

function checkboxZeile(wortart, feld) {
  const abfrageFelder = getStore().einstellungen.abfrage_felder;
  const id = `feld-${wortart}-${feld.key}`;

  const zeile = document.createElement('label');
  zeile.className = 'einstellungen-zeile';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.checked = abfrageFelder[wortart].includes(feld.key);
  checkbox.addEventListener('change', () => {
    aendereFeld(wortart, feld.key, checkbox.checked);
  });

  const text = document.createElement('span');
  text.textContent = feld.label;

  zeile.appendChild(checkbox);
  zeile.appendChild(text);
  return zeile;
}

function aendereFeld(wortart, feldKey, aktiv) {
  const abfrageFelder = getStore().einstellungen.abfrage_felder;
  const liste = abfrageFelder[wortart];
  const enthalten = liste.includes(feldKey);

  if (aktiv && !enthalten) liste.push(feldKey);
  if (!aktiv && enthalten) abfrageFelder[wortart] = liste.filter(k => k !== feldKey);

  persistStore();
}

// Allgemeiner Ein/Aus-Schalter für ein einzelnes Feld in einstellungen
// (eine Checkbox-Zeile).
function einstellungsSchalter(schluessel, beschriftung) {
  const einstellungen = getStore().einstellungen;

  const zeile = document.createElement('label');
  zeile.className = 'einstellungen-zeile';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!einstellungen[schluessel];
  checkbox.addEventListener('change', () => {
    einstellungen[schluessel] = checkbox.checked;
    persistStore();
  });

  const text = document.createElement('span');
  text.textContent = beschriftung;

  zeile.append(checkbox, text);
  return zeile;
}

export function renderEinstellungen() {
  const container = document.getElementById('einstellungen-inhalt');
  container.innerHTML = '';

  const abfrageKarte = document.createElement('div');
  abfrageKarte.className = 'karte';
  const abfrageTitel = document.createElement('h3');
  abfrageTitel.textContent = 'Abfrage';
  abfrageKarte.append(
    abfrageTitel,
    einstellungsSchalter('rueckfragen_aktiv', 'Bei unvollständigen Antworten nachfragen'),
    einstellungsSchalter('tippfehlertoleranz_aktiv', 'Kleine Tippfehler tolerieren'),
  );
  container.appendChild(abfrageKarte);

  const formenTitel = document.createElement('h3');
  formenTitel.className = 'abschnitt-titel';
  formenTitel.textContent = 'Abgefragte Formen';
  const formenHinweis = document.createElement('p');
  formenHinweis.className = 'hinweis';
  formenHinweis.textContent = 'Welche Formen sollen bei der Abfrage verlangt werden?';
  container.append(formenTitel, formenHinweis);

  for (const [wortart, felder] of Object.entries(FELD_DEFINITIONEN)) {
    const gruppe = document.createElement('div');
    gruppe.className = 'karte';

    const titel = document.createElement('h3');
    titel.textContent = WORTART_LABEL[wortart];
    gruppe.appendChild(titel);

    for (const feld of felder) {
      gruppe.appendChild(checkboxZeile(wortart, feld));
    }

    container.appendChild(gruppe);
  }
}
