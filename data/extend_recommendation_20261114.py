"""Merge verified personal feedback and attach the original evidence to its own record."""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / 'data/recommendation_20261114'
TARGET = ROOT / 'dist/data/site-data.json'


def upsert(items, item, key='id'):
    index = next((index for index, value in enumerate(items) if value[key] == item[key]), None)
    if index is None:
        items.append(copy.deepcopy(item))
    else:
        items[index] = copy.deepcopy(item)


def main():
    data = json.loads(TARGET.read_text())
    mentors = {mentor['id']: mentor for mentor in data['mentors']}
    patch = json.loads((BATCH / 'local-audit/candidate-patch.json').read_text())
    shared_id = 'x01-shaxue-20250404-first-two'
    for entry in patch['newReviewRecords']:
        review = copy.deepcopy(entry['review'])
        review['sharedCommentId'] = shared_id
        review['text'] = '沙雪明确劝退原帖名单前两位，担心两人事务繁忙、指导时间有限；未说明本人接触关系。'
        review['selectionSignal']['scope'] = '同一评论涉及董必荣、温素彬；未说明本人接触关系。关于指导时间是评论者的担心。'
        upsert(mentors[entry['mentorId']]['studentReviews']['reviews'], review)
    for entry in patch['existingReviewEvidenceUpdates']:
        review = next(review for review in mentors[entry['mentorId']]['studentReviews']['reviews'] if review['id'] == entry['reviewId'])
        review.update(copy.deepcopy(entry['set']))
    for mentor_id, summary in [
        ('mentor-01', '同帖有明确劝退、DBR问句及单姓支线；身份和具体经历未说明。'),
        ('mentor-02', '同帖既有笼统好感，也有明确劝退；均未说明本人指导关系。'),
    ]:
        dossier = mentors[mentor_id]['studentReviews']
        dossier.update(coverageLabel='选导态度 · 接触未明', summary=summary)
    post = next(post for post in data['socialPosts'] if post['id'] == '67ecb72b000000001e0042af')
    example = patch['newReviewRecords'][0]['review']
    comment = {'id': shared_id, 'sourceCommentKey': example['sourceCommentKey'], 'author': '沙雪',
               'date_display': '2025-04-04', 'teacher': '董必荣、温素彬',
               'text': '明确不建议选名单前两位，并表达对老师事务繁忙、指导时间有限的担心。',
               'identity': '未说明学位或本人指导关系', 'assessment': '明确选导态度；所述原因未经独立核实。',
               'limits': '同一条评论同时涉及两位老师，不拆成两名评论者。',
               'screenshots': copy.deepcopy(example['screenshots'])}
    # Old comments have no stable IDs; retain them and replace only this exact new item.
    post['comments'] = [item for item in post.get('comments', []) if not isinstance(item, dict) or item.get('id') != shared_id] + [comment]
    primary = json.loads((BATCH / 'existing-roster/verified-patch.json').read_text())
    for source in primary['newSources']:
        source = copy.deepcopy(source)
        source['kind'] = 'official'
        data['sourceRegistry'][source['code']] = source
        identity_only = source.get('role') == 'identity-only-support-not-new-review-page'
        evidence = {
            'key': 'official:recommendation-20261114:' + source['code'],
            'ids': [source['code']], 'title': source['title'],
            'date_display': source['date'], 'url': source['url'],
            'canonical_url': source['canonicalUrl'],
            'summary': source['population'] if identity_only else '余一品、姚继晴、周会洋的论文点拨、组会与备考支持经历；实际采访在2021年。',
            'population': source['population'], 'tips': [], 'comments': [],
            'limits': source['limitations'], 'topic': '导师与培养',
            'use_status': '身份核对，非新增评价' if identity_only else '2021年具名指导经历；学校选编',
            'reading_scopes': source['readingScope'], 'official': True, 'screened_only': False,
        }
        upsert(data['officialEvidence'], evidence, 'key')
    for review in primary['newPersonalReviews']:
        upsert(mentors[review['mentorId']]['studentReviews']['reviews'], review)
    for new_post in primary['newSocialPosts']:
        new_post = copy.deepcopy(new_post)
        new_post['topic'] = '导师与培养'
        upsert(data['socialPosts'], new_post)
    mentors['mentor-11']['studentReviews']['summary'] = (
        '孙昊晨、袁璐、余一品有明确MPAcc身份的历史指导经历；李佳林、姚继晴、周会洋未确认学位类型。'
        '均为学校或教指委选编；其中2021年访谈涉及论文点拨、每周组会与备考支持，不代表当前安排。'
    )
    reviews = [review for mentor in data['mentors'] for review in mentor['studentReviews']['reviews']]
    data['meta']['counts'].update(studentReviewRecords=len(reviews),
                                 mentorsWithStudentReviews=sum(bool(mentor['studentReviews']['reviews']) for mentor in data['mentors']),
                                 socialPosts=len(data['socialPosts']), officialEvidence=len(data['officialEvidence']))
    report = {'batch': 'recommendation-20261114', 'reviewRecords': len(reviews),
              'newIndependentComments': 1, 'newDossierRecords': 2,
              'newNamedHistoricalExperiences': len(primary['newPersonalReviews']),
              'newPrimaryPages': 1, 'newIdentitySupportPages': 1,
              'newStrongSelectionSignals': 0, 'newStudents': 0, 'newDestinations': 0,
              'directImageEvidenceUpdatedRecords': len(patch['existingReviewEvidenceUpdates']),
              'sharedCommentId': shared_id, 'sharedMentorIds': ['mentor-01', 'mentor-02'],
              'sourceRegistryEntries': len(data['sourceRegistry']), 'rawPostRecords': len(data['socialPosts']),
              'officialEvidenceEntries': len(data['officialEvidence']),
              'countingNote': '一条既有帖评论对应两位导师；三条历史经历来自同一新访谈，另有一页仅用于身份核对。不是五名独立评论者或五篇新帖。'}
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    (BATCH / 'merge-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
