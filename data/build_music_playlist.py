#!/usr/bin/env python3
"""Add the supplied 19-track playlist metadata. Dry-run unless --write.

Only descriptive tags and filename aliases are published. Audio bytes, lyrics,
artwork, private file locations and Library identifiers are never copied into
the website. --audio-dir optionally checks the supplied files with ffprobe.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import quote, urlencode, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/site-data.json'
ARTIST = '华晨宇'
BATCH = 'music-playlist-105'

# Descriptive metadata checked against the files supplied by the user. Order
# follows the two batches of 10 and 9 tracks, without claiming a platform order.
TRACKS = [
    ('world-zoo', '世界是个动物园', '异类', 237.0, '世界是个动物园-华晨宇-异类.mp3'),
    ('when-flowers-fall', '花落时相遇', '希忘Hope', 357.1, '花落时相遇-华晨宇-希忘Hope.mp3'),
    ('sunrise', '走，一起去看日出吧', '希忘Hope', 275.4, '走 一起去看日出吧-华晨宇-希忘Hope.mp3'),
    ('sea-of-wind', '风之海', '量变临界点', 304.4, '风之海-华晨宇-量变临界点.mp3'),
    ('bullfight-live', '斗牛', '华晨宇日出演唱会特辑', 361.1, '斗牛-华晨宇-华晨宇日出演唱会特辑.mp3'),
    ('asylum-live', '疯人院', '华晨宇日出演唱会特辑', 393.3, '疯人院-华晨宇-华晨宇日出演唱会特辑.mp3'),
    ('fearless', '肆无惧燥', '雪碧酷光灯', 172.5, '肆无惧燥-华晨宇-雪碧酷光灯.mp3'),
    ('jackdaw-boy', '寒鸦少年', '寒鸦少年', 315.2, '寒鸦少年-华晨宇-寒鸦少年.mp3'),
    ('everlasting-flame', '永不熄灭的火焰', '量变临界点', 340.0, '永不熄灭的火焰-华晨宇-量变临界点-45b692.mp3'),
    ('seek', '寻', '寻', 270.6, '寻-华晨宇-寻.mp3'),
    ('king-beggar-live', '国王与乞丐', '2016安徽卫视国剧盛典现场原音', 178.0, '国王与乞丐_华晨宇_2016安徽卫视国剧盛典现场原音.mp3'),
    ('bonfire-at-galaxy-end', '点燃银河尽头的篝火', '希忘Hope', 307.5, '点燃银河尽头的篝火-华晨宇-希忘Hope.mp3'),
    ('dust-in-fireworks', '烟火里的尘埃', '烟火里的尘埃', 321.4, '烟火里的尘埃-华晨宇-烟火里的尘埃.mp3'),
    ('flight-mode', '飞行模式', '希忘Hope', 265.8, '飞行模式-华晨宇-希忘Hope.mp3'),
    ('for-forever', 'For Forever', 'H', 280.7, 'For_Forever-华晨宇-H.mp3'),
    ('ordinary-life', '普通到不普通的人生', '量变临界点', 261.1, '普通到不普通的人生-华晨宇-量变临界点.mp3'),
    ('love-this-world', '好想爱这个世界啊', '好想爱这个世界啊', 258.8, '好想爱这个世界啊-华晨宇-好想爱这个世界啊.m4a'),
    ('toward-sun-live', '向阳而生', '华晨宇日出演唱会特辑', 702.6, '向阳而生-华晨宇-华晨宇日出演唱会特辑.mp3'),
    ('return', '好想我回来啊', '希忘Hope', 305.0, '好想我回来啊-华晨宇-希忘Hope (1).mp3'),
]


def digest(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def norm(value):
    return re.sub(r'[\W_]+', '', value.casefold(), flags=re.UNICODE)


def playlist():
    tracks = []
    for slug, title, album, duration, filename in TRACKS:
        live = '演唱会' in album or '现场' in album
        aliases = list(dict.fromkeys([filename] + [title + ext for ext in ('.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac')]))
        query = ARTIST + ' ' + title
        if live:
            query += ' ' + ('日出演唱会' if '日出演唱会' in album else '2016 国剧盛典 现场')
        tracks.append({
            'id': 'hcy-' + slug,
            'title': title,
            'artist': ARTIST,
            'album': album,
            'version': '现场版' if live else '专辑版',
            'durationSeconds': duration,
            'fileNameAliases': aliases,
            'listeningLinks': [{
                'label': 'QQ音乐搜索',
                'url': 'https://y.qq.com/n/ryqq_v2/search?' + urlencode({'w': query}, quote_via=quote),
                'type': 'search',
                'platform': 'QQ音乐',
                'versionNote': '平台搜索结果的可听状态与版本以其页面标注为准。',
            }],
        })
    return {
        'title': '音乐小憩',
        'subtitle': '雨诺自选 · 19首华晨宇',
        'ownerLabel': '雨诺自选',
        'artist': ARTIST,
        'intro': '读累了，挑一首歌，换个节奏。',
        'tracks': tracks,
        'totalDurationSeconds': round(sum(t['durationSeconds'] for t in tracks), 1),
    }


def verify_local(audio_dir):
    probe = shutil.which('ffprobe')
    if not probe:
        raise SystemExit('ffprobe is required only for --audio-dir verification')
    for _, title, album, duration, filename in TRACKS:
        path = audio_dir / filename
        if not path.is_file():
            raise SystemExit('A supplied playlist file is missing')
        info = json.loads(subprocess.check_output([
            probe, '-v', 'error', '-show_entries', 'format=duration:format_tags=title,artist,album',
            '-of', 'json', str(path),
        ]))['format']
        tags = info.get('tags', {})
        if tags.get('title') != title or tags.get('artist') != ARTIST or tags.get('album') != album:
            raise SystemExit('Supplied audio tag differs from the reviewed metadata')
        if round(float(info['duration']), 1) != duration:
            raise SystemExit('Supplied audio duration differs from the reviewed metadata')


def build(write=False, audio_dir=None):
    before = json.loads(DATA.read_text())
    data = deepcopy(before)
    music = playlist()
    errors = []
    tracks = music['tracks']
    if len(tracks) != 19 or len({t['id'] for t in tracks}) != 19:
        errors.append('Playlist ids/count are incomplete')
    aliases = {}
    for track in tracks:
        if track['artist'] != ARTIST or not track['title'] or not track['album']:
            errors.append('Missing descriptive music metadata')
        if not 0 < track['durationSeconds'] < 3600:
            errors.append('Implausible source duration')
        for alias in track['fileNameAliases']:
            if Path(alias).name != alias or '/' in alias or '\\' in alias:
                errors.append('A filename alias contains a file location')
            key = norm(Path(alias).stem)
            aliases.setdefault(key, set()).add(track['id'])
        for link in track['listeningLinks']:
            url = urlsplit(link['url'])
            if url.scheme != 'https' or url.hostname != 'y.qq.com' or url.path != '/n/ryqq_v2/search':
                errors.append('Unexpected platform route')
            if link['type'] != 'search':
                errors.append('Unverified direct track link')
    if any(len(ids) > 1 for ids in aliases.values()):
        errors.append('Ambiguous filename alias across playlist tracks')
    serialized = json.dumps(music, ensure_ascii=False)
    if any(marker in serialized for marker in ('/workspace/', 'libfile_', 'data:audio', 'base64', 'ghp_')):
        errors.append('Private file location or media/credential material in public metadata')
    if audio_dir is not None:
        verify_local(audio_dir)
    data['musicPlaylist'] = music
    old_without_music = {k: v for k, v in before.items() if k != 'musicPlaylist'}
    new_without_music = {k: v for k, v in data.items() if k != 'musicPlaylist'}
    if old_without_music != new_without_music:
        errors.append('Existing guide data changed')
    counts = {'mentors': len(data['mentors']), 'mentorCards': len(data['mentorCards']),
              'lifeChapters': len(data['lifeChapters']),
              'studentReviewRecords': sum(len(m['studentReviews']['reviews']) for m in data['mentors']),
              'internshipFirms': len(data['internships']['firms']),
              'internshipResources': sum(len(f['resources']) for f in data['internships']['firms']),
              'socialPosts': len(data['socialPosts']), 'officialEvidence': len(data['officialEvidence'])}
    expected = {'mentors': 34, 'mentorCards': 17, 'lifeChapters': 12, 'studentReviewRecords': 39,
                'internshipFirms': 12, 'internshipResources': 35, 'socialPosts': 114, 'officialEvidence': 182}
    if counts != expected:
        errors.append('An existing guide count changed')
    qa = {
        'ok': not errors, 'errors': errors, 'batch': BATCH, 'trackCount': len(tracks),
        'artistCount': len({t['artist'] for t in tracks}), 'albumCount': len({t['album'] for t in tracks}),
        'versionCounts': dict(Counter(t['version'] for t in tracks)),
        'totalDurationSeconds': music['totalDurationSeconds'], 'playlistSha256': digest(music),
        'existingGuideDataSha256': digest(new_without_music), 'existingGuideDataUnchanged': True,
        'preservedCounts': counts,
        'platformLinkCount': sum(len(t['listeningLinks']) for t in tracks),
        'platformLinksAreSearchesNotPlaybackGuarantees': True,
        'audioBytesPublished': False, 'lyricsPublished': False, 'artworkPublished': False,
        'privatePathsAndLibraryIdsPublished': False,
        'metadataSource': 'Reviewed tags and durations of the 19 user-supplied files; no full-track listening claim',
        'versionMethod': 'Files explicitly labelled as concert/live releases are现场版; other supplied album tags are专辑版, not a claim about physical recording location',
    }
    sources = {
        'batch': BATCH,
        'metadata': {'origin': '用户提供的19个音频文件', 'fields': ['title', 'artist', 'album', 'durationSeconds', 'filenameAliases'],
                     'verification': 'ffprobe tags/durations were checked against all supplied files',
                     'limits': '不从歌单推断个人心理或关系含义；元数据核对不等于完整试听或歌词分析。'},
        'platformEntries': [{
            'platform': 'QQ音乐', 'url': 'https://y.qq.com/n/ryqq_v2/search',
            'exampleUrl': tracks[9]['listeningLinks'][0]['url'],
            'requestFormat': 'HTTPS official search page with URL-encoded w keyword',
            'httpStatus': 200, 'pageTitleObserved': '搜索 - QQ音乐',
            'readingScope': '官方搜索HTML shell可读，旧ryqq搜索路径自动跳到ryqq_v2；关键词保留。未取得客户端曲目结果、版权可听状态或逐一现场版本确认。',
            'use': 'Only search entry links, no invented song ids, audio URLs or playback guarantee',
        }],
        'excludedEntry': {'platform': '网易云音乐', 'reason': '旧search/m直达路径在本次检查跳到404；泛用shell不足以确认旧hash搜索路径，未作为曲目入口。'},
    }
    if errors:
        print(json.dumps(qa, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    if write:
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        (ROOT / 'data/music-playlist-qa.json').write_text(json.dumps(qa, ensure_ascii=False, indent=2) + '\n')
        (ROOT / 'data/music-playlist-sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'write': write, **qa}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--audio-dir', type=Path, help='Optionally recheck supplied files locally; locations are never exported')
    args = parser.parse_args()
    build(args.write, args.audio_dir)
