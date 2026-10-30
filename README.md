# Veni Vidi Didici

A Latin vocabulary trainer for Android (Capacitor) and the browser, written in
plain HTML/CSS/JavaScript without a framework. The user interface is in German.

- Latin → German quizzing: the app shows the lemma, and you enter all forms
  (genitive, gender, principal parts, …) plus the German meanings, either
  by typing or by speech input.
- Required and optional meanings: "MUSS" meanings must be given, "KANN"
  meanings may be given.
- Follow-up questions for incomplete answers instead of revealing the
  solution right away.
- Quiz by lesson or up to a given point in the list, either uniformly or
  weighted (words you often get wrong come up more often).
- Configurable choice of which forms are quizzed.
- In-app editor, plus export/import of profile and vocabulary.

## Vocabulary

The repository contains only a small example vocabulary
(`www/assets/vokabeln.beispiel.json`). Put your own vocabulary in
`www/assets/vokabeln.json` (same format; ignored by Git). If that file is
missing, the app starts with the example.

On every start, the app compares its stored vocabulary with the shipped file,
so corrections and new words in an app update reach installed apps: new
words are added, changed words are updated (progress is kept), and words
removed from the file are removed. Words edited, deleted or created in the
app's editor are left as they are. Keep the IDs of existing words stable: a
word whose ID now belongs to a different Latin word loses its progress.

## Development

```sh
npm install
npm run serve   # http://localhost:8567/
npm test        # Node's built-in test runner, no extra dependencies
```

Without `www/assets/vokabeln.json`, the data tests run against the example
vocabulary.

## Android APK

Requirements: Android SDK and Java 21 (`tools/apk.sh` looks in `~/.jdks` and
`/usr/lib/jvm` if `JAVA_HOME` does not point to a Java 21).

1. Bump the version in `package.json` (the single source of the version).
2. `npm run apk` – syncs the version, copies `www/` into the Android project
   and builds the debug APK at
   `android/app/build/outputs/apk/debug/app-debug.apk`.

Debug APKs are signed with `~/.android/debug.keystore`. Updates can only be
installed over an existing app if they are signed with the same key, so back
that file up.
