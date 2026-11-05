#!/usr/bin/env python3
"""Add a clearly labelled teacher self-report and an authenticated X01 reread."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CODE = 'R901'
BATCH = 'student-reviews-round8'


def read(path):
    return json.loads((ROOT / path).read_text())


def dump(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def append_once(items, item):
    if item not in items:
        items.append(item)


def extend(write=False):
    data = read('dist/data/site-data.json')
    source = read('data/reviews_round8/research-new.json')['newSources'][0]
    reread = read('data/reviews_round8/x01-reread.json')
    protected = {key: deepcopy(data[key]) for key in ('musicPlaylist', 'internships', 'downloads')}
    before_reviews = {m['id']: deepcopy(m['studentReviews']['reviews']) for m in data['mentors']}
    old_screenshots = {
        m['id']: {r['id']: deepcopy(r.get('screenshots')) for r in m['studentReviews']['reviews']}
        for m in data['mentors']
    }
    post = next(p for p in data['socialPosts'] if p['id'] == reread['postId'])
    post_screenshots = deepcopy(post.get('screenshots'))
    all_images = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in (ROOT / 'dist/evidence/xhs').glob('*') if p.is_file()}
    # Later course captures are a separate extension; guard the original files
    # without preventing this historical step from being rerun afterwards.
    baseline_image_count = sum(not name.startswith('r317-') for name in all_images)
    assert baseline_image_count == 5
    assert source['evidenceType'] == 'teacher_self_report' and source['isStudentReview'] is False
    assert source['mentorIds'] == ['mentor-26'] and source['narrator'] == '傅祥斐'
    assert source['date'] == '2023-07-21'
    assert source['url'] == 'https://www.zgcznet.com/zdct/202307/20230721/j_2023072108461800016899005117157198.html'
    assert reread['loginStateVerified'] and reread['expandedRepliesWorked']
    url = source['url']
    limitations = '；'.join(source['limits'])
    registry = {
        'code': CODE, 'title': source['pageTitle'], 'label': source['pageTitle'],
        'url': url, 'originalUrl': url, 'canonicalUrl': url, 'date': source['date'],
        'author': '傅祥斐（本人署名段落）', 'platform': source['publisher'],
        'kind': '教师本人自述·非学生评价', 'population': source['degree'],
        'summary': source['summary'], 'readingScope': source['readingScope'],
        'limitations': limitations, 'expansionBatch': BATCH,
    }
    if CODE in data['sourceRegistry']:
        assert data['sourceRegistry'][CODE]['canonicalUrl'] == url
    assert not any(s.get('canonicalUrl') == url and k != CODE
                   for k, s in data['sourceRegistry'].items())
    data['sourceRegistry'][CODE] = registry
    official = {
        'key': 'official:reviews8:fu-teacher-self-report', 'ids': [CODE],
        'title': source['pageTitle'], 'author': registry['author'], 'date_display': source['date'],
        'url': url, 'canonical_url': url, 'population': source['degree'],
        'summary': source['summary'],
        'tips': ['本人回顾案例备课，以及学年、毕业论文和竞赛指导；不属于学生个人评价。'],
        'comments': [], 'limits': limitations, 'topic': '教师本人回顾教学与论文指导',
        'use_status': '教师本人自述；未确认MPAcc阶段，不作为学生评价或独立口碑',
        'reading_scopes': [source['readingScope']], 'official': True, 'screened_only': False,
        'expansionBatch': BATCH,
    }
    if not any(row.get('canonical_url') == url for row in data['officialEvidence']):
        data['officialEvidence'].append(official)
    mentor = next(m for m in data['mentors'] if m['id'] == 'mentor-26')
    evidence = {
        'id': 'R901-mentor-26-self-report', 'kind': 'official',
        'category': '教师本人自述·非学生评价', 'statusLabel': '教师本人自述·非学生评价',
        'population': source['degree'], 'date': source['date'], 'author': registry['author'],
        'text': '本人回顾通过案例准备和演练改进《成本与管理会计》教学；在学年、毕业论文指导中交流学习与未来规划，并指导学科竞赛。[R901]',
        'url': url, 'limitations': limitations, 'sourceIds': [CODE], 'expansionBatch': BATCH,
    }
    if not any(row['id'] == evidence['id'] for row in mentor['evidence']):
        mentor['evidence'].append(evidence)
    append_once(mentor['sourceCodes'], CODE)
    append_once(mentor['links'], {'label': '教师本人自述（非学生评价）', 'url': url})

    scope = reread['readingScope']
    append_once(post['readingScopes'], scope)
    post['latestAuthenticatedReadingScope'] = scope
    post['authenticatedReadingLimits'] = deepcopy(reread['attributionLimits'])
    for comment in reread['additionalContext']:
        if not any(c.get('author') == comment['author'] and c.get('teacher') == comment['teacher']
                   for c in post['comments'] if isinstance(c, dict)):
            post['comments'].append({**comment, 'expansionBatch': BATCH})
    source_x01 = data['sourceRegistry']['X01']
    source_x01['latestAuthenticatedReadingScope'] = scope
    source_x01['authenticatedReadingLimits'] = deepcopy(reread['attributionLimits'])
    source_x01['authenticatedScreenshotExport'] = deepcopy(reread['screenshotExport'])
    reconfirmed_records = 0
    for m in data['mentors']:
        if m['name'] not in reread['reconfirmedTeachers']:
            continue
        touched = False
        for r in m['studentReviews']['reviews']:
            if 'X01' not in r['sourceIds']:
                continue
            r['authenticatedRereadScope'] = scope
            reconfirmed_records += 1
            touched = True
        if touched:
            append_once(m['studentReviews']['searchCoverage']['readingScopes'], scope)

    total = sum(len(m['studentReviews']['reviews']) for m in data['mentors'])
    teacher_total = sum(bool(m['studentReviews']['reviews']) for m in data['mentors'])
    assert total == 40 and teacher_total == 20
    assert len(data['officialEvidence']) == 185 and len(data['socialPosts']) == 114
    assert len(data['mentors']) == 34
    summary = {
        'newOfficialSources': 1, 'newTeacherSelfReports': 1, 'sourceCodes': [CODE],
        'newStudentExperiences': 0, 'newXhsSources': 0, 'authenticatedXhsSourcesReread': 1,
        'reconfirmedExistingReviewRecords': reconfirmed_records,
        'newCommentContextWithoutExperience': len(reread['additionalContext']),
        'screenshotsCaptured': 0, 'existingScreenshotFilesPreserved': baseline_image_count,
        'publicSearchQueriesSubmitted': len(read('data/reviews_round8/research-new.json')['queries']),
        'scope': '登录后补读X01已加载评论及相关支线；新增一份明确标注的教师本人自述，不增加学生评价、独立学生来源或小红书帖子数。95条评论未全量读完；本轮未取得可下载截图文件。',
    }
    meta = data['meta']['studentReviewResearch']
    if 'courseCommentsRead' in meta.get('round8', {}):
        summary = {**summary, **deepcopy(meta['round8'])}
    meta['round8'] = summary
    append_once(meta['newSourceCodes'], CODE)
    meta['newOfficialEvidenceCount'] = 3
    data['meta']['counts']['officialEvidence'] = len(data['officialEvidence'])
    data['meta']['platformNote'] = '社交来源索引实际114条，官方公开资料185条；同帖补读、同事件附件和转载不重复计数。课程体验、学位类型未明的硕士经历与明确MPAcc指导分开呈现；教师自述不计作学生个人评价。'

    coverage = read('data/student-review-coverage.json')
    coverage['summary'] = deepcopy(meta)
    sources = read('data/student-review-sources.json')
    append_once(sources['newSourceCodes'], CODE)
    if not any(row.get('code') == CODE for row in sources['sources']):
        sources['sources'].append(registry)
    source_copy = next(row for row in sources['sources'] if row.get('code') == 'X01')
    for key in ('latestAuthenticatedReadingScope', 'authenticatedReadingLimits', 'authenticatedScreenshotExport'):
        source_copy[key] = deepcopy(source_x01[key])
    qa = read('data/student-review-qa.json')
    qa['counts'] = deepcopy(meta)
    change = {'code': CODE, 'action': 'new_official_teacher_self_report_not_student_review'}
    append_once(qa['sourceChanges'], change)
    append_once(qa['sourceChanges'], {'code': 'X01', 'action': 'authenticated_reread_no_new_student_experiences'})

    for key, original in protected.items():
        assert data[key] == original, 'Unrelated data changed: ' + key
    assert post.get('screenshots') == post_screenshots
    for m in data['mentors']:
        for r in m['studentReviews']['reviews']:
            assert r.get('screenshots') == old_screenshots[m['id']][r['id']]
        current = deepcopy(m['studentReviews']['reviews'])
        prior = deepcopy(before_reviews[m['id']])
        for records in (current, prior):
            for r in records:
                r.pop('authenticatedRereadScope', None)
        assert current == prior, 'Review attribution, dates or conclusions changed: ' + m['id']
    assert all_images == {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in (ROOT / 'dist/evidence/xhs').glob('*') if p.is_file()}
    if write:
        dump('dist/data/site-data.json', data)
        dump('data/student-review-coverage.json', coverage)
        dump('data/student-review-sources.json', sources)
        dump('data/student-review-qa.json', qa)
        prior_qa = read('data/reviews-round8-qa.json') if (ROOT / 'data/reviews-round8-qa.json').exists() else {}
        prior_qa.update({'ok': True, **summary, 'reviewRecords': total,
            'teachersWithStudentReviews': teacher_total, 'officialEvidence': len(data['officialEvidence']),
            'socialPosts': len(data['socialPosts']), 'reviewDatesAndConclusionsPreserved': True,
            'musicInternshipsDownloadsAndScreenshotsPreserved': True})
        dump('data/reviews-round8-qa.json', prior_qa)
    print(json.dumps({'write': write, **summary}, ensure_ascii=False))


if __name__ == '__main__':
    extend('--write' in sys.argv)
