// Screen "Vokabel nachschlagen": lateinisches Wort eingeben, alle passenden
// Vokabeln mit sämtlichen Angaben anzeigen. Suchlogik in suche.js.

import { getStore } from './store.js';
import { feldDefinitionenFuer, abfrageLabel } from './einstellungen.js';
import { eingabeFokussieren } from './spracheingabe.js';
import { hatAudio, spieleAudio, stoppeAudio } from './audio.js';
import { sucheVokabeln } from './suche.js';

const WORTART_TEXT = { substantiv: 'Substantiv', verb: 'Verb', adjektiv: 'Adjektiv', sonstiges: 'Sonstiges' };
const GENUS_TEXT = { m: 'Maskulinum', f: 'Femininum', n: 'Neutrum' };

function genusText(genus) {
  return genus.split('/').map(g => GENUS_TEXT[g] || g).join(' oder ');
}

function element(tag, klasse, text) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (text !== undefined) el.textContent = text;
  return el;
}

function feldName(wortart, feld) {
  return feld === 'lemma' ? 'Grundform' : abfrageLabel(wortart, feld);
}

// Formen in der Reihenfolge der Feld-Definitionen, unbekannte Felder danach.
function formZeilen(vokabel) {
  const formen = vokabel.formen || {};
  const bekannte = feldDefinitionenFuer(vokabel.wortart).map(f => f.key);
  const reihenfolge = [...bekannte.filter(k => k in formen), ...Object.keys(formen).filter(k => !bekannte.includes(k))];
  return reihenfolge
    .filter(k => formen[k])
    .map(k => [abfrageLabel(vokabel.wortart, k), k === 'genus' ? genusText(formen[k]) : formen[k]]);
}

function ergebnisKarte({ vokabel, felder }) {
  const karte = element('div', 'karte nachschlagen-treffer');

  const kopf = element('div', 'nachschlagen-lemma', vokabel.lemma);
  if (hatAudio(vokabel)) {
    const knopf = element('button', 'lautsprecher-knopf', '🔊');
    knopf.type = 'button';
    knopf.setAttribute('aria-label', 'Aussprache anhören');
    knopf.addEventListener('click', () => spieleAudio(vokabel));
    kopf.appendChild(knopf);
    kopf.classList.add('mit-audio');
  }
  karte.appendChild(kopf);

  const herkunft = [WORTART_TEXT[vokabel.wortart] || vokabel.wortart];
  if (vokabel.lektion) herkunft.push(`Lektion ${vokabel.lektion}${vokabel.fakultativ ? ' (Inselwortschatz)' : ''}`);
  if (vokabel.wichtig) herkunft.push('wichtiges Wort');
  karte.appendChild(element('p', 'hinweis', herkunft.join(' · ')));

  if (!felder.includes('lemma')) {
    karte.appendChild(element('p', 'hinweis', `Gefunden als: ${felder.map(f => feldName(vokabel.wortart, f)).join(', ')}`));
  }

  const tabelle = element('dl', 'nachschlagen-angaben');
  const zeile = (name, wert) => {
    tabelle.append(element('dt', null, name));
    const dd = element('dd');
    if (typeof wert === 'string') dd.textContent = wert;
    else dd.append(...wert);
    tabelle.append(dd);
  };
  for (const [name, wert] of formZeilen(vokabel)) zeile(name, wert);

  // MUSS fett, KANN normal - wie in der Lösung bei der Abfrage.
  const bedeutungen = [];
  vokabel.bedeutungen.forEach((b, i) => {
    if (i > 0) bedeutungen.push(', ');
    bedeutungen.push(b.typ === 'muss' ? element('strong', null, b.text) : b.text);
  });
  zeile('Bedeutung', bedeutungen);
  if (vokabel.hinweis) zeile('Hinweis', vokabel.hinweis);
  karte.appendChild(tabelle);

  if (vokabel.herkunft) karte.appendChild(element('p', 'hinweis', `Herkunft der Daten: ${vokabel.herkunft}`));
  karte.appendChild(element('p', 'hinweis nachschlagen-id', vokabel.id));
  return karte;
}

function suche() {
  stoppeAudio();
  const eingabe = document.getElementById('nachschlagen-eingabe').value;
  const container = document.getElementById('nachschlagen-ergebnis');
  if (!eingabe.trim()) {
    container.replaceChildren();
    return;
  }
  const treffer = sucheVokabeln(getStore().vokabeln, eingabe);
  if (treffer.length === 0) {
    container.replaceChildren(element('p', 'hinweis', `Keine Vokabel „${eingabe.trim()}“ gefunden.`));
    return;
  }
  const anzahl = treffer.length === 1 ? '1 Treffer' : `${treffer.length} Treffer`;
  container.replaceChildren(element('p', 'hinweis', anzahl), ...treffer.map(ergebnisKarte));
}

export function initNachschlagen() {
  const eingabe = document.getElementById('nachschlagen-eingabe');
  document.getElementById('nachschlagen-formular').addEventListener('submit', e => {
    e.preventDefault();
    suche();
    // Tastatur auf dem Handy schließen, damit die Treffer sichtbar sind.
    eingabe.blur();
  });
  document.addEventListener('screen-gezeigt', e => {
    if (e.detail.id === 'nachschlagen') eingabeFokussieren(eingabe);
    else stoppeAudio();
  });
}
