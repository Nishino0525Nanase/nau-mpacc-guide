"""Restore explicit selection advice and its own images without inventing new samples."""
from copy import deepcopy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / 'data/mentor_signals_20261115'
TARGET = ROOT / 'dist/data/site-data.json'


def main():
    data = json.loads(TARGET.read_text())
    patch = json.loads((BATCH / 'saved/candidate-patch.json').read_text())
    mentors = {mentor['id']: mentor for mentor in data['mentors']}
    changed = []
    for entry in patch['existingReviewUpdates']:
        mentor = mentors[entry['mentorId']]
        review = next(review for review in mentor['studentReviews']['reviews'] if review['id'] == entry['reviewId'])
        values = deepcopy(entry['set'])
        for image in values.get('screenshots', []):
            image['scope'] = [scope.removeprefix('2026-11-15实际查看既有原网页截图；') for scope in image.get('scope', [])]
        if 'selectionSignal' in values:
            # Keep the previously published comment identity and per-teacher abbreviation.
            values['sharedCommentId'] = review['sharedCommentId']
            values['selectionSignal']['alias'] = review['attribution']['alias']
        review.update(values)
        changed.append({'mentorId': mentor['id'], 'mentorName': mentor['name'],
                        'reviewId': review['id'], 'fields': sorted(values)})
    mentors['mentor-23']['studentReviews']['coverageLabel'] = '明确选导推荐 · 接触未明'
    mentors['mentor-23']['studentReviews']['summary'] = '同帖建议考虑TZD（谭志东）和ZL（张力），针对发帖人要求；两档案共用一条评论，理由和接触关系未说明。'
    reviews = [review for mentor in data['mentors'] for review in mentor['studentReviews']['reviews']]
    report = {'batch': 'mentor-signals-20261115', 'reviewCount': len(reviews),
              'updatedRecords': changed, 'newReviews': 0, 'newIndependentComments': 0,
              'newSources': 0, 'newPosts': 0, 'newImageFiles': 0,
              'newPriorityMentorRecords': 2, 'newPriorityIndependentComments': 1,
              'priorityCommentWasAlreadyArchived': True,
              'sharedCommentId': 'x01-tiantian-20250409-tzd-zl',
              'selectionIntensity': 'explicit', 'directImageUpdates': 2,
              'sourceCount': len(data['sourceRegistry']), 'postCount': len(data['socialPosts']),
              'countingNote': '同一旧评论在两位导师档案补明确推荐标记；王烨语气未确认，崔秀梅仅为课程适配提醒，不生成新选导票。'}
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    (BATCH / 'merge-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
