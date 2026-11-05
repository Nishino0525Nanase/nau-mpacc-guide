#!/usr/bin/env python3
"""Reclassify ambiguous discussion without inventing, deleting or upgrading evidence."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BATCH = 'review-context-audit-round10'
IDS = {'sr-e63702f4d750b2', 'sr-56c2d22b39f07a', 'sr-6f547fefb6425f'}


def load(path):
    return json.loads((ROOT / path).read_text())


def dump(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def append_once(items, value):
    if value not in items:
        items.append(value)


def preserve(item, fields):
    item.setdefault('contextInterpretationBeforeRound10',
                    {field: deepcopy(item[field]) for field in fields if field in item})


def note_id(value):
    parsed = urlparse(value or '')
    if parsed.hostname not in ('xiaohongshu.com', 'www.xiaohongshu.com', 'rednote.com', 'www.rednote.com'):
        return None
    match = re.search(r'/(?:explore|discovery/item)/([a-fA-F0-9]{24})(?:/|$)', parsed.path)
    return match.group(1).lower() if match else None


def apply(write=False):
    data = load('dist/data/site-data.json')
    audit = load('data/reviews_round10/context-audit.json')
    protected = {key: deepcopy(data[key]) for key in
                 ('musicPlaylist', 'internships', 'downloads', 'officialEvidence', 'lifeChapters')}
    images = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
              for p in (ROOT / 'dist/evidence/xhs').glob('*') if p.is_file()}
    before_reviews = {r['id']: deepcopy(r) for m in data['mentors'] for r in m['studentReviews']['reviews']}
    summaries = {
        'mentor-03': '有全名讨论，但含玩笑化或夸张措辞；语气与接触关系未核，不据此作推荐或避雷。',
        'mentor-25': '全名简短提名的原话及语境不足，不能确认是真实推荐、玩笑或反讽。',
        'mentor-02': '只有笼统好感，未说明本人接触关系；不作为具体指导体验。',
    }
    statuses = {
        'mentor-03': ('playful_ambiguous', '仅提名／语气与身份待核'),
        'mentor-25': ('insufficient_original_context', '仅提名／语气与身份待核'),
        'mentor-02': ('general_endorsement_no_relation', '笼统好感／接触未明'),
    }
    changed = []
    for item in audit['reviewProposals']:
        if item['reviewId'] not in IDS:
            continue
        mentor = next(m for m in data['mentors'] if m['id'] == item['mentorId'])
        dossier = mentor['studentReviews']
        review = next(r for r in dossier['reviews'] if r['id'] == item['reviewId'])
        assert review['firsthand'] is None and review['experienceType'] == 'general'
        assert review['sourceIds'] == [item['sourceCode']]
        preserve(review, ('text', 'specifics', 'limits', 'polarity', 'experienceLabel'))
        fields = deepcopy(item['proposedFields'])
        limit = fields.pop('additionalLimit', None)
        review.update(fields)
        review['polarity'] = 'neutral'
        if limit:
            append_once(review.setdefault('limits', []), limit)
        status, label = statuses[mentor['id']]
        review['contextAssessment'] = {
            'status': status, 'displayLabel': label,
            'eligibleForRecommendation': False, 'eligibleForConcern': False,
            'reason': item['assessment'], 'scope': '复核既有摘记，未新增原帖或学生经历；不武断确认反讽。',
            'batch': BATCH,
        }
        preserve(dossier, ('summary',))
        dossier['summary'] = summaries[mentor['id']]
        mentor['feedbackDetails']['basis'] = dossier['summary']
        for evidence in mentor['evidence']:
            if evidence.get('kind') != 'official' and item['sourceCode'] in evidence.get('sourceIds', []):
                preserve(evidence, ('text', 'statusLabel', 'category', 'limitations'))
                evidence.update(text=review['text'], statusLabel=label, category='非具体亲历的待核语境')
                evidence['contextAssessment'] = deepcopy(review['contextAssessment'])
                extra = '玩笑、夸张与反讽方向未核，不用于推荐或避雷。' if mentor['id'] != 'mentor-02' else '仅总体好感，未说明本人接触，不作为指导体验。'
                if extra not in evidence.get('limitations', ''):
                    evidence['limitations'] = evidence.get('limitations', '') + ' ' + extra
                if mentor['id'] == 'mentor-25':
                    evidence['limitations'] = '；'.join(review['limits'])
        for post in data['socialPosts']:
            if item['sourceCode'] not in post.get('sourceIds', []):
                continue
            for comment in post.get('comments', []):
                if isinstance(comment, dict) and comment.get('teacher') == mentor['name']:
                    preserve(comment, ('content', 'text', 'limits', 'limitations', 'use_status'))
                    if 'content' in comment:
                        comment['content'] = review['text']
                    else:
                        comment['text'] = review['text']
                    comment['use_status'] = label + '；未用于推荐或避雷'
                    comment['contextAssessment'] = deepcopy(review['contextAssessment'])
                    if mentor['id'] == 'mentor-25':
                        for limit_key in ('limits', 'limitations'):
                            if limit_key in comment:
                                comment[limit_key] = '；'.join(review['limits'])
        changed.append(review['id'])

    pan = next(p for p in data['socialPosts'] if p['id'] == '67ecb72b000000001e0042af')
    pan_comment = next(c for c in pan['comments'] if isinstance(c, dict) and c.get('author') == '林瑜' and c.get('teacher') == '潘俊')
    proposal = next(c for c in audit['socialContextProposals'] if c.get('author') == '林瑜')['proposedComment']
    preserve(pan_comment, ('text', 'limitations', 'use_status'))
    pan_comment.update(deepcopy(proposal))
    pan_comment['contextAssessment'] = {'status': 'slogan_or_hyperbole', 'eligibleForRecommendation': False,
        'eligibleForConcern': False, 'reason': '没有本人指导关系、事件或实际去向。', 'batch': BATCH}

    for code in ('X01', 'X02'):
        source = data['sourceRegistry'][code]
        source['contextInterpretationAudit'] = {'batch': BATCH,
            'reviewIds': [r for r in changed if code in before_reviews[r]['sourceIds']],
            'scope': '只修正既有弱提名的语气和用途，不算新来源；表面褒贬、口号和附和不能替代具体经历。'}

    records = [r for m in data['mentors'] for r in m['studentReviews']['reviews']]
    counts = Counter(note for r in records if (note := note_id(r.get('canonicalUrl')) or note_id(r.get('sourceUrl'))))
    top = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:2]
    stats = {'batch': BATCH, 'reclassifiedReviewRecords': len(changed), 'reclassifiedSocialContexts': 1,
        'newStudentExperiences': 0, 'newXhsPosts': 0, 'newScreenshots': 0,
        'xhsMentorReviewRecords': sum(counts.values()), 'distinctXhsMentorPosts': len(counts),
        'largestTwoPostRecords': sum(count for _, count in top),
        'postRecordCounts': dict(sorted(counts.items())),
        'useRule': '玩笑化、语气不明或未说明本人接触的简短提名，不当作具体体验或推荐／避雷依据。',
        'reviewIds': sorted(changed), 'sourceCodes': ['X01', 'X02']}
    data['meta']['reviewContextAudit'] = {**data['meta'].get('reviewContextAudit', {}), **stats}
    data['meta']['studentReviewResearch']['contextAudit'] = deepcopy(stats)
    for mentor in data['mentors']:
        for key, eligibility in [('recommendationPoints', 'eligibleForRecommendation'), ('concerns', 'eligibleForConcern')]:
            by_id = {r['id']: r for r in mentor['studentReviews']['reviews']}
            assert all(not any(by_id.get(rid, {}).get('contextAssessment', {}).get(eligibility) is False
                               for rid in point.get('reviewIds', []))
                       for point in mentor['studentReviews'][key]), 'Ambiguous context used in conclusion'

    for key, value in protected.items():
        assert data[key] == value, key
    after_reviews = {r['id']: r for r in records}
    assert before_reviews.keys() == after_reviews.keys()
    for rid, prior in before_reviews.items():
        if rid not in IDS:
            assert after_reviews[rid] == prior, rid
        else:
            for key in ('date', 'narrator', 'degree', 'year', 'relationship', 'sourceIds', 'readingScope', 'screenshots', 'attribution'):
                assert after_reviews[rid].get(key) == prior.get(key), (rid, key)
    assert images == {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in (ROOT / 'dist/evidence/xhs').glob('*') if p.is_file()}

    coverage = load('data/student-review-coverage.json')
    coverage['summary'] = deepcopy(data['meta']['studentReviewResearch'])
    for row in coverage['teachers']:
        if row['mentorId'] in summaries:
            row['contextAuditStatus'] = 'weak_context_reclassified_without_new_experience'
    sources = load('data/student-review-sources.json')
    sources['contextAudit'] = deepcopy(stats)
    for source in sources['sources']:
        if source.get('code') in ('X01', 'X02'):
            source['contextInterpretationAudit'] = deepcopy(data['sourceRegistry'][source['code']]['contextInterpretationAudit'])
    qa = load('data/student-review-qa.json')
    qa['counts'] = deepcopy(data['meta']['studentReviewResearch'])
    qa['contextAudit'] = deepcopy(stats)
    for code in ('X01', 'X02'):
        change = {'code': code, 'action': 'context_interpretation_review_without_new_evidence'}
        append_once(qa['sourceChanges'], change)
    report = {'ok': True, **stats, 'reviewRecords': len(records), 'officialEvidence': len(data['officialEvidence']),
              'socialPosts': len(data['socialPosts']), 'screenshotsPreserved': len(images),
              'unchangedReviewIds': sorted(set(before_reviews) - IDS), 'recommendationLeaks': [],
              'unrelatedContentPreserved': True, 'noNewSourceOrExperienceClaimed': True}
    if write:
        dump('dist/data/site-data.json', data)
        dump('data/student-review-coverage.json', coverage)
        dump('data/student-review-sources.json', sources)
        dump('data/student-review-qa.json', qa)
        dump('data/review-context-round10-qa.json', report)
    print(json.dumps({'write': write, **stats, 'reviewRecords': len(records)}, ensure_ascii=False))


if __name__ == '__main__':
    apply('--write' in sys.argv)
