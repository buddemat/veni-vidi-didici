import { getStore, aktualisiereFortschritt, stelleFortschrittWiederHer } from './store.js';
import { getAktuellenPool, getAktuellenAbfrageModus, getAktuellesRundenende } from './lektionsauswahl.js';
import { zeigeScreen } from './screens.js';
import { abfrageLabel, rueckfrageLabel } from './einstellungen.js';
import { pruefeAntwort, normalisiere, aktiveAbfrageFelder } from './pruefung.js';
import { mitMikrofon } from './spracheingabe.js';
import { baueStapel, wiederEinreihen } from './ziehung.js';

const GENUS_TEXT = { m: 'Maskulinum (m)', f: 'Femininum (f)', n: 'Neutrum (n)' };

// Für den gleichverteilten Modus: Warteschlange, die per Zufall gemischt und
// leergezogen wird; ist sie leer, wird der Pool neu gemischt nachgefüllt.
let warteschlange = [];

// Für den gewichteten Modus: Stapel, der von vorne abgearbeitet wird (siehe
// ziehung.js). Der erste Stapel einer Runde enthält jede Vokabel genau einmal.
let gewichteterStapel = [];
let ersterDurchgang = true;

// Nur zu Testzwecken (Konsole): wie oft wurde jede Vokabel bisher gezogen,
// um die Verteilung der beiden Modi beobachten zu können.
let ziehungenProId = {};

let aktuelleVokabelId = null;

// Statistik der laufenden Abfragerunde, für den Ergebnis-Screen und die
// Rundenende-Erkennung. `richtigeIds` ist ein Set (nicht nur ein Zähler),
// weil für "alle mind. 1x richtig" nach DISTINKTEN Vokabeln gefragt wird.
function neueStatistik() {
  return { richtig: 0, falsch: 0, fehler: [], richtigeIds: new Set() };
}
let statistik = neueStatistik();

function mischen(liste) {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

function ziehGleichverteilt(pool) {
  if (warteschlange.length === 0) {
    warteschlange = mischen(pool);
  }
  return warteschlange.pop();
}

function ziehGewichtet(pool) {
  if (gewichteterStapel.length === 0) {
    gewichteterStapel = baueStapel(pool, getStore().fortschritt, { ersterDurchgang, zuletztId: aktuelleVokabelId });
    ersterDurchgang = false;
  }
  return gewichteterStapel.shift();
}

function ziehNaechsteVokabelId() {
  const pool = getAktuellenPool();
  const modus = getAktuellenAbfrageModus();
  const id = modus === 'gewichtet' ? ziehGewichtet(pool) : ziehGleichverteilt(pool);
  ziehungenProId[id] = (ziehungenProId[id] || 0) + 1;
  return id;
}

// Felder mit einem so kleinen, festen Wertebereich, dass sie später (Schritt 7)
// auch ohne Komma-Trennung zuverlässig im Antworttext erkannt werden können
// (Abgleich gegen die paar möglichen Werte statt gegen ein Komma-Segment).
const KEINE_KOMMA_PFLICHT_FELDER = ['genus'];

// Was neben dem Lemma erwartet wird, als kurze Liste von Labels - verrät
// nicht die Lösung, hilft aber zu wissen, wie viele durch Komma getrennte
// Angaben gemacht werden sollen (wichtig, da es nur noch ein Eingabefeld
// gibt). Reihenfolge der Eingabe ist egal, wird erst in Schritt 7 geprüft.
function erwarteteAngaben(vokabel, abfrageFelder, mussBedeutungen) {
  const formLabels = abfrageFelder
    .filter(feldKey => !KEINE_KOMMA_PFLICHT_FELDER.includes(feldKey))
    .map(feldKey => abfrageLabel(vokabel.wortart, feldKey));
  const bedeutungsLabel = mussBedeutungen.length > 1
    ? `${mussBedeutungen.length} Bedeutungen`
    : 'Bedeutung';
  return [...formLabels, bedeutungsLabel];
}

// Vollständige Lösung (alle aktiven Formen + alle Bedeutungen inkl. KANN)
// für die Anzeige nach dem Prüfen.
function genusText(genus) {
  return genus.split('/').map(g => GENUS_TEXT[g] || g).join(' oder ');
}

// Vollständige Lösung als Absatz mit gemischtem Markup statt reinem Text:
// MUSS-Bedeutungen fett, KANN-Bedeutungen normal, und jede Form/Bedeutung
// grün (richtig erkannt) oder rot (fehlt/falsch) - zeigt direkt, an welcher
// Stelle der Fehler steckt, statt nur pauschal "falsch" zu sagen. Braucht
// keinen Rückgriff auf die getippte Antwort selbst (die steht ja noch im
// - jetzt deaktivierten - Eingabefeld).
function loesungsElement(vokabel, abfrageFelder, ergebnis) {
  const container = document.createElement('div');
  const p = document.createElement('p');
  p.className = 'hinweis';
  p.append(`Lösung: ${vokabel.lemma}`);

  let ersterTeil = true;
  const naechsterTrenner = () => {
    const trenner = ersterTeil ? ' — ' : ', ';
    ersterTeil = false;
    return trenner;
  };

  for (const feldKey of abfrageFelder) {
    const label = abfrageLabel(vokabel.wortart, feldKey);
    const soll = feldKey === 'genus' ? genusText(vokabel.formen.genus) : vokabel.formen[feldKey];
    const ok = feldKey === 'genus' ? ergebnis.genusErgebnis?.ok : ergebnis.formErgebnisse[feldKey]?.ok;
    p.append(`${naechsterTrenner()}${label}: `);
    const wert = document.createElement('span');
    wert.className = ok ? 'richtig' : 'falsch';
    wert.textContent = soll ?? '–';
    p.appendChild(wert);
  }

  let mussIndex = 0;
  let kannIndex = 0;
  vokabel.bedeutungen.forEach(b => {
    p.append(naechsterTrenner());
    const istMuss = b.typ === 'muss';
    const teil = document.createElement(istMuss ? 'strong' : 'span');
    teil.textContent = b.text;
    if (istMuss) {
      teil.className = ergebnis.bedeutungErgebnisse[mussIndex]?.ok ? 'richtig' : 'falsch';
      mussIndex++;
    } else {
      // KANN ist nie Pflicht - bei Nichtnennung bleibt es neutral (kein
      // 'falsch'), aber wenn genannt und erkannt, genauso grün wie MUSS.
      if (ergebnis.kannBedeutungErgebnisse[kannIndex]?.ok) teil.className = 'richtig';
      kannIndex++;
    }
    p.appendChild(teil);
  });

  container.appendChild(p);

  // Lern-Hinweis zur Vokabel (z.B. "Deponens", "Dat. nēminī") erst mit der
  // Lösung zeigen - vorher würde er womöglich etwas verraten.
  if (vokabel.hinweis) {
    const hinweis = document.createElement('p');
    hinweis.className = 'hinweis loesung-hinweis';
    hinweis.textContent = `Hinweis: ${vokabel.hinweis}`;
    container.appendChild(hinweis);
  }

  return container;
}

// "Als richtig werten": macht die Falsch-Wertung der aktuellen Karte
// vollständig rückgängig (Fortschritt, Rundenstatistik, erneutes Einreihen)
// und wertet sie stattdessen als richtig.
function alsRichtigWerten(falschWertung) {
  stelleFortschrittWiederHer(aktuelleVokabelId, falschWertung.fortschrittVorher);
  aktualisiereFortschritt(aktuelleVokabelId, true, rueckfrageZaehler);

  statistik.falsch--;
  statistik.fehler.pop();
  statistik.richtig++;
  statistik.richtigeIds.add(aktuelleVokabelId);

  if (falschWertung.einreihPosition >= 0) gewichteterStapel.splice(falschWertung.einreihPosition, 1);

  aktualisiereFortschrittsAnzeige();
}

function ergebnisAnzeigen(container, vokabel, abfrageFelder, ergebnis, falschWertung = null) {
  const ergebnisKarte = document.createElement('div');
  ergebnisKarte.className = 'karte';

  const status = document.createElement('p');
  status.className = ergebnis.richtig ? 'richtig' : 'falsch';
  status.textContent = ergebnis.richtig ? 'Richtig!' : 'Das ist leider nicht richtig.';
  ergebnisKarte.appendChild(status);

  if (ergebnis.unerwarteteSegmente.length > 0) {
    const hinweis = document.createElement('p');
    hinweis.className = 'falsch';
    hinweis.textContent =
      `Das passt nicht dazu: ${ergebnis.unerwarteteSegmente.join(', ')}`;
    ergebnisKarte.appendChild(hinweis);
  }

  ergebnisKarte.appendChild(loesungsElement(vokabel, abfrageFelder, ergebnis));

  container.appendChild(ergebnisKarte);

  const knoepfe = document.createElement('div');
  knoepfe.className = 'abfrage-knoepfe';

  const weiterButton = document.createElement('button');
  weiterButton.className = 'primaer';
  weiterButton.textContent = 'Weiter';
  weiterButton.addEventListener('click', naechsteKarte);

  if (falschWertung && getStore().einstellungen.als_richtig_werten_aktiv) {
    const richtigButton = document.createElement('button');
    richtigButton.textContent = 'Als richtig werten';
    richtigButton.addEventListener('click', () => {
      alsRichtigWerten(falschWertung);
      status.className = 'richtig';
      status.textContent = 'Als richtig gewertet.';
      richtigButton.remove();
      weiterButton.focus();
    });
    knoepfe.appendChild(richtigButton);
  }

  knoepfe.appendChild(weiterButton);
  container.appendChild(knoepfe);
  // Fokus auf "Weiter", damit Enter (Browser, Hardware-Tastatur) direkt zur
  // nächsten Vokabel führt - genauso wie Enter im Antwortfeld "Prüfen" auslöst.
  weiterButton.focus();
}

// Wie viele Rückfragen die aktuelle Karte schon gebraucht hat - wird bei
// jeder neuen Karte zurückgesetzt (siehe renderKarte) und am Ende an
// aktualisiereFortschritt()/die Gewichtung (Schritt 6) übergeben.
let rueckfrageZaehler = 0;

// Ermittelt, worüber (falls überhaupt) noch nachgefragt werden könnte:
// nur EINFACH FEHLENDE Angaben (erkannt: null) zählen - sobald irgendwo
// aktiv etwas Falsches genannt wurde (erkannt, aber nicht ok) oder es
// unerwartete Zusatzangaben gibt, wird nicht nachgefragt, sondern ganz
// normal als falsch gewertet (Rückfragen sind für Lücken, nicht für Fehler).
function ermittleFehlendeEintraege(vokabel, abfrageFelder, ergebnis) {
  if (ergebnis.unerwarteteSegmente.length > 0) return [];

  const eintraege = [];
  for (const feldKey of abfrageFelder.filter(f => f !== 'genus')) {
    const e = ergebnis.formErgebnisse[feldKey];
    if (!e) continue;
    if (!e.ok && e.erkannt !== null) return [];
    if (!e.ok) {
      const label = abfrageLabel(vokabel.wortart, feldKey);
      eintraege.push({ label, frage: `Und wie lautet ${rueckfrageLabel(vokabel.wortart, feldKey)}?` });
    }
  }

  // "Und was bedeutet es noch?" nur, wenn schon eine Bedeutung genannt (oder
  // weiter vorne in dieser Liste erfragt) wurde - sonst "Und was bedeutet es?".
  // Auch eine Bedeutung, der nur der Artikel fehlt, zählt als genannt.
  let bedeutungGenannt = [...ergebnis.bedeutungErgebnisse, ...ergebnis.kannBedeutungErgebnisse]
    .some(e => e.ok || e.fehltNurArtikel);

  for (const e of ergebnis.bedeutungErgebnisse) {
    if (!e.ok && e.erkannt !== null) return [];
    if (!e.ok) {
      // Zwei unterschiedliche Lücken, zwei unterschiedliche Fragen: Fehlt
      // die Bedeutung komplett, oder steckt nur der deutsche Artikel im Weg
      // (z.B. "Sonne" statt "die Sonne")? Wichtig, das nicht mit dem
      // lateinischen Genus zu vermischen (siehe unten).
      if (e.fehltNurArtikel) {
        // Für die Anzeige die korrekt geschriebene Nomen-Form aus der
        // erwarteten Bedeutung nehmen (e.soll ohne den führenden Artikel),
        // nicht das getippte Segment - sonst würde ein Tippfehler wie
        // "Sonde" statt "Sonne" in der Frage wiederholt statt korrigiert.
        const korrektesWort = e.soll.replace(/^(der|die|das)\s+/i, '');
        eintraege.push({
          label: `der deutsche Artikel zu "${korrektesWort}"`,
          frage: `Wie ist der deutsche Artikel zu "${korrektesWort}"?`,
          // Die Antwort muss direkt VOR das getippte Segment gesetzt werden
          // ("Esel" -> "der Esel"), nicht als eigenes neues Segment - sonst
          // würde z.B. "der" als Genus statt als Artikel interpretiert. Hier
          // bewusst das ROHE Segment (nicht korrektesWort), da genau dieser
          // Text im bisherigen Antworttext gesucht/ersetzt wird.
          segment: e.artikelKandidatSegment,
          // Für die "hat der Nutzer das Wort schon mitgeliefert?"-Prüfung in
          // kombiniereRohtext() - dort muss gegen die KORREKTE Schreibweise
          // verglichen werden, nicht gegen den Tippfehler, sonst würde z.B.
          // die Antwort "die Sonne" (korrekt) nicht als "enthält Sonne"
          // erkannt, weil sie den Tippfehler "Sonde" nicht enthält.
          korrektesWort,
        });
      } else if (bedeutungGenannt) {
        eintraege.push({ label: 'eine weitere Bedeutung', frage: 'Und was bedeutet es noch?' });
      } else {
        eintraege.push({ label: 'eine Bedeutung', frage: 'Und was bedeutet es?' });
      }
      bedeutungGenannt = true;
    }
  }

  // Genus erst NACH den Bedeutungen abfragen: eine unvollständige Bedeutung
  // wie "Sonne" (Artikel vergessen) soll über die Artikel-Rückfrage oben
  // vervollständigt werden, nicht über die Genus-Rückfrage - sonst würde
  // eine Antwort wie "die" fälschlich als (falsches) Genus statt als
  // fehlender Artikel interpretiert. Deutscher Artikel und lateinisches
  // Genus sind zwei unabhängige Angaben, deshalb auch zwei getrennte Fragen.
  if (ergebnis.genusErgebnis) {
    const e = ergebnis.genusErgebnis;
    if (!e.ok && e.erkannt !== null) return [];
    if (!e.ok) {
      eintraege.push({ label: 'das lateinische Genus', frage: 'Wie ist das lateinische Genus (m/f/n)?' });
    }
  }

  return eintraege;
}

function rueckfrageAnzeigen(vokabel, abfrageFelder, fehlendeListe, bisherigerRohtext, container) {
  // Vorschau nur beim allerersten Rückfrage-Schritt dieser Karte und nur,
  // wenn wirklich mehrere Dinge gleichzeitig fehlen - baut sich einfach aus
  // den ohnehin je Lücke vorhandenen Labels zusammen, keine Sonderfälle pro
  // Kombination nötig.
  if (rueckfrageZaehler === 0 && fehlendeListe.length > 1) {
    const vorschau = document.createElement('p');
    vorschau.className = 'rueckfrage';
    vorschau.textContent = `Es fehlen noch: ${fehlendeListe.map(e => e.label).join(', ')}.`;
    container.appendChild(vorschau);
  }
  rueckfrageZaehler++;

  const karte = document.createElement('div');
  karte.className = 'karte';

  const frage = document.createElement('p');
  frage.className = 'rueckfrage';
  frage.textContent = fehlendeListe[0].frage;
  karte.appendChild(frage);

  const eingabe = document.createElement('input');
  eingabe.type = 'text';
  eingabe.autocomplete = 'off';
  eingabe.autocapitalize = 'off';
  eingabe.autocorrect = 'off';
  karte.appendChild(eingabe);
  mitMikrofon(eingabe);

  container.appendChild(karte);

  const weiterButton = document.createElement('button');
  weiterButton.className = 'primaer';
  weiterButton.textContent = 'Weiter';
  weiterButton.addEventListener('click', () => (
    antwortPruefen(vokabel, abfrageFelder, eingabe, weiterButton, container, bisherigerRohtext, fehlendeListe[0])
  ));
  container.appendChild(weiterButton);

  eingabe.addEventListener('keydown', ev => {
    // preventDefault: sonst landet derselbe Tastendruck nach dem Prüfen
    // beim dann fokussierten "Weiter" und überspringt das Ergebnis.
    if (ev.key === 'Enter') {
      ev.preventDefault();
      weiterButton.click();
    }
  });
  eingabe.focus();
}

// Baut den kombinierten Antworttext für die (Neu-)Prüfung. Im Normalfall
// wird die neue Eingabe einfach als weiteres Komma-Segment angehängt. Bei
// der Artikel-Rückfrage (eintrag.segment gesetzt) wird die Antwort
// stattdessen DIREKT VOR das betroffene Segment gesetzt ("Esel" ->
// "der Esel"), statt als eigenes Segment - sonst würde z.B. "der" als Genus
// statt als Vervollständigung der Bedeutung interpretiert.
function kombiniereRohtext(eintrag, bisherigerRohtext, eigeneEingabe) {
  if (!eigeneEingabe) return bisherigerRohtext;
  if (eintrag?.segment) {
    const teile = bisherigerRohtext.split(',').map(t => t.trim());
    const index = teile.findIndex(t => t === eintrag.segment);
    if (index !== -1) {
      // Manche Kinder wiederholen beim Artikel gleich das ganze (korrekt
      // geschriebene) Wort ("die Sonne" statt nur "die") - dann nicht
      // nochmal anhängen. Wichtig: gegen die KORREKTE Schreibweise prüfen
      // (eintrag.korrektesWort), nicht gegen das ggf. falsch getippte
      // Segment - sonst würde "die Sonne" nicht als "enthält das Wort schon"
      // erkannt, wenn ursprünglich "Sonde" (Tippfehler) getippt wurde.
      const zuPruefendesWort = eintrag.korrektesWort || eintrag.segment;
      const enthaeltSchonDasWort = normalisiere(eigeneEingabe).includes(normalisiere(zuPruefendesWort));
      teile[index] = enthaeltSchonDasWort ? eigeneEingabe : `${eigeneEingabe} ${eintrag.segment}`;
      return teile.join(', ');
    }
  }
  return bisherigerRohtext ? `${bisherigerRohtext}, ${eigeneEingabe}` : eigeneEingabe;
}

function antwortPruefen(
  vokabel, abfrageFelder, eingabe, pruefenButton, container, bisherigerRohtext = '', beantworteterEintrag = null
) {
  const eigeneEingabe = eingabe.value.trim();
  const rohtext = kombiniereRohtext(beantworteterEintrag, bisherigerRohtext, eigeneEingabe);

  const tippfehlerErlaubt = !!getStore().einstellungen.tippfehlertoleranz_aktiv;
  const ergebnis = pruefeAntwort(vokabel, abfrageFelder, rohtext, tippfehlerErlaubt);

  eingabe.disabled = true;
  if (eingabe.mikrofonKnopf) eingabe.mikrofonKnopf.disabled = true;
  pruefenButton.hidden = true;

  // Eine komplett leere Eingabe (weder jetzt noch beim ursprünglichen
  // Prüfen etwas eingetragen) löst keine weitere Rückfrage aus - sonst
  // würde bei leerem Feld immer wieder dieselbe Lücke abgefragt, ohne dass
  // sich der Antworttext je ändert (Endlosschleife). Stattdessen zählt eine
  // leere Antwort direkt als falsch.
  const rueckfragenAktiv = !!getStore().einstellungen.rueckfragen_aktiv;
  if (!ergebnis.richtig && rueckfragenAktiv && eigeneEingabe !== '') {
    const fehlend = ermittleFehlendeEintraege(vokabel, abfrageFelder, ergebnis);
    if (fehlend.length > 0) {
      rueckfrageAnzeigen(vokabel, abfrageFelder, fehlend, rohtext, container);
      return;
    }
  }

  // Stand vor der Wertung merken, damit "Als richtig werten" eine
  // Falsch-Wertung spurlos rückgängig machen kann.
  const fortschrittVorher = getStore().fortschritt[aktuelleVokabelId];
  const falschWertung = ergebnis.richtig ? null : {
    fortschrittVorher: fortschrittVorher && { ...fortschrittVorher },
    einreihPosition: -1,
  };
  aktualisiereFortschritt(aktuelleVokabelId, ergebnis.richtig, rueckfrageZaehler);

  if (ergebnis.richtig) {
    statistik.richtig++;
    statistik.richtigeIds.add(aktuelleVokabelId);
  } else {
    statistik.falsch++;
    statistik.fehler.push({ vokabel, abfrageFelder, ergebnis });
    // Falsch beantwortet: im gewichteten Modus ein paar Karten später nochmal.
    if (getAktuellenAbfrageModus() === 'gewichtet') {
      falschWertung.einreihPosition = wiederEinreihen(gewichteterStapel, aktuelleVokabelId);
    }
  }

  console.log(`Antwort zu "${vokabel.lemma}":`, rohtext, '→', ergebnis);

  aktualisiereFortschrittsAnzeige();
  ergebnisAnzeigen(container, vokabel, abfrageFelder, ergebnis, falschWertung);
}

// Kurzer Fortschritts-Hinweis oben auf jeder Abfrageseite - in allen drei
// Rundenende-Modi hilfreich, nicht nur bei "alle-einmal"/"alle-richtig": auch
// im manuellen Modus ist interessant, wie viel vom gewählten Bereich schon
// dran bzw. schon richtig war. Wird per ID aktualisiert (nicht nur beim
// Ziehen einer neuen Karte, sondern auch sofort nach dem Prüfen), damit eine
// gerade richtig beantwortete Vokabel nicht erst bei der nächsten Karte
// aus dem "Richtig"-Zähler fehlt.
function fortschrittsZahlen() {
  const pool = getAktuellenPool();
  return {
    gesamt: pool.length,
    gefragt: Object.keys(ziehungenProId).length,
    richtig: statistik.richtigeIds.size,
  };
}

// Fortschrittsbalken ("Meter"): Name und Zahlen als Text darüber, darunter
// die Füllung auf einer helleren Spur derselben Farbe - die Zahlen stehen
// also immer lesbar da, die Farbe ist nur zusätzliche Orientierung.
function fortschrittsBalken(name, wert, gesamt, art) {
  const zeile = document.createElement('div');
  zeile.className = `fortschritt-balken fortschritt-${art}`;

  const kopf = document.createElement('div');
  kopf.className = 'fortschritt-kopf';
  const nameEl = document.createElement('span');
  nameEl.textContent = name;
  const zahlEl = document.createElement('span');
  zahlEl.textContent = `${wert} / ${gesamt}`;
  kopf.append(nameEl, zahlEl);

  const spur = document.createElement('div');
  spur.className = 'fortschritt-spur';
  spur.setAttribute('role', 'progressbar');
  spur.setAttribute('aria-label', name);
  spur.setAttribute('aria-valuemin', '0');
  spur.setAttribute('aria-valuemax', String(gesamt));
  spur.setAttribute('aria-valuenow', String(wert));
  const fuellung = document.createElement('div');
  fuellung.className = 'fortschritt-fuellung';
  fuellung.style.width = `${gesamt > 0 ? (wert / gesamt) * 100 : 0}%`;
  spur.appendChild(fuellung);

  zeile.append(kopf, spur);
  return zeile;
}

function fortschrittsBalkenListe() {
  const { gesamt, gefragt, richtig } = fortschrittsZahlen();
  return [
    fortschrittsBalken('Gefragt', gefragt, gesamt, 'gefragt'),
    fortschrittsBalken('Richtig', richtig, gesamt, 'richtig'),
  ];
}

function fortschrittsAnzeige() {
  const container = document.createElement('div');
  container.className = 'fortschritt';
  container.id = 'fortschritts-anzeige';
  container.append(...fortschrittsBalkenListe());
  return container;
}

function aktualisiereFortschrittsAnzeige() {
  const container = document.getElementById('fortschritts-anzeige');
  if (container) container.replaceChildren(...fortschrittsBalkenListe());
}

function renderKarte() {
  rueckfrageZaehler = 0;

  const store = getStore();
  const vokabel = store.vokabeln[aktuelleVokabelId];
  const abfrageFelder = aktiveAbfrageFelder(vokabel, store.einstellungen.abfrage_felder[vokabel.wortart]);
  const mussBedeutungen = vokabel.bedeutungen.filter(b => b.typ === 'muss');

  const container = document.getElementById('abfrage-inhalt');
  container.innerHTML = '';

  container.appendChild(fortschrittsAnzeige());

  const lemmaKarte = document.createElement('div');
  lemmaKarte.className = 'karte abfrage-lemma';
  lemmaKarte.textContent = vokabel.lemma;
  container.appendChild(lemmaKarte);

  const formular = document.createElement('div');
  formular.className = 'karte';

  const genusAktiv = abfrageFelder.some(f => KEINE_KOMMA_PFLICHT_FELDER.includes(f));
  const genusHinweis = genusAktiv ? ' — Genus (m/f/n) kannst du einfach mit dazusagen' : '';
  const label = document.createElement('label');
  label.textContent =
    `Antwort (mit Komma getrennt: ${erwarteteAngaben(vokabel, abfrageFelder, mussBedeutungen).join(', ')})` +
    genusHinweis;
  const eingabe = document.createElement('input');
  eingabe.type = 'text';
  eingabe.autocomplete = 'off';
  eingabe.autocapitalize = 'off';
  eingabe.autocorrect = 'off';
  eingabe.placeholder = 'z.B. Wort, Form, Bedeutung, weitere Bedeutung';
  formular.append(label, eingabe);
  mitMikrofon(eingabe);

  container.appendChild(formular);

  const pruefenButton = document.createElement('button');
  pruefenButton.className = 'primaer';
  pruefenButton.textContent = 'Prüfen';
  pruefenButton.addEventListener('click', () => antwortPruefen(vokabel, abfrageFelder, eingabe, pruefenButton, container));
  container.appendChild(pruefenButton);

  eingabe.addEventListener('keydown', ev => {
    // preventDefault: sonst landet derselbe Tastendruck nach dem Prüfen
    // beim dann fokussierten "Weiter" und überspringt das Ergebnis.
    if (ev.key === 'Enter') {
      ev.preventDefault();
      pruefenButton.click();
    }
  });
  eingabe.focus();
}

// Prüft, ob die Runde laut der bei der Lektionsauswahl gewählten
// Rundenende-Einstellung fertig ist. Gibt bei "fertig" einen kurzen
// Abschluss-Hinweistext zurück, sonst null (auch im Modus "manuell", der nie
// automatisch endet).
function rundenendeHinweis() {
  const modus = getAktuellesRundenende();
  if (modus === 'manuell') return null;

  const pool = getAktuellenPool();
  if (pool.length === 0) return null;

  if (modus === 'alle-einmal' && Object.keys(ziehungenProId).length >= pool.length) {
    return 'Fertig! Jede Vokabel aus dem gewählten Bereich war mindestens einmal dran.';
  }
  if (modus === 'alle-richtig' && pool.every(id => statistik.richtigeIds.has(id))) {
    return 'Fertig! Du hast jede Vokabel aus dem gewählten Bereich mindestens einmal richtig beantwortet.';
  }
  return null;
}

function naechsteKarte() {
  const hinweis = rundenendeHinweis();
  if (hinweis) {
    beendeRunde(hinweis);
    return;
  }

  aktuelleVokabelId = ziehNaechsteVokabelId();
  const vokabel = getStore().vokabeln[aktuelleVokabelId];
  console.log(
    `Gezogen: ${aktuelleVokabelId} (${vokabel.lemma}). Ziehungen bisher:`,
    { ...ziehungenProId }
  );
  renderKarte();
}

export function starteAbfrage() {
  warteschlange = [];
  gewichteterStapel = [];
  ersterDurchgang = true;
  aktuelleVokabelId = null;
  ziehungenProId = {};
  statistik = neueStatistik();
  naechsteKarte();
}

function rundenZusammenfassungElement() {
  const gesamt = statistik.richtig + statistik.falsch;

  const container = document.createElement('div');

  const ergebnisZeile = document.createElement('p');
  if (gesamt === 0) {
    ergebnisZeile.textContent = 'Du hast in dieser Runde noch keine Vokabel beantwortet.';
  } else {
    const prozent = Math.round((statistik.richtig / gesamt) * 100);
    ergebnisZeile.textContent = `${statistik.richtig} von ${gesamt} richtig (${prozent} %).`;
  }
  container.appendChild(ergebnisZeile);

  const bereich = document.createElement('div');
  bereich.className = 'fortschritt';
  bereich.append(...fortschrittsBalkenListe());
  container.appendChild(bereich);

  return container;
}

// Liste der falsch beantworteten Vokabeln dieser Runde, mit vollständiger
// Lösung zum Nachschauen (dieselbe Farbmarkierung wie direkt nach dem
// Prüfen: rot zeigt, welcher Teil damals gefehlt hat) - eingeklappt, damit
// sie bei vielen Fehlern nicht den ganzen Bildschirm einnimmt.
function fehlerListeElement() {
  const details = document.createElement('details');
  const titel = document.createElement('summary');
  titel.textContent = `Zum Nachschauen (${statistik.fehler.length})`;
  details.appendChild(titel);
  for (const { vokabel, abfrageFelder, ergebnis } of statistik.fehler) {
    const karte = document.createElement('div');
    karte.className = 'karte';
    karte.appendChild(loesungsElement(vokabel, abfrageFelder, ergebnis));
    details.appendChild(karte);
  }
  return details;
}

function beendeRunde(abschlussHinweis = null) {
  const inhalt = document.getElementById('ergebnis-inhalt');
  inhalt.innerHTML = '';
  if (abschlussHinweis) {
    const hinweis = document.createElement('p');
    hinweis.className = 'richtig';
    hinweis.textContent = abschlussHinweis;
    inhalt.appendChild(hinweis);
  }
  inhalt.appendChild(rundenZusammenfassungElement());
  if (statistik.fehler.length > 0) inhalt.appendChild(fehlerListeElement());
  zeigeScreen('ergebnis');
}

export function initAbfrage() {
  document.getElementById('abfrage-beenden-button').addEventListener('click', () => beendeRunde());
  document.getElementById('ergebnis-nochmal-button').addEventListener('click', () => {
    zeigeScreen('abfrage');
    starteAbfrage();
  });
}
