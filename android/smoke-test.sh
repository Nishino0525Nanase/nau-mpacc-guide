#!/usr/bin/env bash
# Optional CI-only Android 14 emulator check. No credentials or signing material.
set -euo pipefail
SDK="${ANDROID_HOME:?ANDROID_HOME is required}"
ADB="$SDK/platform-tools/adb"
mkdir -p android/artifacts/smoke
"$SDK/cmdline-tools/latest/bin/sdkmanager" 'emulator' 'platform-tools' 'system-images;android-34;google_apis;x86_64'
printf 'no\n' | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd --name nau-smoke --package 'system-images;android-34;google_apis;x86_64' --device pixel_6 --force
if [[ -e /dev/kvm ]]; then sudo chmod 666 /dev/kvm; fi
"$SDK/emulator/emulator" -avd nau-smoke -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect > android/artifacts/smoke/emulator.log 2>&1 &
EMULATOR_PID=$!
cleanup() {
  "$ADB" logcat -d > android/artifacts/smoke/logcat.txt 2>&1 || true
  "$ADB" exec-out screencap -p > android/artifacts/smoke/screenshot.png 2>/dev/null || true
  "$ADB" emu kill >/dev/null 2>&1 || true
  kill "$EMULATOR_PID" 2>/dev/null || true
}
trap cleanup EXIT
timeout 360 "$ADB" wait-for-device
for attempt in $(seq 1 180); do
  if [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then break; fi
  sleep 2
done
test "$("$ADB" shell getprop sys.boot_completed | tr -d '\r')" = 1
"$ADB" shell input keyevent 82
"$ADB" install -r "${APK_PATH:?APK_PATH is required}"
# Disable radios before launch so the automatic offline fallback is exercised.
"$ADB" shell svc wifi disable
"$ADB" shell svc data disable
"$ADB" shell cmd connectivity airplane-mode enable
test "$("$ADB" shell settings get global airplane_mode_on | tr -d '\r')" = 1
"$ADB" shell am start -W -n cn.nau.mpacc.guide/.MainActivity
export EXPECTED_MENTOR
EXPECTED_MENTOR=$(python3 -c "import json; print(json.load(open('dist/data/site-data.json'))['mentors'][0]['name'])")
SCREEN_SIZE=$("$ADB" shell wm size | tr -d '\r' | sed -nE 's/.*size: ([0-9]+)x([0-9]+).*/\1 \2/p' | tail -n 1)
read -r SCREEN_WIDTH SCREEN_HEIGHT <<< "$SCREEN_SIZE"
test "${SCREEN_WIDTH:-0}" -gt 0
test "${SCREEN_HEIGHT:-0}" -gt 0
export SCREEN_WIDTH SCREEN_HEIGHT
SWIPE_X=$((SCREEN_WIDTH / 2))
SWIPE_START=$((SCREEN_HEIGHT * 78 / 100))
SWIPE_END=$((SCREEN_HEIGHT * 45 / 100))

dump_ui() {
  # A failed dump must not reuse a previous frame and accidentally pass.
  rm -f android/artifacts/smoke/ui.xml
  "$ADB" shell rm -f /sdcard/nau-ui.xml >/dev/null 2>&1 || true
  timeout 20 "$ADB" shell uiautomator dump /sdcard/nau-ui.xml >/dev/null 2>&1 || true
  timeout 15 "$ADB" pull /sdcard/nau-ui.xml android/artifacts/smoke/ui.xml >/dev/null 2>&1 || true
}

ui_state() {
  python3 - <<'PY'
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path

p = Path('android/artifacts/smoke/ui.xml')
try:
    nodes = list(ET.parse(p).iter('node')) if p.exists() else []
except ET.ParseError:
    nodes = []

def bounds(node):
    points = list(map(int, re.findall(r'-?\d+', node.get('bounds', ''))))
    if len(points) != 4:
        return None
    points = [max(0, points[0]), max(0, points[1]),
              min(int(os.environ['SCREEN_WIDTH']), points[2]),
              min(int(os.environ['SCREEN_HEIGHT']), points[3])]
    return points if points[2] > points[0] and points[3] > points[1] else None

def label(node):
    return node.get('text', '') + ' ' + node.get('content-desc', '')

offline = any('内置资料' in label(n) and bounds(n) for n in nodes)
mentor = any(os.environ['EXPECTED_MENTOR'] in label(n) and bounds(n) for n in nodes)
if offline and mentor:
    print('PASS')
elif not offline:
    print('WAIT')
else:
    # Only suggest the visible web navigation. The shell taps it at most once.
    nav = next((bounds(n) for n in nodes if '导师导览' in label(n) and bounds(n)), None)
    if nav:
        print('NAV', (nav[0]+nav[2])//2, (nav[1]+nav[3])//2)
    else:
        print('SCROLL')
PY
}

passed=false
navigation_tapped=false
for attempt in $(seq 1 45); do
  dump_ui
  read -r STATE TAP_X TAP_Y <<< "$(ui_state)"
  if [[ "$STATE" == PASS ]]; then passed=true; break; fi
  if [[ "$STATE" == NAV && "$navigation_tapped" == false ]]; then
    "$ADB" shell input tap "$TAP_X" "$TAP_Y"
    navigation_tapped=true
  elif [[ "$STATE" != WAIT ]]; then
    # Heading, notice, search and filters can still hide the first mentor after
    # anchor navigation. Advance by a third of the screen without resetting it.
    "$ADB" shell input swipe "$SWIPE_X" "$SWIPE_START" "$SWIPE_X" "$SWIPE_END" 400
  fi
  sleep 2
done
if [[ "$passed" != true ]]; then
  printf '%s\n' "FAIL: offline mode plus visible dynamic mentor '$EXPECTED_MENTOR' was not reached." > android/artifacts/smoke/result.txt
  exit 1
fi
printf '%s\n' 'PASS: Android 14 emulator launched offline and rendered a mentor from packaged JSON.' > android/artifacts/smoke/result.txt
