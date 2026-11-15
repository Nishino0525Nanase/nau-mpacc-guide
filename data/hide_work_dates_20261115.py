"""Remove maintenance dates from display text; preserve source dates and metadata.

Run after historical data merges and before refreshing downloadable indexes.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'dist/data/site-data.json'
REPORT = ROOT / 'data/hide_work_dates_20261115/data-cleanup.json'

REPLACEMENTS = {
    '2026-11-14复核2026-11-13保存的原网页截图：读到沙雪2025-04-04主评及同图原帖名单前两位；未重新访问原帖，未新增展开回复。':
        '原网页截图可见沙雪2025-04-04主评及同图原帖名单前两位；未展开的回复不在摘录范围内。',
    '保存的原网页截图可见该条顶层评论及原帖教师名单；2026-11-14本地复核，未重新访问原帖，未声称读完折叠回复。':
        '原网页截图可见该条顶层评论及原帖教师名单；折叠回复不在摘录范围内。',
    '2026-11-14本地复核2026-11-13保存的原网页截图，可见对应既有评论；仅补直接图证，不增加评论或独立来源，不改变已有评价等级。':
        '原网页截图可见本条评论；未展示的部分以原帖为准。',
    '以下链接与卡片教师页构成核实入口，统一访问日期为2026年11月5日。':
        '以下链接与卡片教师页构成核实入口。',
    '｜核验日期 2026年11月5日': '',
}


def clean_text(value):
    for old, new in REPLACEMENTS.items():
        value = value.replace(old, new)
    if value == '检索于2026-11-04':
        return '未标日期'
    value = value.replace('；检索于2026-11-04', '')
    value = value.replace('  检索于2026-11-04', '  未标日期')
    return value.replace(' 检索2026-11-04', '')


def main():
    data = json.loads(TARGET.read_text())
    changes = []

    def walk(value, path):
        if isinstance(value, dict):
            return {key: walk(item, path + [key]) for key, item in value.items()}
        if isinstance(value, list):
            return [walk(item, path + [index]) for index, item in enumerate(value)]
        if isinstance(value, str):
            cleaned = clean_text(value)
            if cleaned != value:
                changes.append({'path': path, 'before': value, 'after': cleaned})
            return cleaned
        return value

    cleaned = walk(data, [])
    if changes:
        TARGET.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2) + '\n')
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps({'changedFieldCount': len(changes), 'changes': changes,
            'preserved': ['original post/comment dates', 'policy dates and deadlines',
                          'capturedAt metadata', 'all evidence and review records']},
            ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'changedFields': len(changes)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
