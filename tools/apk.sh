#!/usr/bin/env bash
# Builds the test APK: sync the version, copy the web files into the Android
# project, debug build. Output:
#   android/app/build/outputs/apk/debug/app-debug.apk
#
# Capacitor 8 requires Java 21. If JAVA_HOME does not point to a Java 21,
# one is looked up in ~/.jdks (where Android Studio puts downloaded JDKs)
# and /usr/lib/jvm.
set -euo pipefail
cd "$(dirname "$0")/.."

java_major() { "$1/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/'; }

if [ -z "${JAVA_HOME:-}" ] || [ "$(java_major "$JAVA_HOME")" != "21" ]; then
  JAVA_HOME=""
  for kandidat in "$HOME"/.jdks/*21* /usr/lib/jvm/*21*; do
    if [ -x "$kandidat/bin/java" ] && [ "$(java_major "$kandidat")" = "21" ]; then
      JAVA_HOME="$kandidat"
      break
    fi
  done
  if [ -z "$JAVA_HOME" ]; then
    echo "No Java 21 found - install one or point JAVA_HOME to it." >&2
    exit 1
  fi
  export JAVA_HOME
fi
echo "Java: $JAVA_HOME"

node tools/version-sync.js
npx cap sync android
(cd android && ./gradlew assembleDebug)
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
