"""Merge public mentor relationships and dated alumni outcomes; keep degree gaps explicit."""
import copy
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/mentor_outcomes_20261113'
TARGET = ROOT / 'dist/data/site-data.json'
AS_OF = '2026-11-13'


def items(value):
    return value if isinstance(value, list) else [value] if value else []


def canonical(value):
    parts = urlsplit(value or '')
    return urlunsplit((parts.scheme, parts.netloc.removeprefix('www.'), parts.path, '', ''))


def main():
    data = json.loads(TARGET.read_text())
    before_reviews = sum(len(m.get('studentReviews', {}).get('reviews', [])) for m in data['mentors'])
    before_sources = len(data['sourceRegistry'])
    batches = [json.loads((INPUT / name).read_text()) for name in
               ['group-a.json', 'group-b.json', 'group-c.json', 'school-outcomes.json']]
    by_name = {m['name']: m for m in data['mentors']}
    registry = data['sourceRegistry']
    urls = {canonical(s.get('canonicalUrl') or s.get('url') or s.get('originalUrl')): code
            for code, s in registry.items()}
    source_map = {}
    research_sources = {}
    for batch in batches:
        for src in batch.get('sources', []):
            research_sources[src['id']] = src
            code = urls.get(canonical(src['url']))
            if not code:
                code = src['id']
                assert code not in registry, code
                registry[code] = {
                    'code': code, 'kind': 'official', 'title': src['title'], 'label': src['title'],
                    'url': src['url'], 'canonicalUrl': src['url'], 'originalUrl': src['url'],
                    'date': src.get('date'), 'platform': src.get('publisher', '学校公开资料'),
                    'readingScope': src.get('reading_scope') or src.get('readingScope'),
                    'limitations': '；'.join(items(src.get('limits'))),
                    'expansionBatch': 'mentor-outcomes-20261113',
                }
                urls[canonical(src['url'])] = code
            source_map[src['id']] = code
            if not registry[code].get('date') and src.get('date'):
                registry[code]['date'] = src['date']

    def ids(value):
        return list(dict.fromkeys(source_map.get(x, x) for x in items(value)))

    def refs(obj):
        return ids((obj or {}).get('source_ids') or (obj or {}).get('sourceIds'))

    def record(raw):
        label = raw.get('degree') or '硕士类型未注明'
        degree = ('MPAcc' if 'MPAcc' in label else 'MAud' if 'MAud' in label or '审计专' in label
                  else 'academic_master' if '学术型' in label or '学硕' in label and '未' not in label
                  else 'undergraduate' if '本科' in label
                  else 'master_unspecified' if '硕士' in label else 'unspecified')
        mentor_name = raw.get('mentorName')
        mentor = by_name.get(mentor_name)
        rel = raw.get('relationship')
        rel = {'text': rel['text'], 'sourceIds': refs(rel)} if rel and rel.get('text') and refs(rel) else None
        out = raw.get('outcome') or {}
        kind = out.get('type') or ''
        out_type = 'phd' if 'doctoral' in kind or '博士深造' in kind else 'employment' if any(
            x in kind for x in ['employment', '就业', '任教']) else 'further_study'
        out_ids = refs(out)
        dates = [registry[x].get('date') for x in out_ids if registry.get(x, {}).get('date')]
        result = {
            'id': raw['id'], 'studentName': raw['studentName'], 'degree': degree,
            'degreeLabel': label, 'cohort': str(raw['cohort']) if raw.get('cohort') is not None else None,
            'graduationYear': raw.get('graduationYear'),
            'mentorId': mentor['id'] if mentor and rel else None,
            'mentorName': mentor_name if rel else None, 'relationship': rel,
            'relationshipStatus': 'confirmed' if mentor and rel else 'confirmed_external' if rel else 'not_public',
            'outcome': {
                'type': out_type, 'organization': out.get('organization'),
                'program': out.get('program') or out.get('role'), 'year': out.get('year'),
                'statusLabel': out.get('status') or out.get('statusLabel'),
                'asOf': max(dates) if dates else None, 'sourceIds': out_ids,
            } if out.get('organization') else None,
            'sourceIds': refs(raw), 'limits': items(raw.get('limits')),
        }
        if raw.get('academicAchievement'):
            a = raw['academicAchievement']
            result['achievement'] = {'text': a['text'], 'sourceIds': refs(a)}
        return result

    records, achievements = [], []
    for batch in batches:
        raw_records = (batch.get('records', []) + batch.get('supplementary_school_records', [])
                       + batch.get('school_records', []) + batch.get('reviewed_existing_records', []))
        for raw in raw_records:
            r = record(raw)
            if r['outcome']:
                # A dated, directly documented mentor relationship takes priority over a school-only mirror.
                key = (r['studentName'], r['outcome']['type'], r['outcome']['organization'])
                if not any((x['studentName'], x['outcome']['type'], x['outcome']['organization']) == key for x in records):
                    records.append(r)
            elif r.get('achievement'):
                achievements.append(r)
    yuan = next(r for r in records if r['studentName'] == '袁璐' and r['mentorId'])
    for r in records:
        if r['studentName'] == '袁璐' and not r['mentorId']:
            for key in ['mentorId', 'mentorName', 'relationship', 'relationshipStatus']:
                r[key] = copy.deepcopy(yuan[key])
            r['sourceIds'] = list(dict.fromkeys(r['sourceIds'] + yuan['sourceIds']))

    statistics = []
    for raw in batches[3].get('stats', []):
        statistics.append({
            'id': raw['id'], 'label': raw['metric'], 'value': raw['value'],
            'scope': raw['scope'], 'cohort': raw['cohort'],
            'sourceIds': refs(raw), 'limits': items(raw.get('limits')),
        })
    data['studentOutcomes'] = {'asOf': AS_OF, 'records': records, 'statistics': statistics,
                               'achievements': achievements}

    # Award reports are official works, not personal student ratings or destinations.
    additions = []
    for r in achievements:
        if r['mentorId']:
            additions.append((by_name[r['mentorName']], {
                'id': r['id'], 'kind': 'official', 'category': '具名学位论文成果',
                'statusLabel': '学位论文成果 · 非学生评价', 'population': r['degreeLabel'],
                'date': next((registry[c].get('date') for c in r['sourceIds'] if registry[c].get('date')), None),
                'text': f"{r['studentName']}：{r['achievement']['text']}",
                'url': registry[r['achievement']['sourceIds'][0]]['url'],
                'limitations': '；'.join(r['limits']), 'sourceIds': r['sourceIds'],
            }))
    for raw in batches[2].get('aggregateReviews', []):
        mentor = by_name[raw['mentorName']]
        codes = refs(raw)
        additions.append((mentor, {
            'id': raw['id'], 'kind': 'official', 'category': '全校学生投票汇总',
            'statusLabel': '学生投票荣誉 · 非MPAcc个人评价', 'population': '全校学生；学位类型未分组',
            'date': registry[codes[0]].get('date'), 'text': raw['review']['text'],
            'url': registry[codes[0]]['url'], 'limitations': '；'.join(items(raw['limits'])), 'sourceIds': codes,
        }))
    for mentor, evidence in additions:
        if not any(e.get('id') == evidence['id'] for e in mentor['evidence']):
            # Existing award evidence is already visible; only add genuinely new entries.
            if evidence['id'] != 'MOB-huayuqian-wangjingyong-existing':
                mentor['evidence'].append(evidence)

    # One newly attributable historical MPAcc account, cross-checked against the college list.
    mentor = by_name['潘俊']
    dossier = mentor['studentReviews']
    dossier['summary'] = '孙昊晨、袁璐有明确MPAcc身份的历史指导经历；李佳林为具名硕士研究入门经历，未确认MPAcc。均为学校或教指委精选访谈，袁璐的导师关系由学院名单交叉核对。'
    review_id = 'sr-outcomes-20261113-yuanlu'
    yuan_raw = next(r for r in batches[0]['records'] if r['studentName'] == '袁璐')
    if not any(r['id'] == review_id for r in dossier['reviews']):
        codes = refs(yuan_raw['review'])
        dossier['reviews'].append({
            'id': review_id, 'sourceIds': codes, 'sourceUrl': registry[ids(['MOA09'])[0]]['url'],
            'canonicalUrl': registry[ids(['MOA09'])[0]]['url'],
            'sourceTitle': registry[ids(['MOA09'])[0]]['title'], 'postAuthor': '全国MPAcc教指委校友访谈',
            'postDate': '2025-04-14', 'narrator': '袁璐', 'identity': '南审2020届MPAcc校友',
            'date': '2025-04-14', 'degree': 'MPAcc', 'year': '2020届',
            'relationship': '校内学位导师；由学院名单与同名同路径校友访谈交叉核对',
            'experienceType': 'interview', 'experienceLabel': '历史MPAcc校友访谈',
            'firsthand': True, 'polarity': 'positive',
            'attribution': {'status': 'confirmed', 'alias': '潘俊', 'reason': yuan['relationship']['text']},
            'text': yuan_raw['review']['text'],
            'specifics': ['文献梳理、理论框架、调研与写作属于校内和校外双导师共同训练。'],
            'limits': yuan_raw['limits'],
            'readingScope': ['教指委访谈全文、学院考博名单中袁璐行；未使用博士导师经历评价南审导师。'],
            'readThisRound': True,
            'contextAssessment': {'status': 'attributed_cross_source', 'displayLabel': '具名MPAcc校友回顾',
                                  'eligibleForRecommendation': True, 'eligibleForConcern': False,
                                  'reason': '学院具名导师名单与校友访谈交叉对应；保留双导师边界。',
                                  'scope': '2020届单一历史个案', 'batch': 'mentor-outcomes-20261113'},
        })

    for r in records:
        assert r['outcome']['organization'] and r['outcome']['sourceIds'], r['id']
        if r['mentorId']:
            assert by_name[r['mentorName']]['id'] == r['mentorId'] and r['relationship']['sourceIds']
        for code in r['sourceIds'] + r['outcome']['sourceIds'] + (r['relationship'] or {}).get('sourceIds', []):
            assert code in registry, (r['id'], code)
    data['meta']['counts']['studentOutcomes'] = len(records)
    review_count = sum(len(m.get('studentReviews', {}).get('reviews', [])) for m in data['mentors'])
    data['meta']['counts']['studentReviewRecords'] = review_count
    data['meta']['studentReviewResearch']['reviewRecords'] = review_count
    data['meta']['mentorOutcomes'] = {'asOf': AS_OF, 'records': len(records),
        'linkedMentorRecords': sum(bool(r['mentorId']) for r in records),
        'distinctStudents': len({r['studentName'] for r in records})}
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    report = {'records': len(records), 'distinctStudents': len({r['studentName'] for r in records}),
              'linkedMentorRecords': sum(bool(r['mentorId']) for r in records),
              'schoolOrExternalRecords': sum(not r['mentorId'] for r in records),
              'mpaccRecords': sum(r['degree'] == 'MPAcc' for r in records),
              'newSourceCodesThisRun': len(registry) - before_sources,
              'studentReviewRecords': sum(len(m.get('studentReviews', {}).get('reviews', [])) for m in data['mentors']),
              'newStudentReviewsThisRun': sum(len(m.get('studentReviews', {}).get('reviews', [])) for m in data['mentors']) - before_reviews,
              'sourceCodeMap': source_map}
    (INPUT / 'merge-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'sourceCodeMap'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
