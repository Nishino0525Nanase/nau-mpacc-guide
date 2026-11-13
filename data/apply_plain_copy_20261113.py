#!/usr/bin/env python3
"""Show short practical copy first; retain original evidence in disclosures."""
from copy import deepcopy
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/plain_copy_20261113'
SITE = ROOT / 'dist/data/site-data.json'
BATCH = 'plain-copy-20261113'


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def visible_text(block):
    kind = block.get('type')
    def text_of(value):
        if isinstance(value, dict):
            return str(value.get('text') or value.get('caption') or value.get('label') or '')
        if isinstance(value, list):
            return ''.join(text_of(item) for item in value)
        return str(value or '')
    if kind in ['toc', 'card']:
        return ''
    if kind == 'details':
        return block.get('text', '')
    if kind == 'table':
        return text_of([block.get('headers', [])] + block.get('rows', []))
    if kind in ['list', 'checklist']:
        return text_of(block.get('title')) + text_of(block.get('items', []))
    return text_of(block.get('title')) + text_of(block.get('text')) + text_of(block.get('items', []))


def reader_chars(blocks):
    text = ''.join(visible_text(block) for block in blocks)
    return len(re.sub(r'\[[A-Z]+\d+\]|\s+', '', text))


def main():
    data = read(SITE)
    protected = {key: deepcopy(value) for key, value in data.items() if key not in ['lifeChapters', 'lifeIntro', 'studentStart']}
    drafts = [chapter for name in ['life-01-07', 'life-study-money', 'life-campus-climate']
              for chapter in read(INPUT / (name + '.json'))['chapters']]
    drafts.append({'id': 'life-12', 'title': '第十二章 资料出处', 'blocks': [
        {'type': 'p', 'text': '正文里的编号可以直接点开出处。'},
        {'type': 'table', 'headers': ['要找什么', '入口'], 'rows': [
            ['帖子、访谈', '顶部“原帖索引”，可按关键词查。'],
            ['照片、地图', '生活页“图片索引”，或各章的照片折叠。'],
            ['全部资料条目', '展开下方“全部资料出处”。'],
        ]},
    ]})
    assert len(drafts) == 16 and len({c['id'] for c in drafts}) == 16
    changes = []
    for draft in drafts:
        chapter = next(c for c in data['lifeChapters'] if c['id'] == draft['id'])
        original = []
        for block in chapter['blocks']:
            if block.get('readingArchive'):
                original.extend(deepcopy(block['blocks']))
            elif block.get('plainCopyBatch') != BATCH:
                original.append(deepcopy(block))
        assert original, draft['id']
        chapter.setdefault('originalTitle', chapter['title'])
        chapter['title'], chapter['concise'] = draft['title'], True
        blocks = deepcopy(draft['blocks'])
        if draft['id'] == 'life-13':
            # The applicable bill still depends on the actual allocated room.
            row = next(row for block in blocks if block['type'] == 'table' for row in block['rows'] if row[0] == '住宿')
            row[1] = '公示有1000／1200／1500元/年等档次，按本人分配房型和账单；非全日制不安排住宿。[F11][F04]'
        if draft['id'] == 'life-14':
            chapter['title'] = '第十四章 日常照顾与求助'
        for block in blocks:
            block['plainCopyBatch'] = BATCH
        archive = {'type': 'details', 'text': '全部资料出处' if draft['id'] == 'life-12' else '详细资料与原文',
            'readingArchive': True, 'plainCopyBatch': BATCH, 'blocks': original}
        before_blocks = original
        if draft['id'] == 'life-09':
            before_blocks = [b for b in original if b.get('placement') == 'before-internships']
        changes.append({'id': chapter['id'], 'before': reader_chars(before_blocks), 'after': reader_chars(blocks),
                        'retainedOriginalBlocks': len(original)})
        chapter['blocks'] = blocks + [archive]

    data['lifeIntro'] = [{'type': 'p', 'text': '南审MPAcc的住宿、吃饭、出行、课程和费用。先看简表，需要时再展开照片和详细资料。', 'sourceCodes': []}]
    data['studentStart'] = {
        'title': '入学清单', 'intro': '',
        'phases': [
            {'id': 'before', 'label': '到校前', 'summary': '', 'tasks': [
                {'title': '报到材料', 'text': '证件、档案要求和报到点。', 'chapterId': 'life-02'},
                {'title': '住宿用品', 'text': '先带第一晚要用的，床垫等分房后量尺寸。', 'chapterId': 'life-03'},
                {'title': '缴费', 'text': '核对学费和住宿账单。', 'chapterId': 'life-13'},
                {'title': '行程', 'text': '确认校门、最后一段交通和晚到入住。', 'chapterId': 'life-06'},
            ]},
            {'id': 'night', 'label': '入住当天', 'summary': '', 'tasks': [
                {'title': '寝室', 'text': '核对床位，检查门锁和漏水。', 'chapterId': 'life-03'},
                {'title': '包裹', 'text': '沁园大件先问推车或预约搬运。', 'chapterId': 'life-04'},
                {'title': '吃饭', 'text': '找宿舍附近正在营业的食堂。', 'chapterId': 'life-05'},
                {'title': '室友', 'text': '商量关灯、闹钟、通话和卫生。', 'chapterId': 'life-03'},
            ]},
            {'id': 'week', 'label': '第一周', 'summary': '', 'tasks': [
                {'title': '路线', 'text': '走一次教室、食堂和图书馆。', 'chapterId': 'life-16'},
                {'title': '网络和洗衣', 'text': '试用本楼设备，存好报修入口。', 'chapterId': 'life-04'},
                {'title': '就医', 'text': '存卫生所电话，查本人参保情况。', 'chapterId': 'life-10'},
                {'title': '日程', 'text': '记下选课、缴费和交材料日期。', 'chapterId': 'life-11'},
            ]},
            {'id': 'year', 'label': '研一', 'summary': '', 'tasks': [
                {'title': '课程', 'text': '照本级培养方案排课和考试。', 'chapterId': 'life-08'},
                {'title': '导师', 'text': '问研究内容、沟通方式和论文反馈。', 'chapterId': 'life-08'},
                {'title': '实习', 'text': '先对课表、出勤和学校实践认定。', 'chapterId': 'life-09'},
                {'title': '奖助', 'text': '看资格和截止日期，再交材料。', 'chapterId': 'life-13'},
            ]},
        ],
        'quickLinks': [{'label': label, 'chapterId': chapter_id} for label, chapter_id in [
            ('宿舍', 'life-03'), ('吃饭', 'life-05'), ('出行', 'life-06'), ('天气', 'life-15'),
            ('学费奖助', 'life-13'), ('课程', 'life-08'), ('实习', 'life-09'), ('就医', 'life-10'),
            ('电话', 'life-11'), ('学校', 'life-16'),
        ]],
    }
    def sync(block):
        if block.get('readingArchive'):
            # Keep the original text and metadata intact.
            return
        text = json.dumps({k: v for k, v in block.items() if k != 'sourceCodes'}, ensure_ascii=False)
        block['sourceCodes'] = list(dict.fromkeys(re.findall(r'\[([A-Z]+\d+)\]', text)))
        assert all(code in data['sourceRegistry'] for code in block['sourceCodes'])
    for chapter in data['lifeChapters']:
        for block in chapter['blocks']:
            sync(block)
        chapter['sourceCodes'] = list(dict.fromkeys(re.findall(r'\[([A-Z]+\d+)\]', json.dumps(chapter['blocks'], ensure_ascii=False))))
    for key, value in protected.items():
        assert data[key] == value, key
    write(SITE, data)
    report = {'batch': BATCH, 'chapters': changes,
        'measurement': 'Default chapter text only; excludes images, navigation, internship hub and source directory.',
        'before': sum(c['before'] for c in changes if c['id'] != 'life-12'),
        'after': sum(c['after'] for c in changes if c['id'] != 'life-12'),
        'sourceRegistryChanged': False, 'originalImagesChanged': False, 'originalChapterTextRetained': True}
    report['reductionPercent'] = round(100 * (1 - report['after'] / report['before']))
    write(INPUT / 'merge-report.json', report)
    print(json.dumps({k: v for k, v in report.items() if k != 'chapters'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
