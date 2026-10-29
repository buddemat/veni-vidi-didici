// Abstraktion für Spracheingabe. Auf dem Handy (ab Schritt 11, sobald
// Capacitor eingerichtet ist) über @capacitor-community/speech-recognition;
// im Desktop-Browser (kein window.Capacitor) ein Mock-Modus, der per
// prompt() einen frei wählbaren Testtext abfragt - so lässt sich der
// gesamte Ablauf schon jetzt ohne Gerät/Mikrofon durchspielen.

// Sprache für die Spracherkennung. Latein wird von Android-Spracherkennern
// nicht unterstützt - lateinische Formen werden daher zwangsläufig als
// (falsch klingendes) Deutsch erkannt. Siehe Kommentar bei erkenneSpracheGeraet().
// Latein wird nicht unterstützt (getestet: "la-VA" wird nicht erkannt und
// fällt still auf eine andere Sprache zurück statt einen Fehler zu werfen) -
// Deutsch gewählt, da die deutschen Bedeutungen Teil der Antwort sind und
// damit wenigstens dieser Teil einer gemischten Antwort zuverlässig klappt.
// Bekannte Einschränkung, siehe PLAN.md.
const SPRACHERKENNUNG_SPRACHE = 'de-DE';

function istCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor;
}

function erkenneSpracheMock(bisherigerWert) {
  const testtext = prompt('Mock-Spracheingabe (Testtext eingeben):', bisherigerWert || '');
  return testtext; // null bei "Abbrechen" - vom Aufrufer unverändert zu lassen
}

// Ruft das Plugin über die von Capacitor automatisch injizierte globale
// Registry auf (window.Capacitor.Plugins), NICHT per import - ein npm-Paket
// wie "@capacitor-community/speech-recognition" ließe sich ohne Bundler
// (den wir hier bewusst nicht einsetzen) im Browser gar nicht auflösen.
async function erkenneSpracheGeraet() {
  const { SpeechRecognition } = window.Capacitor.Plugins;
  await SpeechRecognition.requestPermissions();

  const einmalVersuchen = () => SpeechRecognition.start({
    language: SPRACHERKENNUNG_SPRACHE,
    maxResults: 1,
    partialResults: false,
  });

  // Direkt nach einer vorherigen Erkennung schlägt der erste Versuch manchmal
  // sofort mit einem Fehler fehl (der Android-Spracherkenner ist dann wohl
  // noch nicht ganz zurückgesetzt) - ein zweiter Versuch klappt danach
  // normalerweise sofort. Deshalb hier einmal automatisch wiederholen, bevor
  // der Fehler beim Nutzer landet.
  let ergebnis;
  try {
    ergebnis = await einmalVersuchen();
  } catch {
    ergebnis = await einmalVersuchen();
  }
  return ergebnis.matches?.[0] ?? null;
}

export async function erkenneSprache(bisherigerWert) {
  return istCapacitor() ? erkenneSpracheGeraet() : erkenneSpracheMock(bisherigerWert);
}

function mikrofonKnopfErstellen(input) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mikrofon-knopf';
  button.textContent = '🎤';
  button.setAttribute('aria-label', 'Spracheingabe');
  button.addEventListener('click', async () => {
    // Während der Aufnahme auch die Knöpfe sperren, die die Antwort
    // abschicken ("Prüfen") - sonst würde die halb fertige Eingabe geprüft.
    const gesperrt = input.waehrendAufnahmeGesperrt || [];
    gesperrt.forEach(knopf => { knopf.disabled = true; });
    button.disabled = true;
    button.classList.add('nimmt-auf');
    button.textContent = '⏺';
    try {
      const ergebnis = await erkenneSprache(input.value);
      if (ergebnis !== null) {
        input.value = ergebnis;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
    } catch (fehler) {
      console.error('Spracheingabe fehlgeschlagen:', fehler);
      alert(`Spracheingabe hat nicht funktioniert: ${fehler?.message || fehler}`);
    } finally {
      gesperrt.forEach(knopf => { knopf.disabled = false; });
      button.disabled = false;
      button.classList.remove('nimmt-auf');
      button.textContent = '🎤';
    }
  });
  return button;
}

// Packt ein bereits im DOM eingefügtes Text-Eingabefeld zusammen mit einem
// Mikrofon-Knopf in einen gemeinsamen Wrapper (ersetzt das Eingabefeld an
// Ort und Stelle). Gibt das Eingabefeld unverändert zurück, damit der
// Aufrufer es wie gewohnt weiterverwenden kann; der Mikrofon-Knopf hängt
// zusätzlich als `input.mikrofonKnopf` dran, damit man ihn z.B. zusammen
// mit dem Eingabefeld deaktivieren kann (`eingabe.disabled = true` allein
// deaktiviert den separaten Knopf nicht automatisch mit).
// Knöpfe, die gesperrt sein sollen, solange die Spracherkennung läuft (z.B.
// "Prüfen"), trägt der Aufrufer in `input.waehrendAufnahmeGesperrt` ein.
export function mitMikrofon(input) {
  const wrapper = document.createElement('div');
  wrapper.className = 'eingabe-mit-mikrofon';
  input.replaceWith(wrapper);
  const mikrofonKnopf = mikrofonKnopfErstellen(input);
  wrapper.append(input, mikrofonKnopf);
  input.mikrofonKnopf = mikrofonKnopf;
  input.waehrendAufnahmeGesperrt = [];
  return input;
}
