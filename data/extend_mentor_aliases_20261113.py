"""Resolve scoped name abbreviations separately from the strength of each comment."""
import copy
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/alias_mapping_20261113'
TARGET = ROOT / 'dist/data/site-data.json'
normalize = lambda value: ''.join(str(value or '').lower().split())


def main():
    data = json.loads(TARGET.read_text())
    research = json.loads((DIR / 'roster-alias-research.json').read_text())
    dbr = json.loads((DIR / 'dbr-research.json').read_text())
    mentors = {m['id']: m for m in data['mentors']}
    registry = data['sourceRegistry']
    src = next(s for s in research['sources'] if s['id'] == 'AM-SWT-PINYIN')
    registry.setdefault(src['id'], {
        'code': src['id'], 'kind': 'official', 'title': src['title'], 'label': src['title'],
        'url': src['url'], 'canonicalUrl': src['url'], 'originalUrl': src['url'],
        'date': src['date'], 'platform': src['publisher'], 'readingScope': src['reading_scope'],
        'limitations': '仅核对中英文姓名与学校单位，不作为学生评价或毕业去向。',
        'expansionBatch': 'mentor-aliases-20261113',
    })

    aliases = {}
    for row in research['rosterInitials']:
        code = row['abbreviation']
        if code not in aliases:
            aliases[code] = {'alias': code, 'variants': [code.lower(), ' '.join(code)],
                'mentorIds': [], 'status': 'search_only', 'basis': '姓名首字母检索',
                'sourceIds': [], 'reviewIds': [], 'observedInComment': False}
        entry = aliases[code]
        entry['mentorIds'].append(row['mentorId'])
        entry['sourceIds'] = list(dict.fromkeys(entry['sourceIds'] + row['source_ids']))
    for raw in research['aliases']:
        code = raw['alias']
        if code in ['WY', 'LH']:
            status, basis = 'ambiguous', '当前名录中同一缩写对应多位老师。'
        elif raw['status'] in ['dictionary_only', 'search_variant_only']:
            status, basis = 'search_only', ('姓氏英文署名为 SHAN，规范缩写 SWT。' if code == 'SWT' else '历史检索变体；规范缩写为 SWT。')
        elif raw['status'] == 'multiple_candidates':
            status, basis = 'ambiguous', '称呼对应多位候选，需结合原对话。'
        else:
            status = 'matched'
            basis = ('Dong Bi Rong 的姓名缩写，限定南审选导帖语境。' if code == 'DBR'
                     else '南审选导帖语境与当前名录姓名对应。' if raw['status'] == 'context_unique'
                     else '部分姓名对应；原帖这句是询问，不是评价。' if code == '许汉 y'
                     else '当前名录中的姓氏对照；具体经历另看原文。')
        previous = aliases.get(code, {})
        aliases[code] = {'alias': code,
            'variants': list(dict.fromkeys(previous.get('variants', []) + [code.lower(), raw.get('normalized', code)])),
            'mentorIds': raw['mentorIds'], 'status': status, 'basis': basis,
            'sourceIds': raw['source_ids'], 'reviewIds': [],
            'observedInComment': raw['observedInComment']}
    for alias, mid, code in [('董', 'mentor-01', 'X01'), ('高老师', 'mentor-09', 'X02')]:
        aliases[alias] = {'alias': alias, 'variants': [], 'mentorIds': [mid], 'status': 'matched',
            'basis': '当前名录中的姓氏对照；不跨帖推定接触关系。',
            'sourceIds': [code], 'reviewIds': [], 'observedInComment': True}

    proposals = copy.deepcopy(research['reviewProposals'])
    raw_dbr = copy.deepcopy(dbr['proposedIntegration']['reviewIfParentUsesGeneralRecord'])
    raw_dbr.update({'suggestedId': 'sr-alias-20261113-dbr', 'mentorId': 'mentor-01',
        'mentorName': '董必荣', 'narrator': '评论者（昵称未留存）', 'date': None,
        'postDate': '2025-04-02', 'relationship': '未说明本人接触关系',
        'sourceUrl': registry['X01']['canonicalUrl'],
        'text': '选导求助帖的评论出现“d b r”提名，未说明本人接触关系或具体指导过程。',
        'readingScope': '复核此前已读评论摘要；本次未重新取得该层评论逐字稿。',
        'readThisRound': False})
    proposals.insert(0, raw_dbr)
    new_ids = []
    for raw in proposals:
        mid, rid = raw['mentorId'], raw['suggestedId']
        mentor = mentors[mid]
        review = {key: copy.deepcopy(raw[key]) for key in [
            'sourceIds', 'sourceUrl', 'narrator', 'date', 'postDate', 'degree', 'relationship',
            'experienceType', 'firsthand', 'polarity', 'text', 'attribution', 'contextAssessment']}
        review.update({'id': rid, 'canonicalUrl': registry['X01']['canonicalUrl'],
            'sourceUrl': registry['X01']['url'],
            'sourceTitle': '南审mpacc导师求推荐 · 缩写评论',
            'year': None, 'specifics': [], 'limits': copy.deepcopy(raw['limits']),
            'readingScope': [raw['readingScope']], 'readThisRound': raw['readThisRound']})
        review['attribution']['status'] = 'confirmed'
        review['attribution']['reason'] = '南审会计专硕选导帖语境中，按当前名录姓名缩写对应；接触身份与具体内容另行标注。'
        review['contextAssessment'].update({'eligibleForRecommendation': False,
            'eligibleForConcern': False, 'status': 'alias_attitude_without_experience',
            'batch': 'mentor-aliases-20261113'})
        if mid == 'mentor-05':
            review['text'] = '选导求助帖中，douzie以MDL作正面提名，未给出具体行为或本人指导关系。'
        if mid == 'mentor-14':
            review['text'] = '粥Zhou的评论表达不建议选择YBY的态度；可见部分未说明原因、学位或本人接触关系。'
            review['screenshots'] = copy.deepcopy(registry['X01'].get('screenshots', [])[:1])
            review['contextAssessment']['displayLabel'] = '选择态度 · 未说明理由或经历'
        else:
            review['contextAssessment']['displayLabel'] = '原帖提名 · 未说明具体经历'
        dossier = mentor['studentReviews']
        if not any(item['id'] == rid for item in dossier['reviews']):
            dossier['reviews'].append(review)
        else:
            dossier['reviews'] = [review if item['id'] == rid else item for item in dossier['reviews']]
        new_ids.append(rid)
        key = {'mentor-01': 'DBR', 'mentor-05': 'MDL', 'mentor-14': 'YBY'}[mid]
        aliases[key]['reviewIds'] = [rid]
        if mid in ['mentor-01', 'mentor-05']:
            dossier['coverageStatus'] = 'weak_mentions'
            dossier['coverageLabel'] = '原帖提名 · 暂缺具体经历'
            dossier['summary'] = f'{key}已对应{mentor["name"]}；现有评论是提名，尚缺具体指导经历。'
            dossier['gaps'] = ['评论者学位、年级和本人接触关系未说明；尚缺近年直系MPAcc的具体指导经历。']
            dossier.get('searchCoverage', {})['gaps'] = dossier['gaps'][:]
            mentor['feedbackStatus'] = dossier['coverageLabel']
            mentor['feedbackDetails'] = {'status': dossier['coverageLabel'],
                'basis': dossier['summary'], 'limits': '评论完整原句或接触细节缺失；提名不代表已核实的指导体验。'}

        post = next(item for item in data['socialPosts'] if item.get('id') == '67ecb72b000000001e0042af')
        if not any(item.get('aliasReviewId') == rid for item in post['comments']):
            post['comments'].append({'teacher': mentor['name'], 'author': review['narrator'],
                'date_display': review['date'] or '日期未留存', 'relationship': review['relationship'],
                'content': review['text'], 'limits': '；'.join(review['limits']),
                'use_status': review['contextAssessment']['displayLabel'],
                'contextAssessment': review['contextAssessment'], 'aliasReviewId': rid})

    data['mentorAliases'] = list(aliases.values())
    alias_by_term = {}
    for item in data['mentorAliases']:
        for term in [item['alias'], *item['variants']]:
            alias_by_term[normalize(term)] = item
    for item in data['ambiguousMentorAliases']:
        terms = str(item['alias']).replace('／', '/').split('/')
        match = next((alias_by_term.get(normalize(term)) for term in terms if alias_by_term.get(normalize(term))), None)
        if match:
            item.update({'status': 'mapped_identity' if match['status'] == 'matched' else
                          'potential_collision' if match['status'] == 'ambiguous' else 'search_only',
                'mentorIds': match['mentorIds'], 'label': '姓名已对应' if match['status'] == 'matched' else '多位姓名候选',
                'reason': match['basis'], 'verificationGap': '姓名对应后，仍分别核对评论者身份与具体经历。',
                'publishUnderNamedMentor': bool(match['reviewIds'])})

    # Correct current editorial rules without inventing missing comment text.
    replacements = {
        '评论身份未独立认证，缩写不映射；同人跟评不算独立来源。': '评论身份未独立认证；缩写按姓名对照关联，体验仍按原文身份标注；同人跟评不算独立来源。',
        '负面缩写及只有姓氏的评论不映射给任何导师。': '缩写与称呼按对照表列姓名或候选；无理由态度不当作具体指导经历。',
        '只有姓氏、缩写或称呼的评论不归到实名导师，即使出现在同一帖的相邻位置。': '缩写和称呼按原帖语境对应姓名；多候选不强配，相邻评论不自动共用对象。',
        '不是导师名单认证，缩写不对应实名。': '缩写按姓名对照展示；截图不确认评论者学位或指导关系。',
        '缩写、姓氏不完整、无理由的负面评论及私聊引流均未用于个人判断；': '缩写与姓名分项对照；无理由态度和私聊引流不作具体指导结论；',
    }
    def replace(value):
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, str):
            for old, new in replacements.items(): value = value.replace(old, new)
        return value
    data = replace(data)
    data['meta']['studentReviewResearch']['attributionRule'] = '姓名缩写按当前南审导师语境建立对照；多候选保留歧义，评价另按接触身份、具体内容与来源标注。'
    count = sum(len(m['studentReviews']['reviews']) for m in data['mentors'])
    counts = Counter(m['studentReviews']['coverageStatus'] for m in data['mentors'])
    data['meta']['counts']['studentReviewRecords'] = count
    data['meta']['counts']['mentorsWithStudentReviews'] = sum(bool(m['studentReviews']['reviews']) for m in data['mentors'])
    data['meta']['studentReviewResearch'].update({'reviewRecords': count, 'coverageCounts': dict(counts),
        'teachersWithAttributableReviews': data['meta']['counts']['mentorsWithStudentReviews']})
    data['meta']['mentorAliasResearch'] = {'date': '2026-11-13', 'rosterNames': 34,
        'initialGroups': 31, 'namedGeneralRecords': 3, 'newFirsthandRecords': 0, 'newXhsPosts': 0}
    for item in data['mentorAliases']:
        assert all(mid in mentors for mid in item['mentorIds'])
        assert all(code in registry for code in item['sourceIds']), item
    assert all(any(r['id'] == rid for m in data['mentors'] for r in m['studentReviews']['reviews']) for rid in new_ids)
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    report = {'aliasEntries': len(data['mentorAliases']), 'visibleAliasEntries': sum(x['status'] != 'search_only' for x in data['mentorAliases']),
        'initialGroups': 31, 'namedGeneralRecordIds': new_ids, 'studentReviewRecords': count,
        'newFirsthandRecords': 0, 'newSocialPosts': 0, 'sourceRegistryCount': len(registry),
        'collisionGroups': {'WY': ['王烨', '王禹'], 'LH': ['李华', '凌华', '李慧']}}
    (DIR / 'merge-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
