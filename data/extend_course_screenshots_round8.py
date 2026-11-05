#!/usr/bin/env python3
"""Attach actual R317 course screenshots without creating named mentor reviews."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BATCH = 'student-reviews-round8'
DETAILS_ID = 'round8-course-feedback-R317'


def read(path):
    return json.loads((ROOT / path).read_text())


def dump(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def append_once(items, value):
    if value not in items:
        items.append(value)


def extend(write=False):
    data = read('dist/data/site-data.json')
    item = read('data/reviews_round8/r317-reread.json')
    manifest = read('data/reviews_round8/screenshot-manifest.json')
    protected = {key: deepcopy(data[key]) for key in ('musicPlaylist', 'internships', 'downloads', 'mentors')}
    old_x01 = deepcopy(data['sourceRegistry']['X01'])
    old_x02 = deepcopy(data['sourceRegistry']['X02'])
    assert item['sourceCode'] == 'R317' and item['bodyRead'] is True
    assert item['newNamedStudentReviews'] == 0 and item['namedTeacherMentions'] == []
    assert len(item['comments']) == 5
    assert manifest['actualJpegFiles'] and manifest['privacyReviewed']
    assert not manifest['containsLoginQrOrPrivateContact']
    assert len(manifest['images']) == 5 and manifest['totalBytes'] == 91099
    images = manifest['images']
    comments_by_id = {c['id']: c for c in item['comments']}
    for image in images:
        assert image['sourceId'] == 'R317'
        assert image['mentorId'] is None and image['reviewId'] is None
        assert image['kind'] == 'actual-browser-screenshot' and image['textAltered'] is False
        payload = (ROOT / 'dist' / image['src'][2:]).read_bytes()
        assert len(payload) == image['bytes'] and hashlib.sha256(payload).hexdigest() == image['sha256']
        assert payload.startswith(b'\xff\xd8')
        if image['commentId']:
            assert image['commentId'] in comments_by_id
    assert sum(image['bytes'] for image in images) == 91099
    assert len({image['src'] for image in images}) == 5
    assert sum(bool(image['commentId']) for image in images) == 4

    registry = data['sourceRegistry']['R317']
    original_updates = deepcopy(registry.get('appResearchUpdates'))
    post = next(p for p in data['socialPosts'] if p['id'] == item['postId'])
    old_tips = deepcopy(post['tips'])
    old_reading_scopes = deepcopy(post['readingScopes'])
    scope = item['readingScope']
    date_note = '会计研究方法结课形式的跟评，本次读取显示08-27，既有日志记08-28；保留两次显示差异，不猜年份、不覆盖原记录。'
    alias_note = '“商业智能分析”与“智能商业分析”按各评论原文分别保留，不因名称相近合并课程，也不关联未具名任课教师。'
    source_note = '原帖索引R317附5张真实截图：正文1张和4条课程评论；会计研究方法的论文结课跟评、商业智能分析的Power BI跟评未在截图中。'
    for container in (registry, post):
        container['screenshots'] = deepcopy(images)
        container['latestAuthenticatedReadingScope'] = scope
        container['courseFeedbackLimits'] = [item['limits'], item['unread'], date_note, alias_note]
        container['screenshotScope'] = manifest['readingScope']
    append_once(post['readingScopes'], scope)
    append_once(post['readingScopes'], date_note)
    append_once(post['tips'], alias_note)
    append_once(post['tips'], source_note)
    for comment in item['comments']:
        record = deepcopy(comment)
        record['text'] = comment['course'] + '：' + comment['text']
        record['sourceIds'] = ['R317']
        record['expansionBatch'] = BATCH
        attached = [deepcopy(image) for image in images if image['commentId'] == comment['id']]
        if attached:
            record['screenshots'] = attached
        prior = next((i for i, row in enumerate(post['comments']) if isinstance(row, dict)
                      and row.get('id') == comment['id']), None)
        if prior is None:
            post['comments'].append(record)
        else:
            post['comments'][prior] = record

    chapter = next(c for c in data['lifeChapters'] if c['id'] == 'life-08')
    old_ids = {'round3-xhs-6a8edcec000000001f000035', 'app-xhs-6a8edcec000000001f000035'}
    old_blocks = [deepcopy(b) for b in chapter['blocks'] if b.get('expansionId') in old_ids]
    if 'archivedLifeBlocksBeforeRound8' not in registry:
        assert len(old_blocks) == 2
        registry['archivedLifeBlocksBeforeRound8'] = old_blocks
    assert len(registry['archivedLifeBlocksBeforeRound8']) == 2
    table_rows = [[c['course'], f"{c['author']}｜{c['date_display']}：{c['text']}", c['limitations']]
                  for c in item['comments']]
    details = {
        'type': 'details', 'text': '展开五条历史课程反馈（原帖附5张截图）',
        'blocks': [
            {'type': 'p', 'text': '选课互助帖的五条课程反馈可用于估算实操、汇报与写作投入。评论仅显示月日，年份、专业和年级未全部核验；没有任课教师全名，不写入导师评价。[R317]'},
            {'type': 'table', 'headers': ['课程原文写法', '已读课程反馈', '采用边界'], 'rows': table_rows},
            {'type': 'p', 'text': date_note + ' ' + alias_note + ' ' + source_note + ' 考核、软件、点名与评分均以本学期任课教师通知为准。[R317]'},
        ],
        'sourceCodes': ['R317'], 'expansionId': DETAILS_ID, 'expansionBatch': BATCH,
    }
    positions = [i for i, b in enumerate(chapter['blocks'])
                 if b.get('expansionId') in old_ids | {DETAILS_ID}]
    assert positions
    position = min(positions)
    chapter['blocks'] = [b for b in chapter['blocks'] if b.get('expansionId') not in old_ids | {DETAILS_ID}]
    chapter['blocks'].insert(position, details)
    assert sum(b.get('sourceCodes') == ['R317'] for b in chapter['blocks']) == 1

    review_count = sum(len(m['studentReviews']['reviews']) for m in data['mentors'])
    teachers = sum(bool(m['studentReviews']['reviews']) for m in data['mentors'])
    all_images = list((ROOT / 'dist/evidence/xhs').glob('*.jpg'))
    assert review_count == 40 and teachers == 20 and len(data['mentors']) == 34
    assert len(data['socialPosts']) == 114 and len(data['officialEvidence']) == 185
    assert len(all_images) == 10
    meta = data['meta']['studentReviewResearch']
    summary = meta['round8']
    summary.update({
        'authenticatedXhsSourcesReread': 2, 'courseCommentsRead': 5,
        'namedMentorReviewsFromCoursePost': 0, 'screenshotsCaptured': 5,
        'newScreenshotSources': ['R317'], 'existingScreenshotFilesPreserved': 5,
        'totalPublishedScreenshotFiles': 10, 'courseScreenshotBytes': 91099,
        'courseCommentImageAttachments': 4,
        'scope': '登录后补读X01和R317相关支线，课程帖附5张实际截图；新增一份明确标注的教师本人自述。未新增学生指导评价、小红书帖子或独立学生来源；未读评论与日期差异保留。',
    })
    append_once(summary['sourceCodes'], 'R317')
    coverage = read('data/student-review-coverage.json')
    coverage['summary'] = deepcopy(meta)
    sources = read('data/student-review-sources.json')
    source_copy = next((s for s in sources['sources'] if s.get('code') == 'R317'), None)
    if source_copy is None:
        sources['sources'].append({**deepcopy(registry), 'studentReviewUse': '仅课程线索，不关联任何导师卡或学生指导评价'})
    else:
        source_copy.update(deepcopy(registry))
        source_copy['studentReviewUse'] = '仅课程线索，不关联任何导师卡或学生指导评价'
    # R317 already existed: do not append it to newSourceCodes.
    assert 'R317' not in sources['newSourceCodes']
    qa = read('data/student-review-qa.json')
    qa['counts'] = deepcopy(meta)
    append_once(qa['sourceChanges'], {'code': 'R317', 'action': 'existing_course_post_reread_five_actual_screenshots_no_mentor_attribution'})
    round_qa = read('data/reviews-round8-qa.json')
    round_qa.update(deepcopy(summary))
    round_qa.update({'reviewRecords': review_count, 'teachersWithStudentReviews': teachers,
                    'officialEvidence': 185, 'socialPosts': 114, 'oneR317LifeDetailsBlock': True,
                    'fiveCourseSummaries': True, 'fourExactCommentImageAttachments': True,
                    'noCourseImagesOnMentorReviews': True, 'historicalR317InputsPreserved': True,
                    'courseNamesNotMerged': True, 'dateDisplayDiscrepancyRetained': True})

    assert registry.get('appResearchUpdates') == original_updates
    assert post['tips'][:len(old_tips)] == old_tips
    assert post['readingScopes'][:len(old_reading_scopes)] == old_reading_scopes
    assert data['sourceRegistry']['X01'] == old_x01 and data['sourceRegistry']['X02'] == old_x02
    for key, value in protected.items():
        assert data[key] == value, 'Unrelated change: ' + key
    assert sum(len(c.get('screenshots', [])) for c in post['comments'] if c.get('id') in comments_by_id) == 4
    assert sum(c.get('course') == '智能商业分析' for c in post['comments']) == 1
    assert sum(c.get('course') == '商业智能分析' for c in post['comments']) == 1
    if write:
        dump('dist/data/site-data.json', data)
        dump('data/student-review-coverage.json', coverage)
        dump('data/student-review-sources.json', sources)
        dump('data/student-review-qa.json', qa)
        dump('data/reviews-round8-qa.json', round_qa)
    print(json.dumps({'write': write, 'reviewRecords': review_count, 'officialEvidence': 185,
        'courseComments': 5, 'newScreenshotFiles': 5, 'allScreenshotFiles': 10,
        'exactCommentAttachments': 4, 'newScreenshotBytes': 91099}, ensure_ascii=False))


if __name__ == '__main__':
    extend('--write' in sys.argv)
