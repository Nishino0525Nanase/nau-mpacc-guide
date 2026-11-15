"""Verify the scoped signal refresh and retain the preceding package checks."""
import json
import hashlib
from pathlib import Path
import runpy
import sys
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1])
qa_path = Path(sys.argv[2])
shared_verifier = ROOT / 'data/verify_recommendation_workbook_20261114.py'
sys.argv = [str(shared_verifier), str(out), str(out / 'generic-verification.json')]
checked = runpy.run_path(str(shared_verifier), run_name='__main__')
model, result = checked['model'], checked['result']
reviews = next(spec for spec in model['datasets'] if spec['name'] == '导师反馈')
by_id = {row[12]: row for row in reviews['rows']}
selected = [by_id[key] for key in ['sr-alias-comments-20261113-tzd', 'sr-alias-comments-20261113-zl']]
assert {row[0] for row in selected} == {'谭志东', '张力'}
assert all('原帖明确推荐' in row[10] and '强烈' not in row[10] for row in selected)
assert all(row[14] == '那就tzd和zl，比较符合你的要求' for row in selected)
assert all('未说明' in row[2] and '亲历情况未明确' in row[2] for row in selected)
assert all('同一条原评论' in row[3] for row in selected)

ambiguous = by_id['sr-e63702f4d750b2']
assert ambiguous[14] == '如果想躺平的话推荐王烨老师'
assert '截图可见片段' == ambiguous[13]
assert '语气与身份待核' in ambiguous[10]
assert not any(label in ambiguous[10] for label in ['原帖明确推荐', '原帖强烈推荐', '原帖明确劝退', '原帖强烈劝退'])
assert ambiguous[18].endswith('/evidence/xhs/x01-lgc-20261113.jpg')
course = by_id['sr-4c04a46901e7aa']
assert '课程接触' in course[2]
assert '原帖明确劝退' not in course[10] and '原帖强烈劝退' not in course[10]
assert course[18].endswith('/evidence/xhs/x01-pj-zxl-20261113.jpg')

site = json.loads((ROOT / 'dist/data/site-data.json').read_text())
native_source = {review['id']: review for mentor in site['mentors'] for review in mentor['studentReviews']['reviews']}


def plain(value):
    if value is None:
        return ''
    if isinstance(value, list):
        return '\n'.join(plain(item) for item in value if plain(item))
    if isinstance(value, dict):
        return plain(value.get('text') or value.get('label') or value.get('summary') or value.get('name') or '')
    return str(value)


for row in reviews['rows']:
    record = native_source[row[12]]
    notes = record.get('contextNotes') or {}
    excerpt, interpretation = notes.get('excerpt') or {}, notes.get('interpretation') or {}
    assert row[1] == plain(record.get('text'))
    assert row[3] == plain(record.get('limits'))
    assert row[4] == (record.get('narrator') or '未留存')
    assert row[5] == (record.get('date') or '未显示')
    assert row[11] == plain(record.get('sourceIds'))
    assert row[14] == plain(excerpt.get('text'))
    assert row[15] == plain(notes.get('context'))
    assert row[16] == plain(interpretation.get('text'))
    expected_scope = '\n'.join(item for item in [plain(interpretation.get('alternative')), plain(notes.get('limits')), plain(excerpt.get('scope'))] if item)
    assert row[17] == expected_scope
    shots = record.get('screenshots') or []
    image = (shots[0].get('src') if shots else '') or (excerpt.get('screenshotSrc') if excerpt.get('kind') == 'visible_quote' else '')
    assert row[18] == (urljoin('https://nishino0525nanase.github.io/nau-mpacc-guide/', image) if image else '')
old_shared = 'x01-tiantian-20250409-tzd-zl'
assert all(native_source[key]['sharedCommentId'] == old_shared for key in ['sr-alias-comments-20261113-tzd', 'sr-alias-comments-20261113-zl'])
assert all(native_source[key]['selectionSignal']['intensity'] == 'explicit' for key in ['sr-alias-comments-20261113-tzd', 'sr-alias-comments-20261113-zl'])
assert not native_source['sr-e63702f4d750b2'].get('selectionSignal')
assert not native_source['sr-4c04a46901e7aa'].get('selectionSignal')

result.update(
    signalScope='Existing saved-comment signal and direct-image refresh',
    checkedProminentTeacherSignals=2,
    independentProminentCommentCount=1,
    existingSharedCommentIdPreserved=True,
    explicitRecommendationsNotUpgradedToStrong=True,
    ambiguousWangYeQuoteNotUpgradedToRecommendation=True,
    courseFeedbackNotUpgradedToAvoidance=True,
    reviewCount=len(reviews['rows']),
    metadataModified=False,
    mainDatasetModified=False,
    currentExportedReviewFieldsMatchDataset=True,
    currentDatasetSha256AtVerification=hashlib.sha256((ROOT / 'dist/data/site-data.json').read_bytes()).hexdigest(),
)
qa_path.parent.mkdir(parents=True, exist_ok=True)
qa_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'outputBytes', 'outputSha256', 'checkedModelRows', 'checkedSourceLinks', 'unchangedSheetsWithPreservedCellsTablesAndLayout']}, ensure_ascii=False))
