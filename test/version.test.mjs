import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { APP_VERSION } from '../www/js/version.js';

const require = createRequire(import.meta.url);
const { versionCodeAus } = require('../tools/version-sync.js');
const lies = pfad => fs.readFileSync(new URL(`../${pfad}`, import.meta.url), 'utf8');

// Fails if "npm run version:sync" was forgotten after changing the version
// in package.json.
test('version in package.json, app display and Android build match', () => {
  const { version } = JSON.parse(lies('package.json'));
  const gradle = lies('android/app/build.gradle');
  assert.equal(APP_VERSION, version);
  assert.equal(gradle.match(/versionName "([^"]*)"/)[1], version);
  assert.equal(Number(gradle.match(/versionCode (\d+)/)[1]), versionCodeAus(version));
});

test('versionCode increases with every higher version', () => {
  const reihe = ['0.9.0', '0.9.1', '0.9.10', '0.10.0', '0.99.99', '1.0.0', '1.0.1', '2.0.0'];
  const codes = reihe.map(versionCodeAus);
  for (let i = 1; i < codes.length; i++) assert.ok(codes[i] > codes[i - 1], `${reihe[i - 1]} -> ${reihe[i]}`);
  assert.throws(() => versionCodeAus('1.0'));
  assert.throws(() => versionCodeAus('1.100.0'));
});

// The app ID must match in the Capacitor config, the Android build and the
// MainActivity package - otherwise the app doesn't build or Capacitor can't
// find it.
test('app ID is the same everywhere', () => {
  const { appId } = JSON.parse(lies('capacitor.config.json'));
  const gradle = lies('android/app/build.gradle');
  assert.equal(gradle.match(/applicationId "([^"]*)"/)[1], appId);
  assert.equal(gradle.match(/namespace = "([^"]*)"/)[1], appId);
  const activityPfad = `android/app/src/main/java/${appId.replace(/\./g, '/')}/MainActivity.java`;
  assert.match(lies(activityPfad), new RegExp(`^package ${appId.replace(/\./g, '\\.')};`, 'm'));
});
