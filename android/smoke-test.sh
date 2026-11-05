#!/usr/bin/env bash
# Optional CI-only Android 14 emulator check. No credentials or signing material.
set -euo pipefail
SDK="${ANDROID_HOME:?ANDROID_HOME is required}"
ADB="$SDK/platform-tools/adb"
mkdir -p android/artifacts/smoke
printf '%s\n' 'PENDING: real system audio picker, decoding, progress and pause checks have not run.' > android/artifacts/smoke/music-result.txt
# Both command-line tools must resolve the same AVD directory. Runner defaults
# can otherwise create the AVD in a directory the emulator does not search.
export ANDROID_USER_HOME="${RUNNER_TEMP:-/tmp}/nau-android-user"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
unset ANDROID_SDK_HOME
mkdir -p "$ANDROID_AVD_HOME"
"$SDK/cmdline-tools/latest/bin/sdkmanager" 'emulator' 'platform-tools' 'system-images;android-34;google_apis;x86_64'
printf 'no\n' | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd --name nau-smoke --package 'system-images;android-34;google_apis;x86_64' --device pixel_6 --path "$ANDROID_AVD_HOME/nau-smoke.avd" --force
if [[ ! -s "$ANDROID_AVD_HOME/nau-smoke.ini" ]]; then
  printf '%s\n' 'FAIL: avdmanager did not create the emulator AVD locator.' > android/artifacts/smoke/result.txt
  exit 1
fi
if [[ -e /dev/kvm ]]; then sudo chmod 666 /dev/kvm; fi
"$SDK/emulator/emulator" -avd nau-smoke -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect > android/artifacts/smoke/emulator.log 2>&1 &
EMULATOR_PID=$!
cleanup() {
  local exit_status=$?
  local result_line=''
  if [[ -s android/artifacts/smoke/result.txt ]]; then
    IFS= read -r result_line < android/artifacts/smoke/result.txt || true
  fi
  if [[ "$exit_status" -ne 0 && "$result_line" != FAIL:* && "$result_line" != PASS:* ]]; then
    printf '%s\n' "FAIL: smoke test exited before all reading and Back checks completed (status $exit_status). See emulator.log and logcat.txt." > android/artifacts/smoke/result.txt
  elif [[ ! -s android/artifacts/smoke/result.txt ]]; then
    printf '%s\n' "FAIL: smoke test exited before UI verification (status $exit_status). See emulator.log and logcat.txt." > android/artifacts/smoke/result.txt
  fi
  local music_line=''
  IFS= read -r music_line < android/artifacts/smoke/music-result.txt || true
  if [[ "$exit_status" -ne 0 && "$music_line" != FAIL:* && "$music_line" != PASS:* ]]; then
    printf '%s\n' "FAIL: music smoke exited before picker, playback, progress and pause were verified (status $exit_status). See emulator.log and logcat.txt." > android/artifacts/smoke/music-result.txt
  fi
  # logcat otherwise waits forever when a failed emulator never comes online.
  timeout --kill-after=3s 10s "$ADB" logcat -d > android/artifacts/smoke/logcat.txt 2>&1 || true
  timeout --kill-after=3s 10s "$ADB" exec-out screencap -p > android/artifacts/smoke/screenshot.png 2>/dev/null || true
  timeout --kill-after=3s 10s "$ADB" emu kill >/dev/null 2>&1 || true
  kill "$EMULATOR_PID" 2>/dev/null || true
  return "$exit_status"
}
trap cleanup EXIT
BOOT_DEADLINE=$((SECONDS + 240))
timeout --kill-after=3s 120s "$ADB" wait-for-device
for attempt in $(seq 1 180); do
  if ((SECONDS >= BOOT_DEADLINE)); then break; fi
  if [[ "$(timeout --kill-after=1s 5s "$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then break; fi
  sleep 2
done
test "$(timeout --kill-after=1s 5s "$ADB" shell getprop sys.boot_completed | tr -d '\r')" = 1
for animation_scale in window_animation_scale transition_animation_scale animator_duration_scale; do
  timeout --kill-after=1s 5s "$ADB" shell settings put global "$animation_scale" 0
done
timeout --kill-after=1s 10s "$ADB" shell input keyevent 82
timeout --kill-after=3s 60s "$ADB" install -r "${APK_PATH:?APK_PATH is required}"
# Disable radios before launch so the automatic offline fallback is exercised.
timeout --kill-after=1s 10s "$ADB" shell svc wifi disable
timeout --kill-after=1s 10s "$ADB" shell svc data disable
timeout --kill-after=1s 10s "$ADB" shell cmd connectivity airplane-mode enable
test "$(timeout --kill-after=1s 5s "$ADB" shell settings get global airplane_mode_on | tr -d '\r')" = 1
# A virtual Ethernet route can survive radio/airplane settings on some runners.
# Block WebView HTTP(S) with the Android system proxy pointing to a closed local
# port before creating the first WebView. Keep the app's default online startup:
# it must fail and switch itself to the packaged guide; do not tap “内置”.
# Android's HTTP_PROXY setting is a host:port pair; browsers use this proxy.
# https://developer.android.com/reference/android/provider/Settings.Global#HTTP_PROXY
# https://developer.android.com/studio/run/emulator-networking-proxy
timeout --kill-after=1s 5s "$ADB" shell settings put global http_proxy 127.0.0.1:1
PROXY_SETTING=$(timeout --kill-after=1s 5s "$ADB" shell settings get global http_proxy | tr -d '\r')
test "$PROXY_SETTING" = '127.0.0.1:1'
printf '%s\n' 'airplane_mode_on=1' "http_proxy=$PROXY_SETTING" 'mode=proxy-blocked default online startup; automatic fallback required' > android/artifacts/smoke/network-conditions.txt
sleep 2
timeout --kill-after=3s 45s "$ADB" shell am start -W -n cn.nau.mpacc.guide/.MainActivity
export EXPECTED_MENTOR
EXPECTED_MENTOR=$(python3 -c "import json; print(json.load(open('dist/data/site-data.json'))['mentors'][0]['name'])")
SCREEN_SIZE=$(timeout --kill-after=1s 5s "$ADB" shell wm size | tr -d '\r' | sed -nE 's/.*size: ([0-9]+)x([0-9]+).*/\1 \2/p' | tail -n 1)
read -r SCREEN_WIDTH SCREEN_HEIGHT <<< "$SCREEN_SIZE"
test "${SCREEN_WIDTH:-0}" -gt 0
test "${SCREEN_HEIGHT:-0}" -gt 0
export SCREEN_WIDTH SCREEN_HEIGHT
SWIPE_X=$((SCREEN_WIDTH / 2))
SWIPE_START=$((SCREEN_HEIGHT * 78 / 100))
SWIPE_END=$((SCREEN_HEIGHT * 45 / 100))

dump_ui() {
  local remaining command_limit
  # A failed dump must not reuse a previous frame and accidentally pass.
  rm -f android/artifacts/smoke/ui.xml
  remaining=$((UI_DEADLINE - SECONDS))
  if ((remaining <= 0)); then return; fi
  command_limit=$((remaining < 3 ? remaining : 3))
  timeout --kill-after=1s "${command_limit}s" "$ADB" shell rm -f /sdcard/nau-ui.xml >/dev/null 2>&1 || true
  remaining=$((UI_DEADLINE - SECONDS))
  if ((remaining <= 0)); then return; fi
  command_limit=$((remaining < 20 ? remaining : 20))
  timeout --kill-after=1s "${command_limit}s" "$ADB" shell uiautomator dump /sdcard/nau-ui.xml >/dev/null 2>&1 || true
  remaining=$((UI_DEADLINE - SECONDS))
  if ((remaining <= 0)); then return; fi
  command_limit=$((remaining < 15 ? remaining : 15))
  timeout --kill-after=1s "${command_limit}s" "$ADB" pull /sdcard/nau-ui.xml android/artifacts/smoke/ui.xml >/dev/null 2>&1 || true
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
launcher_anr = any(n.get('package') == 'android'
                   and n.get('resource-id') == 'android:id/alertTitle'
                   and n.get('text') == "Pixel Launcher isn't responding"
                   and bounds(n) for n in nodes)
close_launcher = next((bounds(n) for n in nodes
                       if n.get('package') == 'android'
                       and n.get('resource-id') == 'android:id/aerr_close'
                       and n.get('text') == 'Close app'
                       and n.get('clickable') == 'true'
                       and n.get('enabled') == 'true' and bounds(n)), None)
if launcher_anr and close_launcher:
    print('CLOSE_LAUNCHER', (close_launcher[0]+close_launcher[2])//2,
          (close_launcher[1]+close_launcher[3])//2)
elif launcher_anr:
    print('WAIT')
elif offline and mentor:
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
launcher_dialog_closes=0
UI_DEADLINE=$((SECONDS + 180))
for attempt in $(seq 1 45); do
  if ((SECONDS >= UI_DEADLINE)); then break; fi
  dump_ui
  read -r STATE TAP_X TAP_Y <<< "$(ui_state)"
  if [[ "$STATE" == PASS ]]; then passed=true; break; fi
  if ((SECONDS >= UI_DEADLINE)); then break; fi
  if [[ "$STATE" == CLOSE_LAUNCHER ]]; then
    if ((launcher_dialog_closes >= 3)); then
      printf '%s\n' 'FAIL: Pixel Launcher system ANR remained after three close attempts.' > android/artifacts/smoke/result.txt
      break
    fi
    launcher_dialog_closes=$((launcher_dialog_closes + 1))
    cp android/artifacts/smoke/ui.xml "android/artifacts/smoke/launcher-anr-$launcher_dialog_closes.xml"
    timeout --kill-after=1s 3s "$ADB" shell input tap "$TAP_X" "$TAP_Y" || true
  elif [[ "$STATE" == NAV && "$navigation_tapped" == false ]]; then
    timeout --kill-after=1s 3s "$ADB" shell input tap "$TAP_X" "$TAP_Y" || true
    navigation_tapped=true
  elif [[ "$STATE" != WAIT ]]; then
    # Heading, notice, search and filters can still hide the first mentor after
    # anchor navigation. Advance by a third of the screen without resetting it.
    timeout --kill-after=1s 3s "$ADB" shell input swipe "$SWIPE_X" "$SWIPE_START" "$SWIPE_X" "$SWIPE_END" 400 || true
  fi
  remaining=$((UI_DEADLINE - SECONDS))
  if ((remaining > 0)); then sleep "$((remaining < 2 ? remaining : 2))"; fi
done
if [[ "$passed" != true ]]; then
  if [[ ! -s android/artifacts/smoke/result.txt ]]; then
    printf '%s\n' "FAIL: offline mode plus visible dynamic mentor '$EXPECTED_MENTOR' was not reached within the 180-second UI budget." > android/artifacts/smoke/result.txt
  fi
  exit 1
fi
printf '%s\n' 'PENDING: offline mentor rendered; checking Android Back behavior next.' > android/artifacts/smoke/result.txt
# Keep the reading proof before later Back checks leave the activity.
cp android/artifacts/smoke/ui.xml android/artifacts/smoke/mentor-visible.xml
timeout --kill-after=3s 10s "$ADB" exec-out screencap -p > android/artifacts/smoke/mentor-visible.png

back_ui_state() {
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
def visible(node):
    a = list(map(int, re.findall(r'-?\d+', node.get('bounds', ''))))
    if len(a) != 4:
        return None
    a = [max(0, a[0]), max(0, a[1]), min(int(os.environ['SCREEN_WIDTH']), a[2]), min(int(os.environ['SCREEN_HEIGHT']), a[3])]
    return a if a[2] > a[0] and a[3] > a[1] else None
def label(node):
    return node.get('text', '') + ' ' + node.get('content-desc', '')
close = next((n for n in nodes if '关闭详情' in label(n) and visible(n)), None)
offline = any('内置资料' in label(n) and visible(n) for n in nodes)
mentor = any(os.environ['EXPECTED_MENTOR'] in label(n) and visible(n) for n in nodes)
if os.environ['BACK_STAGE'] == 'open':
    if close is not None and mentor:
        print('OPEN')
    else:
        action = next((visible(n) for n in nodes if '查看资料与反馈' in label(n)
                       and os.environ['EXPECTED_MENTOR'] in label(n) and visible(n)), None)
        if action:
            print('TAP', (action[0]+action[2])//2, (action[1]+action[3])//2)
        else:
            print('SCROLL')
else:
    print('CLOSED' if offline and mentor and close is None else 'WAIT')
PY
}

export BACK_STAGE=open
UI_DEADLINE=$((SECONDS + 70))
dialog_open=false
for attempt in $(seq 1 18); do
  if ((SECONDS >= UI_DEADLINE)); then break; fi
  dump_ui
  read -r STATE TAP_X TAP_Y <<< "$(back_ui_state)"
  if [[ "$STATE" == OPEN ]]; then dialog_open=true; break; fi
  if [[ "$STATE" == TAP ]]; then
    timeout --kill-after=1s 3s "$ADB" shell input tap "$TAP_X" "$TAP_Y"
  else
    timeout --kill-after=1s 3s "$ADB" shell input swipe "$SWIPE_X" "$SWIPE_START" "$SWIPE_X" "$((SCREEN_HEIGHT * 60 / 100))" 350
  fi
  sleep 1
done
if [[ "$dialog_open" != true ]]; then
  printf '%s\n' 'FAIL: could not open the visible mentor details for the Back check.' > android/artifacts/smoke/result.txt
  exit 1
fi
cp android/artifacts/smoke/ui.xml android/artifacts/smoke/dialog-open.xml
timeout --kill-after=3s 10s "$ADB" exec-out screencap -p > android/artifacts/smoke/dialog-open.png

timeout --kill-after=1s 5s "$ADB" shell input keyevent 4
export BACK_STAGE=closed
UI_DEADLINE=$((SECONDS + 35))
dialog_closed=false
for attempt in $(seq 1 10); do
  if ((SECONDS >= UI_DEADLINE)); then break; fi
  dump_ui
  if [[ "$(back_ui_state)" == CLOSED ]]; then dialog_closed=true; break; fi
  sleep 1
done
if [[ "$dialog_closed" != true ]]; then
  printf '%s\n' 'FAIL: Android Back did not close mentor details while retaining the offline guide.' > android/artifacts/smoke/result.txt
  exit 1
fi
cp android/artifacts/smoke/ui.xml android/artifacts/smoke/dialog-closed.xml
timeout --kill-after=3s 10s "$ADB" exec-out screencap -p > android/artifacts/smoke/dialog-closed.png

# The mentor hash can add one history entry. More than three Back presses would
# indicate a failed-online/fallback loop rather than ordinary page navigation.
exited=false
for attempt in $(seq 1 3); do
  timeout --kill-after=1s 5s "$ADB" shell input keyevent 4
  sleep 2
  timeout --kill-after=2s 10s "$ADB" shell dumpsys activity activities > android/artifacts/smoke/activity-after-back.txt
  if python3 - <<'PY'
from pathlib import Path
text = Path('android/artifacts/smoke/activity-after-back.txt').read_text()
resumed = [line for line in text.splitlines() if 'mResumedActivity' in line or 'topResumedActivity=' in line]
assert resumed and not any('cn.nau.mpacc.guide/' in line for line in resumed)
PY
  then exited=true; break; fi
done
if [[ "$exited" != true ]]; then
  printf '%s\n' 'FAIL: Android Back remained inside the guide after three presses; possible fallback history loop.' > android/artifacts/smoke/result.txt
  exit 1
fi
printf '%s\n' 'PASS: Android 14 proxy-blocked online startup switched automatically to packaged data, rendered a mentor, closed details with Back, and exited without a fallback history loop.' > android/artifacts/smoke/result.txt

# Keep the original reading/Back suite above intact. Independently restart and
# exercise the real Android DocumentsUI picker; no commercial recording is used.
python3 - <<'PY'
from pathlib import Path
import math
import struct
import wave
target = Path('android/artifacts/smoke/寻.wav')
with wave.open(str(target), 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(16000)
    audio.writeframes(b''.join(struct.pack('<h', int(1600 * math.sin(2*math.pi*220*n/16000))) for n in range(30*16000)))
PY
timeout --kill-after=2s 15s "$ADB" push android/artifacts/smoke/寻.wav /sdcard/Download/寻.wav >/dev/null
timeout --kill-after=1s 5s "$ADB" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file:///sdcard/Download/%E5%AF%BB.wav' >/dev/null
timeout --kill-after=3s 45s "$ADB" shell am start -W -n cn.nau.mpacc.guide/.MainActivity
MUSIC_DEADLINE=$((SECONDS + 180))
export MUSIC_FILE_TAPPED=false MUSIC_PLAY_TAPPED=false MUSIC_DRAWER_TAPS=0

music_stage() {
  local stage="$1" expected="$2" budget="$3" state tap_x tap_y remaining
  UI_DEADLINE=$((SECONDS + budget))
  if ((UI_DEADLINE > MUSIC_DEADLINE)); then UI_DEADLINE=$MUSIC_DEADLINE; fi
  for attempt in $(seq 1 24); do
    if ((SECONDS >= UI_DEADLINE)); then break; fi
    dump_ui
    read -r state tap_x tap_y <<< "$(python3 android/music-smoke-state.py "$stage")"
    if [[ "$state" == "$expected" ]]; then return 0; fi
    if ((SECONDS >= UI_DEADLINE)); then break; fi
    case "$state" in
      ERROR) break ;;
      CLOSE_LAUNCHER)
        if ((launcher_dialog_closes >= 3)); then break; fi
        launcher_dialog_closes=$((launcher_dialog_closes + 1))
        cp android/artifacts/smoke/ui.xml "android/artifacts/smoke/launcher-anr-$launcher_dialog_closes.xml"
        timeout --kill-after=1s 3s "$ADB" shell input tap "$tap_x" "$tap_y"
        ;;
      TAP|FILE|CONFIRM|DOWNLOADS|DRAWER)
        timeout --kill-after=1s 3s "$ADB" shell input tap "$tap_x" "$tap_y"
        if [[ "$stage" == play && "$state" == TAP ]]; then export MUSIC_PLAY_TAPPED=true; fi
        if [[ "$state" == FILE ]]; then export MUSIC_FILE_TAPPED=true; fi
        if [[ "$state" == DRAWER ]]; then export MUSIC_DRAWER_TAPS=$((MUSIC_DRAWER_TAPS + 1)); fi
        ;;
      SCROLL)
        timeout --kill-after=1s 3s "$ADB" shell input swipe "$SWIPE_X" "$SWIPE_START" "$SWIPE_X" "$SWIPE_END" 350
        ;;
      SCROLL_UP)
        timeout --kill-after=1s 3s "$ADB" shell input swipe "$SWIPE_X" "$SWIPE_END" "$SWIPE_X" "$SWIPE_START" 350
        ;;
    esac
    remaining=$((UI_DEADLINE - SECONDS))
    if ((remaining > 0)); then sleep 1; fi
  done
  printf '%s\n' "FAIL: music phase '$stage' did not reach '$expected' within its bounded UI budget (last state: ${state:-none})." > android/artifacts/smoke/music-result.txt
  return 1
}

music_proof() {
  cp android/artifacts/smoke/ui.xml "android/artifacts/smoke/$1.xml"
  timeout --kill-after=2s 8s "$ADB" exec-out screencap -p > "android/artifacts/smoke/$1.png"
}

music_stage nav READY 45
music_proof music-visible
music_stage picker PICKER 25
music_proof audio-picker
music_stage file LOADED 45
music_stage play PLAYING 40
music_proof local-audio-playing
# Opening another picker leaves the reader and must pause audio. Back cancels
# that new callback and retains the earlier session file without auto-playing it.
music_stage picker PICKER 25
timeout --kill-after=1s 5s "$ADB" shell input keyevent 4
music_stage cancelled PAUSED 30
music_proof local-audio-paused-after-cancel
printf '%s\n' 'PASS: Android 14 offline music rendered 19 tracks, selected the generated local QA WAV through the system audio picker, decoded it and advanced playback time, then paused and retained the session file after cancelling a second picker. No user recording was used or uploaded.' > android/artifacts/smoke/music-result.txt
