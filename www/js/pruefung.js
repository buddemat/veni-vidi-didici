// Reine, isolierte Funktionen zur Antwortprüfung - bewusst ohne Abhängigkeit
// zu Store/DOM, damit sie sich leicht in der Chrome-Konsole testen lassen
// (siehe unten: window.pruefung).

// Kleinschreibung, deutsche Umlaute auf die eingedeutschte Schreibweise
// (ä/ö/ü/ß -> ae/oe/ue/ss, wie ohne Umlaut-Taste üblich getippt) - das macht
// z.B. "bemühen" und "bemuehen" exakt gleich, statt sich auf die
// Tippfehlertoleranz verlassen zu müssen. Makron-Diakritika (Latein) werden
// per NFD-Zerlegung + Streichen der kombinierenden Zeichen entfernt, u/v-
// und i/j-Angleichung, Frage-/Ausrufezeichen entfernen (z.B. "wo?" == "wo"),
// Bindestriche/Schrägstriche/Whitespace vereinheitlichen (Schrägstrich wie
// Leerzeichen behandelt, damit z.B. "wer/was" und "wer was" gleich sind).
export function normalisiere(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/j/g, 'i')
    .replace(/v/g, 'u')
    .replace(/[?!]/g, '')
    // Auslassungspunkte ("sowohl ... als auch") und Kommas nur als
    // Worttrenner werten - "sowohl...als auch", "sowohl als auch" und
    // (zusammengefasst, siehe fasseKommaWerteZusammen) "sowohl, als auch"
    // gelten damit alle gleich.
    .replace(/\.{2,}|…|,/g, ' ')
    .replace(/[-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistanz(a, b) {
  const laengeA = a.length;
  const laengeB = b.length;
  const matrix = Array.from({ length: laengeA + 1 }, () => new Array(laengeB + 1).fill(0));
  for (let i = 0; i <= laengeA; i++) matrix[i][0] = i;
  for (let j = 0; j <= laengeB; j++) matrix[0][j] = j;
  for (let i = 1; i <= laengeA; i++) {
    for (let j = 1; j <= laengeB; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + kosten
      );
    }
  }
  return matrix[laengeA][laengeB];
}

// Modulweiter Schalter, ob Tippfehlertoleranz überhaupt erlaubt ist - wird zu
// Beginn von pruefeAntwort() aus der Einstellung gesetzt. Als Modul-Zustand
// statt als Parameter durch jede einzelne (tief verschachtelte)
// Hilfsfunktion durchgereicht, das wären sonst sehr viele Signaturen.
let tippfehlertoleranzAktiv = true;

// Erlaubte Tippfehlertoleranz. Wichtig: bei gleicher Länge (reine
// Buchstaben-Vertauschung, z.B. "vocare"/"vokare") ist ein Zeichen Abweichung
// meist ein harmloser Tippfehler. Bei unterschiedlicher Länge (eingefügter
// oder fehlender Buchstabe) gibt es dagegen KEINE Toleranz, auch nicht bei
// langen Wörtern - gerade bei Endungen (z.B. 1. Person Singular) kann selbst
// bei langem Stamm ein einzelner Buchstabe den grammatischen Unterschied
// ausmachen, z.B. wäre "clamao" statt "clamo" sonst fälschlich als richtig
// durchgegangen. Ist die Toleranz per Einstellung ausgeschaltet, wird immer
// exakte Übereinstimmung verlangt (0) - Normalisierung (Makronen, Umlaute,
// u/v, i/j, ?/!) gilt aber immer, das ist keine "Toleranz" im engeren Sinn,
// sondern nötig, weil viele Tastaturen z.B. keine Makronen können.
function toleranzSchwelle(a, b) {
  if (!tippfehlertoleranzAktiv) return 0;
  if (a.length !== b.length) return 0;
  const laenge = a.length;
  if (laenge <= 4) return 0;
  if (laenge <= 8) return 1;
  return 2;
}

export function aehnlich(a, b) {
  const na = normalisiere(a);
  const nb = normalisiere(b);
  if (na === nb) return true;
  const distanz = levenshteinDistanz(na, nb);
  return distanz <= toleranzSchwelle(na, nb);
}

// Genus hat nur eine Handvoll möglicher Werte - dafür reicht Exakt-Vergleich
// (nach Normalisierung); Levenshtein wäre hier gefährlich, weil sich z.B.
// "der"/"die" mit kleiner Toleranz verwechseln ließen.
const GENUS_SYNONYME = {
  m: ['m', 'der', 'maskulinum', 'maskulin', 'männlich'],
  f: ['f', 'die', 'femininum', 'feminin', 'weiblich'],
  n: ['n', 'das', 'neutrum', 'neutral', 'sächlich'],
};

// "der"/"die"/"das" kollidieren mit deutschen Artikeln in Bedeutungen (z.B.
// "die Insel") und dürfen deshalb nur erkannt werden, wenn sie ein ganzes
// Komma-Segment für sich sind (siehe erkenneGenusSegment). Die übrigen,
// eindeutigen Fachbegriffe/Kürzel sind dafür zu selten Teil einer echten
// Bedeutung, um dasselbe Risiko zu haben - die dürfen deshalb auch als
// erstes oder letztes Wort eines längeren Segments ohne eigenes Komma
// stehen (siehe erkenneGenusPraefixOderSuffix), z.B. "maskulinum der Esel"
// oder "die Stille neutrum".
const GENUS_ARTIKEL = ['der', 'die', 'das'];

function genusAusWort(wort) {
  for (const [genus, synonyme] of Object.entries(GENUS_SYNONYME)) {
    if (synonyme.some(s => normalisiere(s) === wort)) return genus;
  }
  return null;
}

// Einzelnes Genus ("m", "maskulinum", "der") oder mehrere auf einmal für
// Wörter mit zwei Genera ("m/f", "m f", "m oder f") - dann z.B. "m/f".
export function erkenneGenusSegment(segment) {
  const worte = normalisiere(segment).split(' ').filter(w => w !== 'und' && w !== 'oder');
  const genera = worte.map(genusAusWort);
  if (genera.length === 0 || genera.includes(null)) return null;
  return [...new Set(genera)].join('/');
}

// Eindeutige (nicht-Artikel) Genus-Synonyme, gemeinsam für Präfix-/Suffix-
// Erkennung.
function eindeutigesGenusWort(wort) {
  const normalisiert = normalisiere(wort);
  for (const [genus, synonyme] of Object.entries(GENUS_SYNONYME)) {
    const eindeutig = synonyme.filter(s => !GENUS_ARTIKEL.includes(s));
    if (eindeutig.some(s => normalisiere(s) === normalisiert)) return genus;
  }
  return null;
}

// Erkennt Genus als erstes ODER letztes Wort eines längeren, sonst
// unveränderten Segments - z.B. "maskulinum der Esel" (Genus vorne) oder
// "die Stille neutrum" (Genus hinten, wenn es als letzte Angabe einfach
// dazugesagt wird). Nur für die eindeutigen Synonyme, nicht für der/die/das
// (siehe GENUS_ARTIKEL).
function erkenneGenusPraefixOderSuffix(segment) {
  const leerzeichenVorne = segment.indexOf(' ');
  if (leerzeichenVorne !== -1) {
    const erstesWort = segment.slice(0, leerzeichenVorne);
    const rest = segment.slice(leerzeichenVorne + 1).trim();
    const genus = rest && eindeutigesGenusWort(erstesWort);
    if (genus) return { genus, rest };
  }

  const leerzeichenHinten = segment.lastIndexOf(' ');
  if (leerzeichenHinten !== -1) {
    const letztesWort = segment.slice(leerzeichenHinten + 1);
    const rest = segment.slice(0, leerzeichenHinten).trim();
    const genus = rest && eindeutigesGenusWort(letztesWort);
    if (genus) return { genus, rest };
  }

  return null;
}

// Antwort in einzelne Angaben zerlegen. Trennzeichen ist ein Komma - entweder
// getippt oder (bei Spracheingabe) als gesprochenes Wort "Komma", das
// Spracherkenner i.d.R. wörtlich transkribieren.
export function zerlegeAntwort(rohtext) {
  return String(rohtext)
    .replace(/\bkomma\b/gi, ',')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// Genus muss - anders als Formen/Bedeutungen - kein eigenes Komma-Segment an
// fester Position sein, aber "der"/"die"/"das" müssen weiterhin ein ganzes
// Segment für sich sein (nicht Teil eines längeren): Sonst ließe sich z.B.
// bei einer femininen Vokabel das "die" aus der Bedeutung "die Insel" nicht
// mehr von einer eigenständigen Genus-Angabe "die" unterscheiden.
// Bei Wörtern mit zwei Genera dürfen auch beide als eigene Segmente kommen
// ("m, f") - alle eigenständigen Genus-Segmente werden gesammelt, Ergebnis
// dann z.B. "m/f".
export function trenneGenusAus(segmente) {
  const genera = [];
  const rest = [];
  for (const segment of segmente) {
    const erkannt = erkenneGenusSegment(segment);
    if (erkannt) {
      genera.push(...erkannt.split('/'));
      continue;
    }
    if (genera.length === 0) {
      const treffer = erkenneGenusPraefixOderSuffix(segment);
      if (treffer) {
        genera.push(treffer.genus);
        rest.push(treffer.rest);
        continue;
      }
    }
    rest.push(segment);
  }
  const genus = genera.length > 0 ? [...new Set(genera)].join('/') : null;
  return { genus, rest };
}

// Manche Lemmata/Formen/Bedeutungen enthalten Klammer-Zusätze aus dem
// Vokabelheft - mal reine Grammatik-Hinweise ("vacō (m. Abl.)" = regiert
// Ablativ), mal optionale Wortbestandteile ("(ver)brennen", "dext(e)ra").
// Beides wird durch zwei akzeptierte Varianten abgedeckt: einmal ganz ohne
// Klammerinhalt ("vacō", "brennen", "dextra") und einmal mit Inhalt, aber
// ohne die Klammern selbst ("verbrennen", "dextera") - Tippfehlertoleranz
// deckt kleine Differenzen zwischen den Varianten zusätzlich ab.
// Deutsche Verb-Präfixe, die im Satz tatsächlich als eigenes Wort abgetrennt
// werden ("es liegt da" zu "daliegen") - dafür ist "da liegen" echtes
// Deutsch. Bewusst NICHT alle Präfixe: untrennbare Präfixe wie "ver-"/"be-"/
// "er-"/"ent-"/"ge-"/"zer-"/"emp-" stehen NIE als eigenes Wort ("ver
// brennen" ist kein korrektes Deutsch, "verbrennen" ist immer ein Wort).
// "sich"/"sē" sind kein Präfix, aber genauso ein eigenständiges, sicher
// abtrennbares Wort (Reflexivpronomen). Nur für Verb-Bedeutungen relevant -
// Latein (Lemma/Formen) kennt kein trennbares Präfix, und bei anderen
// Wortarten (Substantiv-Komposita etc.) besteht nicht dasselbe Risiko,
// tatsächlich falsches Deutsch als richtig zu werten.
const TRENNBARE_PRAEFIXE = new Set([
  'ab', 'an', 'auf', 'aus', 'da', 'dar', 'ein', 'entgegen', 'her', 'herbei',
  'hin', 'hinein', 'los', 'mit', 'nach', 'nieder', 'statt', 'vor', 'weg',
  'weiter', 'wieder', 'zu', 'zurück', 'zusammen', 'sich', 'sē',
]);

// Ob JEDER (durch Komma/Semikolon/Bindestrich getrennte) Teil des
// Klammerinhalts ein bekanntes trennbares Präfix ist - bei gemischten Listen
// wie "an-, er-, zu" (enthält das untrennbare "er-") lieber konservativ
// ablehnen, statt versehentlich falsches Deutsch zu akzeptieren.
function praefixIstTrennbar(klammerInhalt) {
  const teile = klammerInhalt
    .toLowerCase()
    .split(/[,;]/)
    .flatMap(teil => teil.split('-'))
    .map(t => t.trim())
    .filter(Boolean);
  return teile.length > 0 && teile.every(teil => TRENNBARE_PRAEFIXE.has(teil));
}

function klammerVarianten(text, praefixPruefungAktiv) {
  if (!text.includes('(')) return [text];
  const bereinigen = s => s.replace(/\s+/g, ' ').trim();

  // Markiert die Klammer einen eigenen Wortanfang (am Textanfang oder nach
  // einem Leerzeichen, z.B. "(da)liegen", "das (Land-)Haus")? Oder steht sie
  // MITTEN in einem Wort (z.B. "dext(e)ra", "Tausend(e)", "der/die
  // Bürger(in)")? Im zweiten Fall ist der Klammerinhalt nur eine Buchstaben-/
  // Endungsvariante, kein eigenes Wort - beim Entfernen darf dort KEIN
  // Leerzeichen entstehen ("dextra", nicht "dext ra"), und eine Leerzeichen-
  // Variante ergäbe nur Kauderwelsch ("dext ra", "Tausend e", "Bürger in").
  const istWortanfang = /(^|\s)\(/.test(text);

  const ohneKlammerinhalt = bereinigen(
    istWortanfang
      ? text.replace(/\s*\([^)]*\)\s*/g, ' ')
      : text.replace(/\([^)]*\)/g, '')
  );

  // Ein Bindestrich direkt vor der schließenden Klammer (z.B. "(Land-)Haus")
  // zeigt an, dass das Wort ohne Trennzeichen direkt weitergeht ("Landhaus")
  // - der bleibt sonst als echter Bindestrich stehen und würde nach der
  // strengen Längenprüfung bei unterschiedlicher Länge (siehe
  // toleranzSchwelle) nicht mehr zur getippten Antwort passen.
  const mitKlammerinhaltZusammen = bereinigen(text.replace(/-\)/g, ')').replace(/[()]/g, ''));

  const varianten = new Set([ohneKlammerinhalt, mitKlammerinhaltZusammen]);

  // Zusätzlich mit Leerzeichen statt Zusammenschreibung ("da liegen" statt
  // "daliegen") - Kinder oder die Spracherkennung sprechen/erkennen einen
  // Klammer-Wortteil oft als eigenes Wort statt zusammengeschrieben. Nur bei
  // echtem Wortanfang, und bei aktiver Präfix-Prüfung (Verb-Bedeutungen) nur
  // bei einem bekannten TRENNBAREN Präfix (siehe TRENNBARE_PRAEFIXE oben).
  if (istWortanfang) {
    const klammerInhalt = (text.match(/\(([^)]*)\)/) || [])[1] || '';
    const getrenntErlaubt = !praefixPruefungAktiv || praefixIstTrennbar(klammerInhalt);
    if (getrenntErlaubt) {
      varianten.add(bereinigen(text.replace(/-\)/g, ' )').replace(/[()]/g, ' ')));
    }
  }

  // Und wörtlich wie im Buch, mit Klammern ("(be)grüßen", "der (Haus-)Herr")
  // - normalisiere() lässt Klammern stehen, die getippte Buch-Notation passt
  // also genau auf diese Variante.
  varianten.add(bereinigen(text));

  return [...varianten];
}

// Manche Werte sind über "/" vollständige Alternativen (nicht optionale
// Zusätze wie oben) - z.B. Form "servī/servae" (Genitiv je nach Geschlecht)
// oder Bedeutung "wer?/was?". Jede Seite ist für sich genommen richtig
// (z.B. nur "wer"), aber auch die volle, kombinierte Angabe zählt - "/" wird
// von normalisiere() wie ein Leerzeichen behandelt, daher gelten dafür
// gleichermaßen "wer/was", "wer was" und "wer? was?".
// praefixPruefungAktiv: bei Verb-Bedeutungen true (siehe TRENNBARE_PRAEFIXE
// oben), sonst false/weggelassen - Latein (Lemma/Formen) und andere
// Wortarten brauchen die Prüfung nicht.
// "der/die Führer(in)": der Artikel gehört jeweils zu einer Form - "der
// Führer" bzw. "die Führerin" (oder beide, "der Führer/die Führerin"). Ein
// einfaches Aufteilen am "/" ergäbe sonst nur "der" und "die Führer(in)".
const ARTIKEL_PAAR = /^der\/die (.+)$/;

export function sollVarianten(text, praefixPruefungAktiv = false) {
  const artikelPaar = text.match(ARTIKEL_PAAR);
  if (artikelPaar) {
    const maskulin = `der ${artikelPaar[1].replace(/\([^)]*\)/g, '')}`;
    const feminin = `die ${artikelPaar[1].replace(/[()]/g, '')}`;
    return [...new Set([
      ...klammerVarianten(text, praefixPruefungAktiv), maskulin, feminin, `${maskulin}/${feminin}`,
    ])];
  }

  const varianten = new Set();
  for (const variante of klammerVarianten(text, praefixPruefungAktiv)) varianten.add(variante);
  if (text.includes('/')) {
    const seiten = text.split('/').map(s => s.trim()).filter(Boolean);
    for (const seite of seiten) {
      for (const variante of klammerVarianten(seite, praefixPruefungAktiv)) varianten.add(variante);
    }
  }
  return [...varianten];
}

// Zerlegt einen (bereits normalisierten) Text in "Artikel" + "Rest", falls er
// mit der/die/das beginnt - sonst null.
function artikelUndRest(normalisierterText) {
  const leerzeichenIndex = normalisierterText.indexOf(' ');
  if (leerzeichenIndex === -1) return null;
  const erstesWort = normalisierterText.slice(0, leerzeichenIndex);
  if (!GENUS_ARTIKEL.includes(erstesWort)) return null;
  return { artikel: erstesWort, rest: normalisierterText.slice(leerzeichenIndex + 1) };
}

// Kleinste Distanz einer Angabe zu irgendeiner akzeptierten Variante eines
// Soll-Werts - oder null, wenn keine Variante innerhalb der Toleranz liegt.
function besteVarianzDistanz(sollVarianten, segment) {
  const nb = normalisiere(segment);
  let beste = null;
  for (const soll of sollVarianten) {
    const na = normalisiere(soll);

    // Bei "Artikel Nomen"-Bedeutungen (z.B. "die Sonne") muss der Artikel
    // EXAKT stimmen - "der" statt "die" ist ein klarer inhaltlicher Fehler,
    // keine Tippfehler-Toleranz wert, auch wenn die Gesamtlänge nach der
    // sonst üblichen Formel noch tolerant wäre (z.B. "der Sonne" vs.
    // "die Sonne" unterscheidet sich nur um 2 Buchstaben bei 9 Zeichen
    // Gesamtlänge - würde sonst fälschlich als Tippfehler durchgehen).
    const sollArtikel = artikelUndRest(na);
    if (sollArtikel) {
      const segArtikel = artikelUndRest(nb);
      if (!segArtikel || segArtikel.artikel !== sollArtikel.artikel) continue;
      const distanz = levenshteinDistanz(sollArtikel.rest, segArtikel.rest);
      const schwelle = toleranzSchwelle(sollArtikel.rest, segArtikel.rest);
      if (distanz <= schwelle && (beste === null || distanz < beste)) beste = distanz;
      continue;
    }

    const distanz = levenshteinDistanz(na, nb);
    const schwelle = toleranzSchwelle(na, nb);
    if (distanz <= schwelle && (beste === null || distanz < beste)) beste = distanz;
  }
  return beste;
}

// Ordnet Komma-Segmente den erwarteten Werten zu (Lemma-Wiederholung, aktive
// Formen, MUSS-Bedeutungen) - einfache Greedy-Zuordnung nach aufsteigender
// Levenshtein-Distanz, reicht, weil Formen und Bedeutungen sich i.d.R.
// deutlich unterscheiden.
function ordneZu(erwarteteWerte, segmente) {
  const kandidaten = [];
  erwarteteWerte.forEach((erwartet, ei) => {
    segmente.forEach((segment, si) => {
      const distanz = besteVarianzDistanz(erwartet.sollVarianten, segment);
      if (distanz !== null) kandidaten.push({ ei, si, distanz });
    });
  });
  // Bei gleicher Distanz zuerst die bewerteten Angaben (Formen, MUSS-
  // Bedeutungen) bedienen: Ist z.B. der Genitiv gleich dem Lemma ("orbis,
  // orbis") und wird nur einmal genannt, gehört das Segment dem Genitiv -
  // die (ungewertete) Lemma-Wiederholung geht dann eben leer aus.
  const BEWERTET = new Set(['form', 'bedeutung']);
  const rang = k => (BEWERTET.has(erwarteteWerte[k.ei].typ) ? 0 : 1);
  kandidaten.sort((a, b) => a.distanz - b.distanz || rang(a) - rang(b));

  const zuordnung = new Map();
  const belegteSegmente = new Set();
  for (const { ei, si } of kandidaten) {
    if (zuordnung.has(ei) || belegteSegmente.has(si)) continue;
    zuordnung.set(ei, si);
    belegteSegmente.add(si);
  }
  return zuordnung;
}

// Ob ein Segment zu IRGENDEINEM erwarteten Wert passt - unabhängig davon, ob
// dessen Platz schon durch ein anderes Segment belegt ist. Damit lässt sich
// unterscheiden zwischen einer harmlosen Doppelnennung (z.B. bei "villa"
// sowohl "das Haus" als auch die Langform "das Landhaus" - beides sind
// Varianten derselben erwarteten Bedeutung) und einer echten Falschangabe
// (z.B. bei "sōl" zusätzlich "der Mond" - passt zu gar nichts Erwartetem).
function segmentPasstIrgendwo(segment, erwarteteWerte) {
  return erwarteteWerte.some(e => besteVarianzDistanz(e.sollVarianten, segment) !== null);
}

// Ob ein Segment zu einer erwarteten Bedeutung passen WÜRDE, wenn ein
// deutscher Artikel davor stünde (z.B. "Sonne" -> "die Sonne"). Damit lässt
// sich der Fall "Artikel vergessen" (die Bedeutung bleibt dann korrekt als
// fehlend erkannt, siehe bedeutungErgebnisse) von einer echten Falschangabe
// unterscheiden - "Sonne" soll nicht als "passt nicht dazu" gemeldet werden.
function segmentKoennteFehlenderArtikelSein(segment, erwarteteWerte) {
  return GENUS_ARTIKEL.some(artikel => segmentPasstIrgendwo(`${artikel} ${segment}`, erwarteteWerte));
}

// Gibt es unter den noch nicht verbrauchten Segmenten eines, das mit
// vorangestelltem der/die/das zu GENAU DIESER Bedeutung passen würde (z.B.
// "Esel" -> "der Esel")? Gibt das Segment selbst zurück (nicht nur ja/nein),
// damit die Rückfrage in Schritt 9 den fehlenden Artikel gezielt DAVOR
// einfügen kann, statt ihn als eigenständiges (mit Genus verwechselbares)
// neues Segment anzuhängen.
function findeArtikelKandidatSegment(sollVarianten, segmente, belegteSegmente) {
  for (let si = 0; si < segmente.length; si++) {
    if (belegteSegmente.has(si)) continue;
    const segment = segmente[si];
    if (GENUS_ARTIKEL.some(artikel => besteVarianzDistanz(sollVarianten, `${artikel} ${segment}`) !== null)) {
      return segment;
    }
  }
  return null;
}

// Ob ein Segment schon "funktioniert", ohne es aufteilen zu müssen: entweder
// als eigenständige Genus-Angabe (nur relevant, wenn Genus gerade abgefragt
// wird) oder weil es (ggf. als Ganzes) zu einem erwarteten Wert passt.
function segmentPasstBereits(segment, erwarteteWerte, genusAktiv) {
  if (genusAktiv && (erkenneGenusSegment(segment) !== null || erkenneGenusPraefixOderSuffix(segment) !== null)) {
    return true;
  }
  return segmentPasstIrgendwo(segment, erwarteteWerte);
}

// Fallback für Segmente, die als Ganzes zu nichts Erwartetem passen: Versuch,
// sie an "der"/"die"/"das" aufzuteilen (jedes Vorkommen als möglicher Beginn
// einer neuen Bedeutung oder - bei aktivem Genus - einer Genus-Angabe), damit
// z.B. "silentium neutrum die Ruhe die Stille" auch ganz ohne Kommas
// funktioniert. Nur übernommen, wenn WIRKLICH JEDES entstehende Teilstück zu
// etwas passt - schützt Redewendungen wie "in der Ferne", bei denen der
// Artikel mitten im Text steht und keine Trennstelle ist (die passen als
// Ganzes bereits über segmentPasstBereits, landen also gar nicht erst hier).
function versucheArtikelAufteilung(segment, erwarteteWerte, genusAktiv) {
  const worte = segment.split(/\s+/).filter(Boolean);
  const artikelPositionen = [];
  worte.forEach((wort, i) => {
    if (GENUS_ARTIKEL.includes(normalisiere(wort))) artikelPositionen.push(i);
  });
  if (artikelPositionen.length === 0) return null;

  const stuecke = [];
  let start = 0;
  for (const pos of artikelPositionen) {
    if (pos > start) stuecke.push(worte.slice(start, pos).join(' '));
    start = pos;
  }
  stuecke.push(worte.slice(start).join(' '));

  const alleStueckePassen = stuecke.every(s => segmentPasstBereits(s, erwarteteWerte, genusAktiv));
  return alleStueckePassen ? stuecke : null;
}

// Manche Werte enthalten selbst ein Komma (z.B. Lemma "hic, haec, hoc",
// Bedeutung "so tun, als ob") - zerlegeAntwort hat sie dann in mehrere
// Segmente zerschnitten. Aufeinanderfolgende Segmente wieder zu einem
// zusammenfassen, wenn sie gemeinsam zu einem solchen Komma-Wert passen;
// genauso bei Auslassungspunkten, die gern als Komma getippt werden
// ("sowohl, als auch" für "sowohl ... als auch");
// pro Startposition gewinnt das längste passende Stück.
function fasseKommaWerteZusammen(segmente, erwarteteWerte) {
  const kommaVarianten = erwarteteWerte
    .map(e => e.sollVarianten.filter(v => /,|\.{2,}|…/.test(v)))
    .filter(varianten => varianten.length > 0);
  if (kommaVarianten.length === 0) return segmente;

  const ergebnis = [];
  let i = 0;
  while (i < segmente.length) {
    let ende = i + 1;
    for (let j = segmente.length; j > i + 1; j--) {
      const zusammen = segmente.slice(i, j).join(', ');
      if (kommaVarianten.some(varianten => besteVarianzDistanz(varianten, zusammen) !== null)) {
        ende = j;
        break;
      }
    }
    ergebnis.push(segmente.slice(i, ende).join(', '));
    i = ende;
  }
  return ergebnis;
}

// Welche der in den Einstellungen aktivierten Felder bei dieser Vokabel
// tatsächlich abgefragt werden: nur die, die sie auch hat - z.B. hat das
// indeklinable "nefās" keinen Genitiv.
export function aktiveAbfrageFelder(vokabel, felderAusEinstellungen) {
  return (felderAusEinstellungen || []).filter(feldKey => vokabel.formen[feldKey] !== undefined);
}

// Haupteinstieg: prüft eine Ein-Feld-Antwort gegen eine Vokabel.
// abfrageFelder = aktuell aktive Formfelder dieser Wortart (aus den
// Einstellungen), rohtext = kompletter Text aus dem Antwortfeld,
// tippfehlerErlaubt = einstellungen.tippfehlertoleranz_aktiv.
export function pruefeAntwort(vokabel, abfrageFelder, rohtext, tippfehlerErlaubt = true) {
  tippfehlertoleranzAktiv = tippfehlerErlaubt;
  const alleSegmente = zerlegeAntwort(rohtext);
  const genusAktiv = abfrageFelder.includes('genus');

  const formFelder = abfrageFelder.filter(f => f !== 'genus');
  const mussBedeutungen = vokabel.bedeutungen.filter(b => b.typ === 'muss');
  // KANN-Bedeutungen zählen nicht zur Bewertung, sind aber - wenn genannt -
  // eine gültige Angabe, keine falsche Zusatzangabe. Deshalb als (ungewertete)
  // Kandidaten mit aufnehmen, sonst würden sie fälschlich als "unerwartet"
  // markiert (siehe unerwarteteSegmente weiter unten).
  const kannBedeutungen = vokabel.bedeutungen.filter(b => b.typ === 'kann');
  // Nur bei Verben kann eine Klammer einen (ggf. untrennbaren) Verb-Präfix
  // markieren - siehe TRENNBARE_PRAEFIXE/praefixIstTrennbar.
  const istVerb = vokabel.wortart === 'verb';

  // Formfelder, die gerade NICHT abgefragt werden (z.B. Präsens 1. Sg. bei
  // ausgeschalteter Einstellung): dürfen trotzdem freiwillig mit genannt
  // werden, ohne die Antwort ungültig zu machen - genau wie KANN-Bedeutungen
  // oben also ungewertete Kandidaten, kein Pflichtfeld. "genus" wird separat
  // behandelt (trenneGenusAus) und hier ausgenommen.
  const inaktiveFormFelder = Object.keys(vokabel.formen)
    .filter(feldKey => feldKey !== 'genus' && !formFelder.includes(feldKey));

  const erwarteteWerte = [
    { typ: 'lemma', sollVarianten: sollVarianten(vokabel.lemma) },
    ...formFelder
      .map(feldKey => ({ typ: 'form', feldKey, sollWert: vokabel.formen[feldKey] }))
      .filter(e => e.sollWert !== undefined)
      .map(e => ({ ...e, sollVarianten: sollVarianten(e.sollWert) })),
    ...inaktiveFormFelder.map(feldKey => ({
      typ: 'form-optional', feldKey, sollVarianten: sollVarianten(vokabel.formen[feldKey]),
    })),
    ...mussBedeutungen.map((b, index) => ({
      typ: 'bedeutung', index, sollVarianten: sollVarianten(b.text, istVerb),
    })),
    ...kannBedeutungen.map((b, index) => ({
      typ: 'bedeutung-kann', index, sollVarianten: sollVarianten(b.text, istVerb),
    })),
  ];

  // Segmente, die als Ganzes zu nichts Erwartetem passen, versuchsweise an
  // der/die/das aufteilen (siehe versucheArtikelAufteilung) - braucht die
  // fertige erwarteteWerte-Liste, deshalb erst jetzt und nicht schon vor
  // deren Aufbau.
  const erweiterteSegmente = [];
  for (const segment of fasseKommaWerteZusammen(alleSegmente, erwarteteWerte)) {
    if (segmentPasstBereits(segment, erwarteteWerte, genusAktiv)) {
      erweiterteSegmente.push(segment);
      continue;
    }
    const aufgeteilt = versucheArtikelAufteilung(segment, erwarteteWerte, genusAktiv);
    erweiterteSegmente.push(...(aufgeteilt || [segment]));
  }

  const { genus: erkannterGenus, rest: segmente } = genusAktiv
    ? trenneGenusAus(erweiterteSegmente)
    : { genus: null, rest: erweiterteSegmente };

  const zuordnung = ordneZu(erwarteteWerte, segmente);
  const belegteSegmente = new Set(zuordnung.values());

  const formErgebnisse = {};
  formFelder.forEach(feldKey => {
    const soll = vokabel.formen[feldKey];
    if (soll === undefined) return; // Datenlücke - wird nicht geprüft
    const ei = erwarteteWerte.findIndex(e => e.typ === 'form' && e.feldKey === feldKey);
    const si = zuordnung.get(ei);
    formErgebnisse[feldKey] = {
      soll,
      erkannt: si !== undefined ? segmente[si] : null,
      ok: si !== undefined,
    };
  });

  const bedeutungErgebnisse = mussBedeutungen.map((b, index) => {
    const ei = erwarteteWerte.findIndex(e => e.typ === 'bedeutung' && e.index === index);
    const si = zuordnung.get(ei);
    const ok = si !== undefined;
    // Nur relevant, wenn die Bedeutung fehlt: steckt der (deutsche) Artikel
    // als einziges Manko im Weg (z.B. "Esel" statt "der Esel")? Für die
    // gezielte Rückfrage in Schritt 9 - artikelKandidatSegment ist das
    // konkrete Roh-Segment, an das der Artikel angefügt werden muss.
    const artikelKandidatSegment = ok
      ? null
      : findeArtikelKandidatSegment(erwarteteWerte[ei].sollVarianten, segmente, belegteSegmente);
    return {
      soll: b.text,
      erkannt: ok ? segmente[si] : null,
      ok,
      fehltNurArtikel: artikelKandidatSegment !== null,
      artikelKandidatSegment,
    };
  });

  // Nicht Pflicht für "richtig", aber nützlich für die Anzeige (z.B. grün
  // markieren, wenn eine KANN-Bedeutung korrekt mit genannt wurde).
  const kannBedeutungErgebnisse = kannBedeutungen.map((b, index) => {
    const ei = erwarteteWerte.findIndex(e => e.typ === 'bedeutung-kann' && e.index === index);
    const si = zuordnung.get(ei);
    return {
      soll: b.text,
      erkannt: si !== undefined ? segmente[si] : null,
      ok: si !== undefined,
    };
  });

  // Manche Wörter haben zwei zulässige Genera (z.B. "servus/serva" -> "m/f") -
  // jedes einzeln gilt als richtig, beide zusammen ("m, f", "m/f") auch;
  // ein nicht zulässiges Genus dabei macht die Angabe falsch.
  const genusErgebnis = genusAktiv
    ? {
        soll: vokabel.formen.genus,
        erkannt: erkannterGenus,
        ok: erkannterGenus !== null
          && erkannterGenus.split('/').every(g => vokabel.formen.genus.split('/').includes(g)),
      }
    : null;

  const formenOk = Object.values(formErgebnisse).every(e => e.ok);
  const bedeutungenOk = bedeutungErgebnisse.every(e => e.ok);
  const genusOk = !genusAktiv || genusErgebnis.ok;

  // Segmente, die keinem erwarteten Wert zugeordnet wurden UND auch zu
  // keinem passen würden (also keine harmlose Doppelnennung sind), sind
  // falsche/erfundene Zusatzangaben - die machen die Antwort ungültig, statt
  // stillschweigend ignoriert zu werden.
  const unerwarteteSegmente = segmente.filter((segment, si) => (
    !belegteSegmente.has(si)
    && !segmentPasstIrgendwo(segment, erwarteteWerte)
    && !segmentKoennteFehlenderArtikelSein(segment, erwarteteWerte)
  ));

  return {
    richtig: formenOk && bedeutungenOk && genusOk && unerwarteteSegmente.length === 0,
    formErgebnisse,
    genusErgebnis,
    bedeutungErgebnisse,
    kannBedeutungErgebnisse,
    unerwarteteSegmente,
  };
}

// Für manuelle Tests direkt in der Chrome-Konsole, z.B.:
// pruefung.aehnlich('servus', 'seruus') -> true
// pruefung.aehnlich('vocare', 'vokare') -> true
if (typeof window !== 'undefined') {
  window.pruefung = {
    normalisiere,
    levenshteinDistanz,
    aehnlich,
    erkenneGenusSegment,
    zerlegeAntwort,
    trenneGenusAus,
    pruefeAntwort,
  };
}
