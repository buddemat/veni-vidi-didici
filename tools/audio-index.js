#!/usr/bin/env node
// Builds an audio folder for the app: copies audio files named
// "<ID>[_anything].<ext>" as "<ID>.<ext>" into the target folder and writes
// index.json { ID: { datei, lemma } } with the lemma from the vocabulary.
// The app plays a file only while that lemma still matches the word.
//
// Usage:
//   node tools/audio-index.js <source dir> <target dir> [options]
// Options:
//   --vokabeln <file>   vocabulary JSON (default: www/assets/vokabeln.json)
//   --nur <text>        only files whose name contains <text> (e.g. "_lemma.")
//   --zuordnung <file>  JSON { oldID: newID } for files cut under older IDs
//   --lemmata <file>    JSON { ID: lemma } with the lemma each file was
//                       recorded for - files whose lemma no longer matches
//                       the vocabulary are skipped
//
// Examples:
//   node tools/audio-index.js daten/audio/woerter www/assets/audio --nur _lemma.
//   node tools/audio-index.js ~/Downloads/beispiel www/assets/audio-beispiel \
//     --vokabeln www/assets/vokabeln.beispiel.json

const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');

function argumente(argv) {
  const positionen = [];
  const optionen = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) optionen[argv[i].slice(2)] = argv[++i];
    else positionen.push(argv[i]);
  }
  return { positionen, optionen };
}

function lemmaPasst(a, b) {
  const n = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return n(a) !== '' && n(a) === n(b);
}

function main() {
  const { positionen: [quelle, ziel], optionen } = argumente(process.argv.slice(2));
  if (!quelle || !ziel) {
    console.error('Usage: node tools/audio-index.js <source dir> <target dir> [--vokabeln f] [--nur text] [--zuordnung f] [--lemmata f]');
    process.exit(1);
  }
  const vokabelnDatei = optionen.vokabeln || path.join(WURZEL, 'www/assets/vokabeln.json');
  const seed = JSON.parse(fs.readFileSync(vokabelnDatei, 'utf8'));
  const vokabeln = Object.fromEntries((seed.lektionen || []).flatMap(l => l.vokabeln).map(v => [v.id, v]));
  const zuordnung = optionen.zuordnung ? JSON.parse(fs.readFileSync(optionen.zuordnung, 'utf8')) : {};
  const lemmata = optionen.lemmata ? JSON.parse(fs.readFileSync(optionen.lemmata, 'utf8')) : null;

  fs.mkdirSync(ziel, { recursive: true });
  const index = {};
  const uebersprungen = [];
  for (const name of fs.readdirSync(quelle).sort()) {
    if (optionen.nur && !name.includes(optionen.nur)) continue;
    const treffer = name.match(/^([A-Za-z]+\d*-\d+)(?:_[^.]*)?\.([A-Za-z0-9]+)$/);
    if (!treffer || treffer[2] === 'json' || treffer[2] === 'html') continue;
    const [, alteId, ext] = treffer;
    const id = zuordnung[alteId] || alteId;
    const vokabel = vokabeln[id];
    if (!vokabel) {
      uebersprungen.push(`${name}: ID ${id} not in the vocabulary`);
      continue;
    }
    if (lemmata && !lemmaPasst(lemmata[alteId], vokabel.lemma)) {
      uebersprungen.push(`${name}: recorded for "${lemmata[alteId]}", vocabulary now has "${vokabel.lemma}"`);
      continue;
    }
    const datei = `${id}.${ext.toLowerCase()}`;
    fs.copyFileSync(path.join(quelle, name), path.join(ziel, datei));
    index[id] = { datei, lemma: vokabel.lemma };
  }
  fs.writeFileSync(path.join(ziel, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  console.log(`${Object.keys(index).length} files copied to ${ziel}, index.json written.`);
  if (uebersprungen.length) console.log(`Skipped ${uebersprungen.length}:\n  ${uebersprungen.join('\n  ')}`);
}

main();
