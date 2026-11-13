"""Mark explicit strong selection attitudes for prominent display, preserving evidence fields."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'dist/data/site-data.json'


def main():
    data = json.loads(TARGET.read_text())
    signals = {
        'sr-alias-20261113-yby': {
            'direction': 'avoid', 'intensity': 'strong', 'alias': 'YBY',
            'excerpt': {'kind': 'visible_quote', 'text': '答应我千万不要选yby...'},
            'sourceIds': ['X01'],
            'scope': '明确劝退态度；截图末尾截断，原因、学位和接触关系未说明。',
        },
        'sr-4f903dfc6b113f': {
            'direction': 'recommend', 'intensity': 'strong',
            'excerpt': {'kind': 'recorded_summary', 'text': 'momo按全名强烈推荐李仲泽，称年轻、幽默、为学生考虑。'},
            'sourceIds': ['X01'],
            'scope': '已存评论摘要；论文帮助属于期待性判断，未说明实际指导过程。',
        },
    }
    found = []
    for mentor in data['mentors']:
        for review in mentor['studentReviews']['reviews']:
            if review['id'] not in signals:
                continue
            assert review['attribution']['status'] == 'confirmed'
            signal = signals[review['id']]
            assert set(signal['sourceIds']).issubset(review['sourceIds'])
            review['selectionSignal'] = signal
            found.append({'mentor': mentor['name'], 'reviewId': review['id'], **signal})
    assert len(found) == len(signals)
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    folder = ROOT / 'data/selection_signals_20261113'
    folder.mkdir(exist_ok=True)
    (folder / 'source-audit.json').write_text(json.dumps({'signals': found,
        'newReviews': 0, 'newSources': 0,
        'rule': '仅提高明确选择态度的展示优先级，原亲历、学位、事实与推荐理由门槛不变。',
        'excluded': ['程博的口号式高度肯定未确认选导行动语句。', '王烨、蔡显军有反话歧义，不认定强烈推荐。']}, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
