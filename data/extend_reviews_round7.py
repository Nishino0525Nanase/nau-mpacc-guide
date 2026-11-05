#!/usr/bin/env python3
"""Append one actually read student interview; keep unacquired screenshots absent."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/site-data.json'
CODE = 'R801'
REVIEW_ID = 'sr-r7-panjun-lijialin-2022'
BATCH = 'student-reviews-round7'


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def add_alumni_context(data):
    path = ROOT / 'data/reviews_round7/mpacc-alumni-r802.json'
    if not path.exists():
        return 0
    item = json.loads(path.read_text())
    assert item['sourceCode'] == 'R802' and item['bodyRead'] is True and item['mentorId'] is None
    url, code = item['canonicalUrl'], item['sourceCode']
    assert url == 'https://paccesc.ruc.edu.cn/info/1127/3387.htm'
    if code in data['sourceRegistry']:
        assert data['sourceRegistry'][code]['canonicalUrl'] == url
    data['sourceRegistry'][code] = {'code': code, 'title': item['title'], 'label': item['title'],
        'url': url, 'canonicalUrl': url, 'originalUrl': url, 'date': item['date'],
        'author': item['author'], 'platform': item['platform'], 'kind': '官方MPAcc校友访谈',
        'population': item['population'], 'summary': item['summary'],
        'readingScope': item['readingScope'], 'limitations': '；'.join(item['limits']),
        'expansionBatch': BATCH}
    if not any(row.get('canonical_url') == url for row in data['officialEvidence']):
        data['officialEvidence'].append({'key': 'official:reviews7:alumni-r802', 'ids': [code],
            'title': item['title'], 'author': item['author'], 'date_display': item['date'],
            'url': url, 'canonical_url': url, 'population': item['population'],
            'summary': item['summary'], 'tips': item['points'], 'comments': [],
            'limits': '；'.join(item['limits']), 'topic': 'MPAcc双导师与实践的历史校友经历',
            'use_status': '官方精选历史个案；导师未具名，不归到实名导师',
            'reading_scopes': [item['readingScope']], 'official': True,
            'screened_only': False, 'expansionBatch': BATCH})
    chapter = next(row for row in data['lifeChapters'] if row['id'] == 'life-08')
    block = {'type': 'p', 'text': '2020届MPAcc校友袁璐回顾校内、校外导师共同指导文献、框架、调研和写作，并将政府会计学习与行政事业单位实习调研联系起来。硕士导师未具名，属于历史个案；不据此推断当前机会，也不把其厦大博士经历并入南审硕士阶段。[R802]',
             'sourceCodes': ['R802'], 'expansionId': 'round7-mpacc-alumni-yuanlu', 'expansionBatch': BATCH}
    if not any(row.get('expansionId') == block['expansionId'] for row in chapter['blocks']):
        position = next((i for i, row in enumerate(chapter['blocks']) if '实习先落实认定与证明' in row.get('text', '')), len(chapter['blocks']))
        chapter['blocks'].insert(position, block)
    chapter['sourceCodes'] = list(dict.fromkeys(chapter['sourceCodes'] + ['R802']))
    index = next(row for row in data['lifeChapters'] if row['id'] == 'life-12')
    if not any('R802' in row.get('sourceCodes', []) for row in index['blocks']):
        index['blocks'].append(item['recommendedPlacement']['sourceIndexBlock'])
    index['sourceCodes'] = list(dict.fromkeys(index['sourceCodes'] + ['R802']))
    return 1


def add_screenshots(data):
    path = ROOT / 'data/reviews_round7/screenshot-manifest.json'
    if not path.exists():
        return 0
    manifest = json.loads(path.read_text())
    assert manifest['actualJpegFiles'] and manifest['privacyReviewed']
    assert not manifest['containsLoginQrOrPrivateContact']
    for image in manifest['images']:
        payload = (ROOT / 'dist' / image['src'][2:]).read_bytes()
        assert len(payload) == image['bytes'] and hashlib.sha256(payload).hexdigest() == image['sha256']
        assert image['textAltered'] is False and image['kind'] == 'actual-browser-screenshot'
        if image['reviewId']:
            mentor = next(row for row in data['mentors'] if row['id'] == image['mentorId'])
            review = next(row for row in mentor['studentReviews']['reviews'] if row['id'] == image['reviewId'])
            assert image['sourceId'] in review['sourceIds']
            review['screenshots'] = [image]
            review.setdefault('priorReadingScope', review['readingScope'])
            review['readingScope'] = '先前文字记录：' + review['priorReadingScope'].replace('本轮', '前次') + '；本次截图复核：' + image['scope']
            review['readThisRound'] = True
    for code, scope in manifest['postReadingScopes'].items():
        images = [image for image in manifest['images'] if image['sourceId'] == code]
        data['sourceRegistry'][code]['screenshots'] = images
        data['sourceRegistry'][code]['latestPublicReadingScope'] = scope
        source_url = data['sourceRegistry'][code]['canonicalUrl']
        note_id = source_url.rstrip('/').split('/')[-1]
        post = next(row for row in data['socialPosts'] if row['id'] == note_id)
        post['screenshots'] = images
        if scope not in post['readingScopes']:
            post['readingScopes'].append(scope)
    return len(manifest['images'])


def extend(write=False):
    data = json.loads(DATA.read_text())
    protected = {name: deepcopy(data[name]) for name in ('musicPlaylist', 'internships', 'downloads')}
    source = json.loads((ROOT / 'data/reviews_round7/names_a.json').read_text())['sources'][0]
    assert source['read'] is True and source['mentorId'] == 'mentor-11'
    assert source['narrator'] == '李佳林' and source['date'] == '2022-12-22'
    url = source['canonicalUrl']
    assert url == 'https://xyh.univs.cn/a/xyh_xyh_nsqn/221222/1824163.shtml'
    if CODE in data['sourceRegistry']:
        assert data['sourceRegistry'][CODE]['canonicalUrl'] == url
    registry = {'code': CODE, 'title': source['title'], 'label': source['title'],
                'url': url, 'originalUrl': url, 'canonicalUrl': url,
                'date': source['date'], 'author': '南京审计大学·南审青年校园号',
                'platform': source['platform'], 'kind': '官方学生访谈',
                'population': '2019级会计学硕士李佳林，原文未确认MPAcc/1253',
                'summary': source['summary'], 'readingScope': source['content_read_scope'],
                'limitations': '2022年学校精选正面访谈；未明确会计学硕士的学位类型，不作为MPAcc直系评价；未说明组会频率、改稿周期或事务所实习安排。',
                'expansionBatch': BATCH}
    data['sourceRegistry'][CODE] = registry
    official_key = 'official:reviews7:' + hashlib.sha256(url.encode()).hexdigest()[:14]
    official = {'key': official_key, 'ids': [CODE], 'title': source['title'],
                'author': registry['author'], 'date_display': source['date'],
                'url': url, 'canonical_url': url, 'population': registry['population'],
                'summary': source['summary'],
                'tips': ['李佳林明确导师为潘俊，回顾政府会计研究入门；学位类型未确认MPAcc。'],
                'comments': [], 'limits': registry['limitations'],
                'topic': '具名硕士学生的历史研究经历',
                'use_status': '学校精选访谈；关系可归属，非独立口碑抽样',
                'reading_scopes': [source['content_read_scope']], 'official': True,
                'screened_only': False, 'expansionBatch': BATCH}
    if not any(item.get('canonical_url') == url for item in data['officialEvidence']):
        data['officialEvidence'].append(official)
    mentor = next(item for item in data['mentors'] if item['id'] == 'mentor-11')
    dossier = mentor['studentReviews']
    record = {'id': REVIEW_ID, 'sourceIds': [CODE], 'sourceUrl': url, 'canonicalUrl': url,
              'sourceTitle': source['title'], 'postAuthor': registry['author'],
              'postDate': source['date'], 'narrator': '李佳林',
              'identity': '学校精选访谈中的具名硕士受访者', 'date': source['date'],
              'degree': source['degree'], 'year': '2019级，报道发表于2022年',
              'relationship': '正文及图注明确导师为潘俊，学位类型未确认MPAcc',
              'experienceType': 'interview', 'experienceLabel': '具名硕士研究经历，未确认MPAcc',
              'firsthand': True, 'polarity': 'positive',
              'attribution': {'status': 'confirmed', 'alias': '原文全名',
                              'reason': source['attribution']['reason']},
              'text': '李佳林回顾由潘俊引导接触政府会计研究，并逐步确认自己的研究兴趣。',
              'specifics': ['原文标明2019级会计学硕士，未给出MPAcc或1253代码。',
                            '她也提到研究受阻时的同门支持，不能把同门帮助全部归给导师。'],
              'limits': source['review']['limits'], 'readingScope': source['content_read_scope'],
              'readThisRound': True, 'expansionBatch': BATCH}
    if not any(item['id'] == REVIEW_ID for item in dossier['reviews']):
        dossier['reviews'].append(record)
    else:
        dossier['reviews'] = [record if item['id'] == REVIEW_ID else item for item in dossier['reviews']]
    # The existing explicit MPAcc case remains the basis of the teacher's category.
    assert dossier['coverageStatus'] == 'mpacc_guidance'
    dossier['summary'] = '有孙昊晨的明确MPAcc指导经历，另有李佳林的具名硕士研究入门经历（未确认MPAcc）；两者均为学校精选历史访谈。'
    point = next(point for point in dossier['recommendationPoints'] if '政府会计' in point['text'])
    point['text'] = '具名硕士学生分别记录了政府会计入门引导与实务问题选题；对该方向有兴趣者可询问目前的文献训练、入门任务和选题渠道。'
    point['reviewIds'] = list(dict.fromkeys(point['reviewIds'] + [REVIEW_ID]))
    point['sourceIds'] = list(dict.fromkeys(point['sourceIds'] + [CODE]))
    point['scope'] = '孙昊晨明确MPAcc；李佳林仅标会计学硕士；两个历史个案，不代表全体现状'
    question = '近两届学生每轮改稿一般多久、由谁直接反馈；研二事务所忙季如何协调组会和论文节点？'
    if question not in dossier['verificationQuestions']:
        dossier['verificationQuestions'].append(question)
    if source['content_read_scope'] not in dossier['searchCoverage']['readingScopes']:
        dossier['searchCoverage']['readingScopes'].append(source['content_read_scope'])
    alumni_count = add_alumni_context(data)
    screenshot_count = add_screenshots(data)
    total = sum(len(item['studentReviews']['reviews']) for item in data['mentors'])
    assert total == 40 and len(data['officialEvidence']) == 183 + alumni_count and len(data['socialPosts']) == 114
    assert len(data['mentors']) == 34 and len(data['musicPlaylist']['tracks']) == 19
    meta = data['meta']['studentReviewResearch']
    meta['reviewRecords'] = total
    meta['newSourceCodes'] = list(dict.fromkeys(meta['newSourceCodes'] + [CODE]))
    meta['newOfficialEvidenceCount'] = 2
    meta['round7'] = {'newSources': 1, 'newStudentExperiences': 1, 'newXhsSources': 0,
                      'screenshotsCaptured': screenshot_count, 'publicSearchQueriesSubmitted': 89,
                      'browserCaptureStatus': 'actual source screenshots acquired; public comments only',
                      'xhsPostBodiesReread': 8, 'xhsPublicCommentSourcesReread': 2,
                      'newGeneralMpaccAlumniSources': alumni_count,
                      'sourceCodes': [CODE], 'scope': '新增1个具名导师学生访谈和1个未具名导师MPAcc校友访谈；旧小红书正文与公开评论补读，不计新帖；折叠登录内容未读'}
    data['meta']['counts']['studentReviewRecords'] = total
    data['meta']['counts']['officialEvidence'] = len(data['officialEvidence'])
    data['meta']['platformNote'] = f'社交来源索引实际114条，官方公开资料{len(data["officialEvidence"])}条；同帖补读、同事件附件和转载不重复计数。课程体验、学位类型未明的硕士经历与明确MPAcc指导分开呈现。'
    for name, original in protected.items():
        assert data[name] == original, 'Unrelated data changed: ' + name
    coverage_path = ROOT / 'data/student-review-coverage.json'
    coverage = json.loads(coverage_path.read_text())
    coverage['summary'] = deepcopy(meta)
    row = next(item for item in coverage['teachers'] if item['mentorId'] == 'mentor-11')
    row.update(reviewCount=len(dossier['reviews']), firsthandCount=sum(item.get('firsthand') is True for item in dossier['reviews']),
               sourceIds=list(dict.fromkeys(code for item in dossier['reviews'] for code in item['sourceIds'])),
               recommendationPointCount=len(dossier['recommendationPoints']), supportedConcernCount=len(dossier['concerns']),
               verificationQuestionCount=len(dossier['verificationQuestions']))
    sources_path = ROOT / 'data/student-review-sources.json'
    sources = json.loads(sources_path.read_text())
    sources['newSourceCodes'] = list(dict.fromkeys(sources['newSourceCodes'] + [CODE]))
    if not any(item.get('code') == CODE for item in sources['sources']):
        sources['sources'].append(registry)
    qa_path = ROOT / 'data/student-review-qa.json'
    qa = json.loads(qa_path.read_text())
    qa['counts'] = deepcopy(meta)
    if not any(item.get('code') == CODE for item in qa['sourceChanges']):
        qa['sourceChanges'].append({'code': CODE, 'action': 'new_official_student_interview'})
    if write:
        dump(DATA, data)
        dump(coverage_path, coverage)
        dump(sources_path, sources)
        dump(qa_path, qa)
        dump(ROOT / 'data/reviews-round7-qa.json', {'ok': True, **meta['round7'],
            'reviewRecords': total, 'officialEvidence': len(data['officialEvidence']),
            'socialPosts': len(data['socialPosts']), 'sameNewSourceFoundByBothAgentsCountedOnce': True,
            'unrelatedMusicAndInternshipDataPreserved': True})
    print(json.dumps({'write': write, 'reviewRecords': total, **meta['round7']}, ensure_ascii=False))


if __name__ == '__main__':
    import sys
    extend('--write' in sys.argv)
