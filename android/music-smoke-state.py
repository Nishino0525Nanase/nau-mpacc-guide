"""Read Android UI XML for the real system-picker music smoke test."""
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

source = Path('android/artifacts/smoke/ui.xml')
try:
    root = ET.parse(source).getroot()
    nodes = list(root.iter('node'))
except (FileNotFoundError, ET.ParseError):
    print('WAIT')
    raise SystemExit(0)

width, height = int(os.environ['SCREEN_WIDTH']), int(os.environ['SCREEN_HEIGHT'])


def label(node):
    return (node.get('text', '') + ' ' + node.get('content-desc', '')).strip()


def bounds(node):
    values = list(map(int, re.findall(r'-?\d+', node.get('bounds', ''))))
    if len(values) != 4:
        return None
    a, b, c, d = max(0, values[0]), max(0, values[1]), min(width, values[2]), min(height, values[3])
    return (a, b, c, d) if c > a and d > b else None


def matching(predicate):
    return next((node for node in nodes if predicate(node) and bounds(node)
                 and node.get('enabled', 'true') == 'true'), None)


def tap(node, action='TAP'):
    a, b, c, d = bounds(node)
    print(action, (a+c)//2, (b+d)//2)


def exact(text):
    return matching(lambda node: node.get('text', '') == text or node.get('content-desc', '') == text)


stage = sys.argv[1]
picker = any(node.get('package', '').endswith('documentsui') for node in nodes)
offline = matching(lambda node: '内置资料' in label(node)) is not None
import_button = exact('选择本机音频')
play_button = exact('播放本机音频：寻')
pause_button = exact('暂停：寻')
launcher_anr = matching(lambda node: node.get('package') == 'android'
                        and node.get('resource-id') == 'android:id/alertTitle'
                        and node.get('text') == "Pixel Launcher isn't responding")
close_launcher = matching(lambda node: node.get('package') == 'android'
                           and node.get('resource-id') == 'android:id/aerr_close'
                           and node.get('text') == 'Close app' and node.get('clickable') == 'true')
if launcher_anr is not None:
    tap(close_launcher, 'CLOSE_LAUNCHER') if close_launcher is not None else print('WAIT')
elif stage == 'nav':
    if offline and matching(lambda node: re.search(r'(?<!\d)19(?!\d)', label(node))) is not None and any('MUSIC / A SMALL BREAK' in label(node) for node in nodes):
        print('READY')
    elif not offline:
        print('WAIT')
    else:
        nav = matching(lambda node: (node.get('text') == '音乐小憩' or node.get('content-desc') == '音乐小憩')
                       and node.get('clickable') == 'true')
        if nav is not None:
            tap(nav)
        else:
            print('SCROLL')
elif stage == 'picker':
    if picker:
        print('PICKER')
    elif import_button is not None:
        tap(import_button)
    else:
        print('SCROLL')
elif stage == 'file':
    if not picker:
        print('LOADED' if offline else 'WAIT')
    else:
        select = matching(lambda node: node.get('resource-id', '').endswith('/action_menu_select')
                           or node.get('text', '') in ('Open', 'OPEN', 'Select', 'SELECT', '打开', '选择')
                           and node.get('clickable') == 'true')
        wav = exact('寻.wav')
        if os.environ.get('MUSIC_FILE_TAPPED') == 'true':
            tap(select, 'CONFIRM') if select is not None else print('WAIT')
        elif wav is not None:
            tap(wav, 'FILE')
        else:
            roots = any(node.get('resource-id', '').endswith('/roots_list') for node in nodes)
            downloads = matching(lambda node: node.get('text', '') in ('Downloads', '下载')
                                   and node.get('resource-id', '').endswith('/title'))
            drawer = matching(lambda node: node.get('content-desc', '') in ('Show roots', '显示根目录', 'Open navigation drawer', '显示导航抽屉'))
            if roots and downloads is not None:
                tap(downloads, 'DOWNLOADS')
            elif drawer is not None and int(os.environ.get('MUSIC_DRAWER_TAPS', '0')) < 2:
                tap(drawer, 'DRAWER')
            else:
                print('WAIT')
elif stage == 'play':
    status_playing = matching(lambda node: '正在播放：寻' in label(node)) is not None
    # Only the short QA track has a clock below 30 seconds; the real playlist
    # entries are all minutes long. Require time advancement, not a button tap.
    times = []
    for node in nodes:
        if not bounds(node):
            continue
        for minutes, seconds in re.findall(r'(?<!\d)(\d+):(\d{2})(?!\d)', label(node)):
            times.append(60*int(minutes) + int(seconds))
    advanced = any(1 <= value < 30 for value in times)
    if (status_playing or pause_button is not None) and advanced:
        print('PLAYING')
    elif play_button is not None and os.environ.get('MUSIC_PLAY_TAPPED') != 'true':
        tap(play_button)
    elif matching(lambda node: any(word in label(node) for word in ('无法播放', '播放失败', '不支持此音频'))) is not None:
        print('ERROR')
    elif play_button is None and pause_button is None:
        print('SCROLL_UP')
    else:
        print('WAIT')
elif stage == 'cancelled':
    paused = matching(lambda node: '已暂停' in label(node)) is not None
    if not picker and play_button is not None and paused:
        print('PAUSED')
    else:
        print('SCROLL_UP' if not picker and play_button is None else 'WAIT')
else:
    raise SystemExit('Unknown music smoke stage')
