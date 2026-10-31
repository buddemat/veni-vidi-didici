// Shared access to the seed vocabulary for the tests. The actual vocabulary
// (www/assets/vokabeln.json) is not part of the repository; if it is missing,
// the data tests run against the example vocabulary instead.
import fs from 'node:fs';

const echt = new URL('../www/assets/vokabeln.json', import.meta.url);
const beispiel = new URL('../www/assets/vokabeln.beispiel.json', import.meta.url);

export const echteDaten = fs.existsSync(echt);
export const seed = JSON.parse(fs.readFileSync(echteDaten ? echt : beispiel, 'utf8'));
export const beispielSeed = JSON.parse(fs.readFileSync(beispiel, 'utf8'));

export function alleVokabelnAus(s) {
  return (s.lektionen || []).flatMap(l => l.vokabeln);
}
