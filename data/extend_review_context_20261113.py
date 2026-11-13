"""Add source-context reading notes without changing student identity or sentiment evidence."""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/review_context_20261113'
TARGET = ROOT / 'dist/data/site-data.json'


def main():
    data = json.loads(TARGET.read_text())
    patch = json.loads((DIR / 'context-research.json').read_text())
    reviews = {r['id']: r for mentor in data['mentors'] for r in mentor['studentReviews']['reviews']}
    ids = []
    for item in patch['contextNotes']:
        assert item['reviewId'] in reviews, item['reviewId']
        note = copy.deepcopy({key: value for key, value in item.items() if key not in ['reviewId', 'mentorName']})
        assert note['excerpt']['kind'] in ['summary', 'visible_quote', 'recorded_quote']
        assert note['interpretation']['confidence'] in ['limited', 'contextual']
        for code in set(note['sourceIds'] + note['excerpt']['sourceIds']):
            assert code in data['sourceRegistry'], code
        if note['excerpt'].get('screenshotSrc'):
            assert (ROOT / 'dist' / note['excerpt']['screenshotSrc'].removeprefix('./')).is_file()
        reviews[item['reviewId']]['contextNotes'] = note
        ids.append(item['reviewId'])
    data['meta']['reviewContextDisplay'] = {'date': '2026-11-13', 'reviewIds': ids,
        'sourceIds': ['X01', 'X02'], 'newReviewRecords': 0, 'newIndependentSources': 0,
        'rule': '截图可见片段、此前记录的用词、摘要与可能读法分开显示；解读不改变亲历或推荐等级。'}
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    report = {'contextNotes': len(ids), 'reviewIds': ids, 'studentReviewRecords': len(reviews),
        'sourceRegistryCount': len(data['sourceRegistry']), 'newReviewRecords': 0,
        'newIndependentSources': 0, 'newScreenshots': 0,
        'excerptKinds': {kind: sum(item['excerpt']['kind'] == kind for item in patch['contextNotes'])
                         for kind in ['summary', 'visible_quote', 'recorded_quote']}}
    (DIR / 'merge-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
