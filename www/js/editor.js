import {
  getStore, persistStore, neuerFortschrittEintrag, loescheVokabelAusStore, exportiereWortschatz, importiereWortschatz,
  kannWortschatzZuruecksetzen, vorschauWortschatzZuruecksetzen, wortschatzZuruecksetzen,
} from './store.js';
import { zeigeScreen } from './screens.js';
import { feldDefinitionenFuer } from './einstellungen.js';
import { mitMikrofon } from './spracheingabe.js';
import { initExportKnopf, initImportKnopf } from './datenaustausch.js';

const WORTART_OPTIONEN = [
  { value: 'substantiv', label: 'Substantiv' },
  { value: 'verb', label: 'Verb' },
  { value: 'adjektiv', label: 'Adjektiv' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

// null = neue Vokabel anlegen, sonst ID der gerade bearbeiteten Vokabel.
let bearbeiteId = null;

function naechsteIdFuerLektion(lektionNr) {
  const praefix = `L${String(lektionNr).padStart(2, '0')}-`;
  const vorhandene = Object.keys(getStore().vokabeln).filter(id => id.startsWith(praefix));
  const maxSeq = vorhandene.reduce((max, id) => {
    const seq = Number(id.slice(praefix.length));
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `${praefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

function loescheVokabel(vokabel) {
  if (!confirm(`"${vokabel.lemma}" wirklich löschen?`)) return false;
  loescheVokabelAusStore(vokabel.id);
  return true;
}

// --- Vokabelliste ---

function gruppiereAlleVokabeln() {
  const lektionen = {};
  const inseln = {};
  for (const vokabel of Object.values(getStore().vokabeln)) {
    if (vokabel.lektion) {
      (lektionen[vokabel.lektion] ??= []).push(vokabel);
    } else if (vokabel.insel) {
      (inseln[vokabel.insel] ??= []).push(vokabel);
    }
  }
  for (const liste of Object.values(lektionen)) liste.sort((a, b) => a.id.localeCompare(b.id));
  for (const liste of Object.values(inseln)) liste.sort((a, b) => a.id.localeCompare(b.id));
  return { lektionen, inseln };
}

// Icons im Stil des Zurück-Pfeils (Strich-SVG in Schriftfarbe).
const ICON_STIFT = '<path d="M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4" fill="none" stroke="currentColor" '
  + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
const ICON_PAPIERKORB = '<path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" fill="none" '
  + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

// Kompakter Knopf nur mit Icon; die Beschriftung steht als Tooltip und für
// Screenreader im aria-label.
function iconKnopf(svgInhalt, beschriftung) {
  const button = document.createElement('button');
  button.className = 'icon-knopf';
  button.title = beschriftung;
  button.setAttribute('aria-label', beschriftung);
  button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${svgInhalt}</svg>`;
  return button;
}

function vokabelZeile(vokabel, bearbeitbar) {
  const zeile = document.createElement('div');
  zeile.className = 'vokabel-zeile';

  const text = document.createElement('span');
  text.className = 'vokabel-zeile-text';
  const wortart = document.createElement('span');
  wortart.className = 'vokabel-zeile-wortart';
  wortart.textContent = ` (${vokabel.wortart})`;
  text.append(vokabel.lemma, wortart, vokabel.bearbeitet ? ' ✎' : '');
  zeile.appendChild(text);

  if (bearbeitbar) {
    const bearbeitenButton = iconKnopf(ICON_STIFT, `${vokabel.lemma} bearbeiten`);
    bearbeitenButton.addEventListener('click', () => {
      bearbeiteId = vokabel.id;
      renderEditor();
      zeigeScreen('editor');
    });

    const loeschenButton = iconKnopf(ICON_PAPIERKORB, `${vokabel.lemma} löschen`);
    loeschenButton.classList.add('loeschen');
    loeschenButton.addEventListener('click', () => {
      if (loescheVokabel(vokabel)) renderVokabelliste();
    });

    zeile.append(bearbeitenButton, loeschenButton);
  }

  return zeile;
}

export function renderVokabelliste() {
  const { lektionen, inseln } = gruppiereAlleVokabeln();
  const container = document.getElementById('vokabelliste-inhalt');
  container.innerHTML = '';

  const lektionsNummern = Object.keys(lektionen).map(Number).sort((a, b) => a - b);
  for (const nr of lektionsNummern) {
    const karte = document.createElement('div');
    karte.className = 'karte';
    const titel = document.createElement('h3');
    titel.textContent = `Lektion ${nr} (${lektionen[nr].length} Vokabeln)`;
    karte.appendChild(titel);
    for (const vokabel of lektionen[nr]) karte.appendChild(vokabelZeile(vokabel, true));
    container.appendChild(karte);
  }

  const inselNummern = Object.keys(inseln).map(Number).sort((a, b) => a - b);
  for (const nr of inselNummern) {
    const karte = document.createElement('div');
    karte.className = 'karte';
    const titel = document.createElement('h3');
    titel.textContent = `Inselwortschatz zu Lektion ${nr} (${inseln[nr].length} Vokabeln, nicht bearbeitbar)`;
    karte.appendChild(titel);
    for (const vokabel of inseln[nr]) karte.appendChild(vokabelZeile(vokabel, false));
    container.appendChild(karte);
  }

  if (lektionsNummern.length === 0 && inselNummern.length === 0) {
    const hinweis = document.createElement('p');
    hinweis.className = 'hinweis';
    hinweis.textContent = 'Noch keine Vokabeln vorhanden.';
    container.appendChild(hinweis);
  }
}

// --- Editor ---

// Baut eine Liste von Text-Eingabefeldern mit "+"/"×"-Buttons zum
// Hinzufügen/Entfernen einzelner Bedeutungen. Gibt eine Funktion zurück, die
// die aktuellen (nicht-leeren) Werte ausliest.
function bedeutungsFeld(containerEl, anfangsWerte) {
  const zeilenContainer = document.createElement('div');
  containerEl.appendChild(zeilenContainer);
  const eingaben = [];

  function zeileHinzufuegen(wert = '') {
    const zeile = document.createElement('div');
    zeile.className = 'bedeutung-zeile';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = wert;

    const entfernenButton = document.createElement('button');
    entfernenButton.type = 'button';
    entfernenButton.className = 'bedeutung-entfernen';
    entfernenButton.textContent = '×';
    entfernenButton.addEventListener('click', () => {
      zeile.remove();
      const index = eingaben.indexOf(input);
      if (index !== -1) eingaben.splice(index, 1);
    });

    zeile.append(input, entfernenButton);
    zeilenContainer.appendChild(zeile);
    mitMikrofon(input);
    eingaben.push(input);
  }

  for (const wert of anfangsWerte.length ? anfangsWerte : ['']) zeileHinzufuegen(wert);

  const hinzufuegenButton = document.createElement('button');
  hinzufuegenButton.type = 'button';
  hinzufuegenButton.textContent = '+ Bedeutung hinzufügen';
  hinzufuegenButton.addEventListener('click', () => zeileHinzufuegen());
  containerEl.appendChild(hinzufuegenButton);

  return () => eingaben.map(i => i.value.trim()).filter(Boolean);
}

// Genus als Checkbox-Gruppe statt Freitext: verhindert Tippfehler/beliebigen
// Text und deckt Wörter mit mehreren Genera ab (z.B. "servus/serva" -> "m/f",
// mehrere Haken -> mit "/" verbunden). Das zurückgegebene Objekt hat eine
// `value`-Eigenschaft, damit es sich wie die echten Text-Eingaben verhält.
const GENUS_OPTIONEN = [
  { key: 'm', label: 'Maskulinum (m)' },
  { key: 'f', label: 'Femininum (f)' },
  { key: 'n', label: 'Neutrum (n)' },
];

function genusFeld(containerEl, vorhandenerWert) {
  const ausgewaehlt = new Set((vorhandenerWert || '').split('/').filter(Boolean));
  const checkboxen = {};

  for (const option of GENUS_OPTIONEN) {
    const zeile = document.createElement('label');
    zeile.className = 'einstellungen-zeile';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = ausgewaehlt.has(option.key);
    const text = document.createElement('span');
    text.textContent = option.label;
    zeile.append(checkbox, text);
    containerEl.appendChild(zeile);
    checkboxen[option.key] = checkbox;
  }

  return {
    get value() {
      return GENUS_OPTIONEN.filter(o => checkboxen[o.key].checked).map(o => o.key).join('/');
    },
  };
}

// Baut die Formfeld-Eingaben für die gewählte Wortart neu auf (alle Felder,
// nicht nur die aktuell abgefragten) und gibt die Eingabeelemente zurück.
function formFelderNeuAufbauen(containerEl, wortart, formenWerte) {
  containerEl.innerHTML = '';
  const eingaben = {};
  for (const feld of feldDefinitionenFuer(wortart)) {
    if (feld.key === 'genus') {
      const label = document.createElement('label');
      label.textContent = feld.label;
      containerEl.appendChild(label);
      eingaben.genus = genusFeld(containerEl, formenWerte.genus);
      continue;
    }
    const label = document.createElement('label');
    label.textContent = feld.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = formenWerte[feld.key] || '';
    containerEl.append(label, input);
    mitMikrofon(input);
    eingaben[feld.key] = input;
  }
  return eingaben;
}

export function renderEditor() {
  const vokabel = bearbeiteId ? getStore().vokabeln[bearbeiteId] : null;
  const container = document.getElementById('editor-inhalt');
  container.innerHTML = '';

  const titel = document.createElement('h3');
  titel.textContent = vokabel ? `Vokabel bearbeiten: ${vokabel.lemma}` : 'Neue Vokabel anlegen';
  container.appendChild(titel);

  // --- Lektion ---
  const lektionKarte = document.createElement('div');
  lektionKarte.className = 'karte';
  const lektionLabel = document.createElement('label');
  lektionLabel.textContent = 'Lektion';
  const lektionInput = document.createElement('input');
  lektionInput.type = 'number';
  lektionInput.min = '1';
  lektionInput.step = '1';
  lektionInput.inputMode = 'numeric';
  if (vokabel) {
    lektionInput.value = vokabel.lektion;
    lektionInput.disabled = true;
  }
  lektionKarte.append(lektionLabel, lektionInput);
  container.appendChild(lektionKarte);

  // --- Wortart + Lemma ---
  const grunddatenKarte = document.createElement('div');
  grunddatenKarte.className = 'karte';
  const wortartLabel = document.createElement('label');
  wortartLabel.textContent = 'Wortart';
  const wortartSelect = document.createElement('select');
  for (const option of WORTART_OPTIONEN) {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    wortartSelect.appendChild(optionEl);
  }
  wortartSelect.value = vokabel ? vokabel.wortart : 'substantiv';

  const lemmaLabel = document.createElement('label');
  lemmaLabel.textContent = 'Lemma (lateinisches Grundwort)';
  const lemmaInput = document.createElement('input');
  lemmaInput.type = 'text';
  lemmaInput.value = vokabel ? vokabel.lemma : '';

  grunddatenKarte.append(wortartLabel, wortartSelect, lemmaLabel, lemmaInput);
  mitMikrofon(lemmaInput);
  container.appendChild(grunddatenKarte);

  // --- Formfelder (abhängig von Wortart, reagiert auf Wortart-Wechsel) ---
  const formFelderKarte = document.createElement('div');
  formFelderKarte.className = 'karte';
  let formEingaben = formFelderNeuAufbauen(
    formFelderKarte, wortartSelect.value, vokabel ? vokabel.formen : {}
  );
  wortartSelect.addEventListener('change', () => {
    formEingaben = formFelderNeuAufbauen(formFelderKarte, wortartSelect.value, {});
  });
  container.appendChild(formFelderKarte);

  // --- Bedeutungen ---
  const mussKarte = document.createElement('div');
  mussKarte.className = 'karte';
  const mussTitel = document.createElement('h3');
  mussTitel.textContent = 'Bedeutungen (MUSS - Pflicht für richtige Antwort)';
  mussKarte.appendChild(mussTitel);
  const mussWerte = vokabel ? vokabel.bedeutungen.filter(b => b.typ === 'muss').map(b => b.text) : [];
  const getMussBedeutungen = bedeutungsFeld(mussKarte, mussWerte);
  container.appendChild(mussKarte);

  const kannKarte = document.createElement('div');
  kannKarte.className = 'karte';
  const kannTitel = document.createElement('h3');
  kannTitel.textContent = 'Bedeutungen (KANN - zusätzlich, nicht Pflicht)';
  kannKarte.appendChild(kannTitel);
  const kannWerte = vokabel ? vokabel.bedeutungen.filter(b => b.typ === 'kann').map(b => b.text) : [];
  const getKannBedeutungen = bedeutungsFeld(kannKarte, kannWerte);
  container.appendChild(kannKarte);

  // --- Hinweis ---
  const hinweisKarte = document.createElement('div');
  hinweisKarte.className = 'karte';
  const hinweisLabel = document.createElement('label');
  hinweisLabel.textContent = 'Hinweis (optional, wird mit der Lösung angezeigt)';
  const hinweisInput = document.createElement('input');
  hinweisInput.type = 'text';
  hinweisInput.value = vokabel?.hinweis || '';
  hinweisKarte.append(hinweisLabel, hinweisInput);
  mitMikrofon(hinweisInput);
  // Interner Vermerk zur Datenherkunft (z.B. "Genitiv ergänzt") - wird in
  // der Abfrage nicht angezeigt, soll beim Speichern aber erhalten bleiben.
  const herkunftLabel = document.createElement('label');
  herkunftLabel.textContent = 'Herkunft der Daten (intern, wird in der Abfrage nicht angezeigt)';
  const herkunftInput = document.createElement('input');
  herkunftInput.type = 'text';
  herkunftInput.value = vokabel?.herkunft || '';
  hinweisKarte.append(herkunftLabel, herkunftInput);
  container.appendChild(hinweisKarte);

  // --- Speichern ---
  const speichernButton = document.createElement('button');
  speichernButton.className = 'primaer';
  speichernButton.textContent = 'Speichern';
  speichernButton.addEventListener('click', () => {
    const lektionNr = Number(lektionInput.value);
    const lemma = lemmaInput.value.trim();
    const mussBedeutungen = getMussBedeutungen();

    if (!vokabel && (!Number.isInteger(lektionNr) || lektionNr < 1)) {
      alert('Bitte eine gültige Lektion angeben (ganze Zahl, mindestens 1).');
      return;
    }
    if (!lemma) {
      alert('Bitte ein Lemma eingeben.');
      return;
    }
    if (mussBedeutungen.length === 0) {
      alert('Bitte mindestens eine MUSS-Bedeutung eingeben.');
      return;
    }
    if (wortartSelect.value === 'substantiv') {
      const ohneArtikel = mussBedeutungen.find(text => !/^(der|die|das)\s/i.test(text));
      if (ohneArtikel && !confirm(
        `Die Bedeutung "${ohneArtikel}" beginnt nicht mit "der"/"die"/"das". ` +
        'Bei Substantiven gehört der Artikel normalerweise mit dazu (auch bei ' +
        'Wörtern, die nur im Plural vorkommen, z.B. "die Ferien"). Trotzdem so speichern?'
      )) {
        return;
      }
    }

    const formen = {};
    for (const [feldKey, input] of Object.entries(formEingaben)) {
      const wert = input.value.trim();
      if (wert) formen[feldKey] = wert;
    }

    const bedeutungen = [
      ...mussBedeutungen.map(text => ({ text, typ: 'muss' })),
      ...getKannBedeutungen().map(text => ({ text, typ: 'kann' })),
    ];

    const id = vokabel ? vokabel.id : naechsteIdFuerLektion(lektionNr);
    const neueVokabel = {
      id,
      wortart: wortartSelect.value,
      lemma,
      formen,
      bedeutungen,
      lektion: vokabel ? vokabel.lektion : lektionNr,
      // Markiert Vokabeln, die über den Editor angelegt/verändert wurden -
      // fehlt bei unangetasteten Seed-Vokabeln. Damit lässt sich später
      // (Schritt 13) erkennen/exportieren, was gegenüber dem ursprünglich
      // importierten Wortschatz verändert wurde.
      bearbeitet: true,
    };
    const hinweisWert = hinweisInput.value.trim();
    if (hinweisWert) neueVokabel.hinweis = hinweisWert;
    const herkunftWert = herkunftInput.value.trim();
    if (herkunftWert) neueVokabel.herkunft = herkunftWert;

    const store = getStore();
    store.vokabeln[id] = neueVokabel;
    if (!store.fortschritt[id]) store.fortschritt[id] = neuerFortschrittEintrag();
    persistStore();

    console.log(`Vokabel gespeichert: ${id}`, neueVokabel);

    renderVokabelliste();
    zeigeScreen('vokabelliste');
  });
  container.appendChild(speichernButton);

  // --- Löschen (nur beim Bearbeiten) ---
  if (vokabel) {
    const loeschenButton = document.createElement('button');
    loeschenButton.textContent = 'Vokabel löschen';
    loeschenButton.addEventListener('click', () => {
      if (!loescheVokabel(vokabel)) return;
      renderVokabelliste();
      zeigeScreen('vokabelliste');
    });
    container.appendChild(loeschenButton);
  }
}

export function initEditor() {
  document.getElementById('einstellungen-vokabelliste-button').addEventListener('click', () => {
    renderVokabelliste();
    zeigeScreen('vokabelliste');
  });
  document.getElementById('vokabelliste-neu-button').addEventListener('click', () => {
    bearbeiteId = null;
    renderEditor();
    zeigeScreen('editor');
  });

  initExportKnopf('wortschatz-export-button', () => ({
    dateiname: `wortschatz-${new Date().toISOString().slice(0, 10)}.json`,
    daten: exportiereWortschatz(),
  }));
  initImportKnopf('wortschatz-import-button', 'wortschatz-import-datei', json => {
    const anzahl = importiereWortschatz(json);
    alert(anzahl > 0 ? `${anzahl} neue Vokabel(n) importiert.` : 'Keine neuen Vokabeln (alles schon vorhanden).');
    renderVokabelliste();
  });

  const zuruecksetzenButton = document.getElementById('wortschatz-zuruecksetzen-button');
  zuruecksetzenButton.hidden = !kannWortschatzZuruecksetzen();
  zuruecksetzenButton.addEventListener('click', () => {
    if (fragWortschatzZuruecksetzen()) renderVokabelliste();
  });
}

// Rückfrage mit dem, was sich konkret ändern würde - bei nichts zu tun nur
// ein Hinweis.
function fragWortschatzZuruecksetzen() {
  const { zurueckgesetzt, entfernt, wiederhergestellt } = vorschauWortschatzZuruecksetzen();
  if (zurueckgesetzt + entfernt + wiederhergestellt === 0) {
    alert('Der Wortschatz entspricht schon dem Stand der App.');
    return false;
  }
  const zeilen = [];
  if (zurueckgesetzt) zeilen.push(`- ${zurueckgesetzt} bearbeitete Vokabel(n) bekommen wieder die Fassung der App`);
  if (entfernt) zeilen.push(`- ${entfernt} selbst angelegte Vokabel(n) werden gelöscht`);
  if (wiederhergestellt) zeilen.push(`- ${wiederhergestellt} gelöschte Vokabel(n) kommen zurück`);
  const tipp = entfernt
    ? '\n\nTipp: Vorher "Wortschatz exportieren" - selbst angelegte Vokabeln lassen sich dann wieder importieren.'
    : '';
  const frage = `Wortschatz auf den Stand der App zurücksetzen?\n\n${zeilen.join('\n')}\n\n`
    + `Der Lernstand der übrigen Vokabeln bleibt erhalten.${tipp}`;
  if (!confirm(frage)) return false;
  wortschatzZuruecksetzen();
  return true;
}
