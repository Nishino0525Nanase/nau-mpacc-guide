"""Merge the reviewed public-source batch without assigning unknown mentors."""
from collections import Counter
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / 'data/content_repair_20261114b'
TARGET = ROOT / 'dist/data/site-data.json'


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def merge(items, incoming, key='id', prepend=False):
    incoming = copy.deepcopy(incoming)
    ids = {item[key] for item in incoming}
    remaining = [item for item in items if item[key] not in ids]
    items[:] = incoming + remaining if prepend else remaining + incoming


def main():
    data = json.loads(TARGET.read_text())
    patch = json.loads((BATCH / 'verified-input.json').read_text())
    for source in patch['sources']:
        data['sourceRegistry'][source['code']] = copy.deepcopy(source)
    merge(data['socialPosts'], patch['socialPosts'], prepend=True)
    merge(data['officialEvidence'], patch.get('officialEvidence', []), 'key')
    merge(data['studentOutcomes']['records'], patch.get('records', []))
    for addition in patch.get('lifeChapterAdditions', []):
        chapter = next(item for item in data['lifeChapters'] if item['id'] == addition['chapterId'])
        chapter['blocks'] = [block for block in chapter['blocks'] if block.get('batchId') != patch['batch']]
        chapter['blocks'].extend(dict(copy.deepcopy(block), batchId=patch['batch']) for block in addition['blocks'])
    data['meta']['counts'].update(socialPosts=len(data['socialPosts']), officialEvidence=len(data['officialEvidence']), studentOutcomes=len(data['studentOutcomes']['records']))
    data['meta']['socialPostCategories'] = dict(Counter(post.get('category', '') for post in data['socialPosts']))
    records = data['studentOutcomes']['records']
    report = {
        'batch': patch['batch'], 'asOf': patch['asOf'],
        'newPostIds': [item['id'] for item in patch['socialPosts']],
        'newSourceCodes': [item['code'] for item in patch['sources']],
        'socialPosts': len(data['socialPosts']),
        'visiblePosts': sum(not post.get('screenedOnly') and '排除' not in post.get('category', '') and post.get('category') != '仅筛选记录' for post in data['socialPosts']),
        'sourceRegistryEntries': len(data['sourceRegistry']), 'officialEvidence': len(data['officialEvidence']),
        'studentOutcomeTimepoints': len(records),
        'studentOutcomePeople': len({item.get('personId') or item['studentName'] for item in records}),
        'newReviewRecordsAssignedToMPAccRoster': 0,
        'scope': 'MAud、学位未知的社交反馈、实习及毕业就业分别标明；不由简称、共著、offer或实习推导师就业人数。'
    }
    data['meta']['contentRepair20261114b'] = report
    save(TARGET, data)
    save(BATCH / 'merge-report.json', report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
