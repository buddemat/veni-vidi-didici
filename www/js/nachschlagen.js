// Screen "Vokabel nachschlagen": lateinisches Wort eingeben, alle passenden
// Vokabeln mit sämtlichen Angaben anzeigen. Suchlogik in suche.js.

import { getStore } from './store.js';
import { feldDefinitionenFuer, abfrageLabel } from './einstellungen.js';
import { eingabeFokussieren } from './spracheingabe.js';
import { hatAudio, spieleAudio, stoppeAudio } from './audio.js';
import { sucheErweitert } from './suche.js';

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

// Längere Listen (Teilwort, Ähnlich, Platzhalter) werden gekürzt - wer so
// viele Treffer bekommt, sollte genauer suchen.
const MAX_ZEILEN = 30;

function bedeutungKurz(vokabel) {
  const muss = vokabel.bedeutungen.filter(b => b.typ === 'muss');
  return (muss.length > 0 ? muss : vokabel.bedeutungen).map(b => b.text).join(', ');
}

// Kompakte Zeile (Wort, Bedeutung, ggf. getroffene Form); Antippen klappt
// die vollständige Karte darunter auf bzw. wieder zu.
function trefferZeile(treffer) {
  const { vokabel, felder } = treffer;
  const wrapper = element('div', 'nachschlagen-zeile-wrapper');
  const zeile = element('div', 'nachschlagen-zeile');
  zeile.tabIndex = 0;
  zeile.setAttribute('role', 'button');
  zeile.setAttribute('aria-expanded', 'false');

  const text = element('span', 'nachschlagen-zeile-text');
  text.append(element('strong', null, vokabel.lemma));
  if (!felder.includes('lemma')) {
    text.append(element('span', 'hinweis', ` (${felder.map(f => `${feldName(vokabel.wortart, f)}: ${vokabel.formen[f]}`).join(', ')})`));
  }
  text.append(element('span', 'nachschlagen-zeile-bedeutung', bedeutungKurz(vokabel)));
  zeile.append(text, element('span', 'nachschlagen-zeile-pfeil', '›'));
  wrapper.appendChild(zeile);

  let karte = null;
  const umschalten = () => {
    if (karte) {
      karte.remove();
      karte = null;
    } else {
      karte = ergebnisKarte(treffer);
      wrapper.appendChild(karte);
    }
    zeile.classList.toggle('offen', !!karte);
    zeile.setAttribute('aria-expanded', String(!!karte));
  };
  zeile.addEventListener('click', umschalten);
  zeile.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      umschalten();
    }
  });
  return wrapper;
}

function trefferListe(titel, treffer) {
  const karte = element('div', 'karte nachschlagen-liste');
  karte.appendChild(element('h3', null, `${titel} (${treffer.length})`));
  for (const t of treffer.slice(0, MAX_ZEILEN)) karte.appendChild(trefferZeile(t));
  if (treffer.length > MAX_ZEILEN) {
    karte.appendChild(element('p', 'hinweis', `… und ${treffer.length - MAX_ZEILEN} weitere. Gib mehr Buchstaben ein, um die Liste einzugrenzen.`));
  }
  return karte;
}

function suche() {
  stoppeAudio();
  const eingabe = document.getElementById('nachschlagen-eingabe').value;
  const container = document.getElementById('nachschlagen-ergebnis');
  const text = eingabe.trim();
  if (!text) {
    container.replaceChildren();
    return;
  }
  const ergebnis = sucheErweitert(getStore().vokabeln, eingabe);
  const teile = [];

  if (ergebnis.platzhalter) {
    if (ergebnis.platzhalter.length > 0) teile.push(trefferListe(`Passend zu „${text}“`, ergebnis.platzhalter));
  } else {
    // Exakte Treffer gleich vollständig, alles andere als aufklappbare Liste.
    if (ergebnis.exakt.length > 0) {
      teile.push(element('p', 'hinweis', ergebnis.exakt.length === 1 ? '1 Treffer' : `${ergebnis.exakt.length} Treffer`));
      teile.push(...ergebnis.exakt.map(ergebnisKarte));
    }
    if (ergebnis.teilwort.length > 0) teile.push(trefferListe(`Beginnt mit / enthält „${text}“`, ergebnis.teilwort));
    if (ergebnis.aehnlich.length > 0) teile.push(trefferListe('Ähnliche Wörter', ergebnis.aehnlich));
  }

  if (teile.length === 0) teile.push(element('p', 'hinweis', `Keine Vokabel „${text}“ gefunden.`));
  container.replaceChildren(...teile);
}

export function initNachschlagen() {
  const eingabe = document.getElementById('nachschlagen-eingabe');
  // Suche schon beim Tippen; "Suchen"/Enter schließt zusätzlich die Tastatur.
  eingabe.addEventListener('input', suche);
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
