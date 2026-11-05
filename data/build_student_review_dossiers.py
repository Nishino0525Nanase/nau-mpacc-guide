#!/usr/bin/env python3
"""Build bounded, source-linked student review dossiers. Dry-run unless --write.

The research input is not an approval to publish every discovered statement.
Only confirmed full-name attribution enters a named dossier; initials remain
separate, with no quoted allegations or candidate-name association.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/site-data.json'
INPUT_ROOT = ROOT / 'data/reviews_research'
BATCH = 'student-reviews-2026-11'
LABELS = {
    'mpacc_guidance': '明确MPAcc指导经历',
    'non_mpacc_guidance': '本科项目指导经历',
    'guidance_unspecified': '学位阶段未明的指导经历',
    'course_only': '仅课程接触与有限转述',
    'weak_mentions': '仅笼统提名或身份未明',
    'not_found': '未找到可归属的个人评价',
}
NEW_SOURCES = {
    'https://www.sohu.com/a/500320907_769713': 'R701',
    'https://news.nau.edu.cn/2026/0622/c5799a159560/page.htm': 'R702',
}


def unique(xs):
    return list(dict.fromkeys(x for x in xs if x not in (None, '')))


def arr(x):
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def key(url):
    if not url:
        return ''
    p = urlsplit(url)
    return urlunsplit((p.scheme.lower(), p.netloc.lower().removeprefix('www.'), p.path.rstrip('/'), '', ''))


def digest(*parts):
    return sha256('\n'.join(str(p) for p in parts).encode()).hexdigest()[:14]


def confirmed(r):
    return str(r.get('attribution', {}).get('status', '')).startswith('confirmed') and r.get('read') is True


def build_source_map(data):
    out = {}
    for code, s in data['sourceRegistry'].items():
        k = key(s.get('canonicalUrl') or s.get('url'))
        out.setdefault(k, []).append(code)
    return out


def correct_existing_attribution(data):
    """Apply a source re-read correction without changing post metadata.

    In X02 c6, 木渎 names 傅祥斐 but only says 高老师. The latter cannot
    cross threads to 高凤莲. The former is a weak undergraduate-view nomination,
    not an identified course or graduate advising experience.
    """
    eid = '69cba3e80000000028008246:c6'
    text = '木渎以本科生角度对傅祥斐作笼统正面提名，没有具体接触行为；同句另提“高老师”，姓名归属未确认。'
    limits = '傅祥斐有明确全名；“高老师”只有姓氏，不跨楼归给任何实名。未说明具体课程、导师关系或MPAcc指导经历。'
    for mentor in data['mentors']:
        if mentor['name'] == '高凤莲':
            mentor['evidence'] = [e for e in mentor['evidence'] if e.get('id') != eid]
        elif mentor['name'] == '傅祥斐':
            for e in mentor['evidence']:
                if e.get('id') == eid:
                    e.update(kind='uncertain', category='本科角度的弱提名', statusLabel='本科弱印象，接触类型未明',
                             population='自称本科生角度，未明确接触类型', text=text, limitations=limits)
    for p in data['socialPosts']:
        if p.get('id') == '69cba3e80000000028008246':
            for c in p.get('comments', []):
                if c.get('teacher') in ('高凤莲、傅祥斐', '傅祥斐') and c.get('author') == '木渎':
                    c.update(teacher='傅祥斐', content=text, limits=limits,
                             relationship='本科生角度；与傅祥斐的具体接触类型未明')
    for e in data['feedbackIndex']:
        if e.get('id') == eid:
            e.update(teacher='傅祥斐', content=text, limits=limits,
                     relationship='本科生角度；与傅祥斐的具体接触类型未明')
    for e in data['tipsIndex']:
        if e.get('id') == '69cba3e80000000028008246:comment6':
            e.update(point='评论补充：' + text, limits=limits)


def source_codes(r, source_map):
    k = key(r.get('canonicalUrl') or r.get('sourceUrl') or r.get('url'))
    explicit = str(r.get('sourceCodeIfExisting') or r.get('sourceCode') or r.get('code') or '')
    out = [c for c in re.split(r'\s*[/／,]\s*', explicit) if c in source_map.get(k, [])]
    if not out:
        out = source_map.get(k, [])[:1]
    if not out:
        for url, code in NEW_SOURCES.items():
            if key(url) == k:
                out = [code]
    # Prefer human source codes; duplicate aliases remain available in registry.
    return unique(out)


def experience_type(raw, relationship):
    s = str(raw) + ' ' + relationship
    if any(v in s for v in ('访谈', 'interview', 'named-student', 'project-experience')):
        return 'interview'
    if any(v in s for v in ('论文指导', '竞赛求教', '科研入门', 'MPAcc论文', '项目指导')):
        return 'guidance'
    if any(v in s for v in ('课程', '课堂', '中财', '授课', '上课', '班主任')):
        return 'course'
    return 'general'


def normalize_review(name, raw, source_map):
    rel = raw.get('relationship') or '未说明'
    canonical = raw.get('canonicalUrl') or key(raw.get('sourceUrl') or raw.get('url'))
    narrator = raw.get('commentAuthor') or raw.get('narrator') or raw.get('identity') or '公开受访者/评论者（未署名）'
    polarity = raw.get('polarity') or 'neutral'
    polarity = {'positive_with_limits': 'positive', 'positive_low_specificity': 'positive',
                'positive-and-caution': 'mixed', 'mixed-fit': 'mixed'}.get(polarity, polarity)
    if polarity not in ('positive', 'negative', 'mixed', 'neutral'):
        polarity = 'neutral'
    out = {
        'id': 'sr-' + digest(name, key(canonical), narrator),
        'sourceIds': source_codes(raw, source_map),
        'sourceUrl': raw.get('sourceUrl') or raw.get('url') or canonical,
        'canonicalUrl': canonical,
        'sourceTitle': raw.get('postTitle') or raw.get('sourceTitle') or '',
        'postAuthor': raw.get('postAuthor'),
        'postDate': raw.get('postDate'),
        'narrator': narrator,
        'identity': raw.get('identity') or '公开评论账号，身份未独立认证',
        'date': raw.get('commentDate') or raw.get('postDate'),
        'degree': raw.get('degree') or '未说明',
        'year': raw.get('year') or '未说明',
        'relationship': rel,
        'experienceType': experience_type(raw.get('experienceType', ''), rel),
        'experienceLabel': raw.get('experienceType') or '接触经历',
        'firsthand': raw.get('firsthand') if raw.get('firsthand') in (True, False, None) else None,
        'polarity': polarity,
        'attribution': {'status': 'confirmed', 'alias': raw.get('attribution', {}).get('alias'),
                        'reason': raw.get('attribution', {}).get('reason') or '既有全文归因记录明确指向该姓名；评论者身份仍以自述为限。'},
        'text': raw.get('summary') or raw.get('text') or '',
        'specifics': arr(raw.get('specifics')),
        'limits': arr(raw.get('limits')),
        'readingScope': raw.get('readingScope') or '既有已读归因记录，未将未读分支升级为证据。',
        'readThisRound': raw.get('readThisRound', True),
    }
    for field in ('firsthandScope', 'hearsayParts', 'evidenceOrigin'):
        if raw.get(field):
            out[field] = raw[field]
    if raw.get('firsthand') == 'mixed':
        out['firsthandScope'] = '本人课程接触是直接经历；朋友的论文指导感受为转述，不计为本人硕士指导亲历。'
        out['hearsayParts'] = ['朋友的论文指导感受，朋友本人未在本评论中发言。']
    if name == '崔秀梅' and key(canonical) == key('https://news.nau.edu.cn/2026/1014/c11360a162564/page.psp'):
        # Independently checked source 17: keep the two narrators and their
        # different graduate experiences explicit within this one source record.
        out['text'] = '郁圳乐回忆学位论文经历十几稿；包昕梦描述研究生案例课堂中的汇报、质疑与现场应答训练。'
        out['specifics'] = [
            '郁圳乐回顾自己的学位论文经过十几稿修改；这是该生的经历，不是全体学生固定修改轮数。',
            '包昕梦描述案例课随机抽两组PK，汇报、质疑和现场应答后由教师点评。',
            '报道还记载提前进行论文、选题和考证规划；本科备赛的深夜反馈不作为研究生日常响应承诺。',
        ]
    return out


def baseline_reviews(mentor, data, source_map):
    """Retain reliable pre-existing course/first-person records not re-read.

    Official teacher profiles, awards and publication lists deliberately excluded.
    The three named MPAcc interviews are replaced by fresh source-level reads.
    """
    out = []
    posts = {key(p.get('canonicalUrl') or p.get('url')): p for p in data['socialPosts']}
    for e in mentor.get('evidence', []):
        if e.get('kind') == 'official':
            continue
        if mentor['name'] == '刘国城' and e['id'].endswith(':c10'):
            # This author only says the teacher taught them last semester.
            # A contact declaration contains no evaluation; retain the original
            # evidence record, but do not count it as a student review.
            continue
        src = posts.get(key(e.get('url')), {})
        pop = e.get('population') or '未说明'
        rel = pop
        raw = {
            'sourceUrl': e.get('url'), 'canonicalUrl': key(e.get('url')),
            'sourceCodeIfExisting': ' / '.join(c for c in e.get('sourceIds', []) if c in data['sourceRegistry'] and len(c) < 15),
            'postTitle': src.get('title') or '', 'postAuthor': src.get('author'),
            'postDate': src.get('date'), 'commentAuthor': e.get('author'),
            'commentDate': e.get('date'), 'identity': pop,
            'degree': '本科' if '本科' in pop else '未说明',
            'relationship': rel, 'experienceType': e.get('category'),
            'firsthand': {'firsthand': True, 'secondhand': False}.get(e.get('kind')),
            'polarity': 'mixed' if mentor['name'] in ('王烨', '崔秀梅', '程博') else 'positive',
            'summary': e.get('text'), 'limits': [e.get('limitations')],
            'readingScope': '保留既有已读且已限定归因的评论；本轮没有重读时不计为新增评论。',
            'attribution': {'status': 'confirmed', 'alias': '既有全名归因记录',
                            'reason': '既有记录已按完整姓名及上下文归因；身份/年级未独立认证。'},
            'read': True, 'readThisRound': False,
        }
        r = normalize_review(mentor['name'], raw, source_map)
        r['legacyEvidenceId'] = e['id']
        out.append(r)
    return out


def same_narrator(a, b):
    x, y = a['narrator'], b['narrator']
    return x == y or (len(x) > 3 and len(y) > 3 and (x in y or y in x))


def coverage(name, reviews):
    if not reviews:
        return 'not_found'
    def advising(r):
        rel = r['relationship']
        return r['firsthand'] is True and any(t in rel for t in ('导师', '硕士学生', '论文指导', '受其指导', '竞赛求教', '项目指导'))
    guides = [r for r in reviews if advising(r)]
    if any(r['degree'] == 'MPAcc' or r['degree'].startswith('MPAcc（') for r in guides):
        return 'mpacc_guidance'
    if any('本科' not in r['degree'] for r in guides):
        return 'guidance_unspecified'
    if guides:
        return 'non_mpacc_guidance'
    if any(r['experienceType'] == 'course' for r in reviews):
        return 'course_only'
    return 'weak_mentions'


# Editorial conclusions remain tied to individual reviews, never to publication
# counts, teacher awards, initials or absence of complaints.
POINTS = {
    '张力': [('1874', '有本科上课者具体提到答疑耐心；如果重视沟通中的解释过程，这是可继续了解的课堂线索。', '本科课程答疑，非硕士改稿')],
    '崔秀梅': [('郁圳乐', '郁圳乐回顾学位论文十几稿，提供了反复修改的具体个案；希望训练论文论证者可询问当前指导安排。', '2023级MPAcc郁圳乐个人经历，非统一修改轮数'),
              ('包昕梦', '包昕梦描述案例课两组PK、汇报质疑与现场应答后点评；重视案例表达与应答训练者可进一步了解。', '2023级MPAcc包昕梦课堂经历')],
    '许汉友': [('张蓓', '历史MPAcc个案具体呈现从查读文献、综述到研究设计的渐进训练，也提到固定见面；适合据此询问当前入门支持。', '2015级MPAcc历史个案，不代表现行频次')],
    '刘国城': [('朱安琪', '跨专业硕士生回忆共同做项目、定期组会和因材施教，支持进一步询问跨专业基础训练及同门协作。', '2021年硕士历史个案，学硕/专硕待核')],
    '潘俊': [('孙昊晨', '具名MPAcc学生回忆导师直接指出问题并解释逻辑；愿意接受明确纠错、系统训练研究能力者可进一步了解。', '2025届MPAcc个案'), ('孙昊晨', '政府会计选题从实务讨论切入，再查报告、准则和文献；对公共文化资产等议题有兴趣者可询问当前研究机会。', '该生具体选题路径，非每名学生固定配置')],
    '叶邦银': [('浦军', '本科智能审计项目受阻时曾参与方向和行业需求把关；对算法与审计实践结合有兴趣者可询问MPAcc参与渠道。', '本科团队项目，三名教师分工合作')],
    '程博': [('🐶🐶', '课程接触者具体提到中财答疑耐心、表达温和；可作为了解沟通方式的课堂线索。', '课程答疑，非硕士日常指导'), ('小鱼鱼鱼', '公司治理课程回访提供一次汇报与一篇研究设计的历史考核信息，便于带课程全名核实本学期任务。', '一次历史课程考核，自述专业年级未独立认证')],
    '傅祥斐': [('阿言爱吃棒棒糖', '自称受论文指导者描述老师会解释如何修改；重视具体改稿建议者可据此追问近年MPAcc反馈过程。', '论文阶段未明的匿名自述')],
}
CONCERNS = {
    '崔秀梅': [('包昕梦', '具名个案有提前布置任务和多轮改稿；若计划长时间实习，需提前对齐论文节点与训练投入，不能只凭“人好”判断时间要求。', '具名MPAcc个案反映训练投入，不等于统一任务量')],
    '潘俊': [('孙昊晨', '个案中的反馈较直接，也强调研究能力；应确认自己能否适应纠错方式，并核实就业或考公学生的实际任务，而非照搬申博个案。', '单名MPAcc研究训练个案')],
}


def points_for(name, reviews, mapping):
    out = []
    for needle, text, scope in mapping.get(name, []):
        refs = [r for r in reviews if needle in r['narrator'] or needle in r.get('identity', '')]
        if not refs:
            continue
        out.append({'text': text, 'reviewIds': [r['id'] for r in refs],
                    'sourceIds': unique(c for r in refs for c in r['sourceIds']), 'scope': scope})
    return out


def questions(mentor, teacher):
    qs = arr(teacher.get('concernsToVerify'))
    if not qs:
        qs = [f'围绕“{mentor["research"]}”，当前MPAcc有哪些可完成的选题、数据与方法训练？基础不足时由谁提供具体支持？',
              '请近两届直系MPAcc举一次选题纠偏或初稿修改的过程：联系频率、反馈时长、导师和团队分工分别怎样？',
              '向导师和学院核实当前招生名额；计划实习、就业或考公时，论文节点和研究任务怎样协调？']
    if len(qs) < 2:
        qs.append(f'结合“{mentor["research"]}”，请近两届直系MPAcc举一次本人收到的选题或改稿反馈，并说明联系频率、反馈周期和实习时的论文节点。')
    return unique(qs)


def sanitize_ambiguous(groups, source_registry):
    out = []
    def alias_key(value):
        if re.fullmatch(r'[A-Za-z /]+', value):
            return value.split('/')[0].replace(' ', '').upper()
        return value.lower()
    for group in groups:
        for raw in group.get('ambiguousAliases', []):
            if raw.get('alias') == '高老师':
                # Added once, in a stable position below, including when a
                # publish-safe checkpoint is itself used as the next input.
                continue
            if raw.get('status') in ('no-attributable-new-review-found', 'excluded-other-school'):
                # Search spellings without an observed review are not ambiguous
                # review leads. Keep the actual query log instead.
                continue
            alias = raw.get('alias') or '未确认缩写'
            url = raw.get('canonicalUrl') or raw.get('sourceUrl') or raw.get('url')
            source_code = raw.get('sourceCode') or raw.get('sourceCodeIfExisting')
            if not url and source_code in source_registry:
                source = source_registry[source_code]
                url = source.get('canonicalUrl') or source.get('url')
            if not source_code and url:
                source_code = next((c for c in ('X01', 'X02') if c in source_registry and
                                    key(source_registry[c].get('canonicalUrl') or source_registry[c].get('url')) == key(url)), None)
            status = raw.get('status')
            if status not in ('search_only', 'potential_collision'):
                status = 'potential_collision' if alias_key(alias) in ('WY', 'LH') and raw.get('read') is False else 'unresolved'
            label = {'search_only': '仅检索候选', 'potential_collision': '缩写存在潜在重名',
                     'unresolved': '已见线索但归属未确认'}[status]
            reason = '原文仅缩写、半姓名或姓氏；没有足够的全名确认、接触身份与具体经历，不归入任何实名导师评价。'
            gap = '需要作者明确全名及本人学位、接触年份/关系，并提供可核的专业经历。'
            if status == 'search_only':
                reason = '仅为检索尝试的拼音缩写；本轮未取得对应评价原文，不表示发现了未确认的学生评价。'
                gap = '如以后检得实际评论，再核对原文全名、接触身份和具体经历。'
            elif status == 'potential_collision':
                reason = '同一拼音缩写可能对应多名教师；这是归属核验提示，不表示本轮出现了该缩写的真实评价。'
                gap = '如遇缩写评论，需要独立的全名确认与本人接触关系，不能按名单猜测。'
            item = {'alias': alias, 'sourceUrl': url, 'sourceCode': source_code,
                    'status': status, 'label': label, 'reason': reason,
                    'verificationGap': gap,
                    'publishUnderNamedMentor': False}
            previous = next((x for x in out if alias_key(x['alias']) == alias_key(alias)), None)
            if previous is None:
                out.append(item)
            elif not previous.get('sourceUrl') and url:
                previous.update(sourceUrl=url, sourceCode=source_code)
    # The full-name and single-surname portions of the same comment have
    # different attribution certainty; never attach the latter to a candidate.
    if not any(x['alias'] == '高老师' for x in out):
        out.append({'alias': '高老师', 'sourceUrl': 'https://www.xiaohongshu.com/explore/69cba3e80000000028008246',
                    'sourceCode': 'X02', 'status': 'unresolved', 'label': '已见线索但归属未确认',
                    'reason': '原文仅有姓氏，所在对话未给出全名；不跨楼沿用其他评论的对象。',
                    'verificationGap': '需要作者明确姓名和本人接触关系。', 'publishUnderNamedMentor': False})
    return out


def new_source_record(code, review):
    return {'code': code, 'title': review['sourceTitle'], 'label': review['sourceTitle'],
            'url': review['sourceUrl'], 'originalUrl': review['sourceUrl'], 'canonicalUrl': review['canonicalUrl'],
            'author': review['postAuthor'], 'date': review['postDate'],
            'kind': '官方' if code == 'R702' else '公开平台具名学生故事',
            'population': review['identity'], 'limitations': '；'.join(review['limits']),
            'readingScopes': [review['readingScope']], 'expansionBatch': BATCH}


def source_intake(data, dossiers):
    changes = []
    for url, code in NEW_SOURCES.items():
        rs = [r for d in dossiers for r in d['reviews'] if key(r['canonicalUrl']) == key(url)]
        if not rs:
            raise ValueError(f'Whitelisted new source {code} lacks a read confirmed review')
        r = rs[0]
        data['sourceRegistry'][code] = new_source_record(code, r)
        if code == 'R701':
            # A school-signed Sohu account is kept as a public platform source,
            # rather than silently promoted to an official university domain.
            if not any(key(p.get('canonicalUrl') or p.get('url')) == key(url) for p in data['socialPosts']):
                data['socialPosts'].append({'id': 'sohu-500320907_769713', 'key': 'sohu:500320907_769713',
                    'sourceIds': [code], 'url': url, 'canonicalUrl': url,
                    'platform': '搜狐（页面来源署名南京审计大学）', 'title': r['sourceTitle'],
                    'author': r['postAuthor'], 'date': r['postDate'], 'population': r['identity'],
                    'summary': r['text'], 'tips': r['specifics'], 'limitations': '；'.join(r['limits']),
                    'readingScopes': [r['readingScope']], 'comments': [],
                    'category': '有边界的导师课程反馈', 'topic': '导师选择与研究训练',
                    'screenedOnly': False, 'needsVerification': True,
                    'verificationStatus': '具名学生历史经历，硕士类别与届级待核', 'expansionBatch': BATCH})
            changes.append({'code': code, 'action': 'new_social_post'})
        else:
            if not any(key(p.get('canonical_url') or p.get('url')) == key(url) for p in data['officialEvidence']):
                data['officialEvidence'].append({'key': 'official:student-review:' + digest(url), 'ids': [code],
                    'title': r['sourceTitle'], 'author': r['postAuthor'], 'date_display': '2026-07-08',
                    'url': url, 'canonical_url': url, 'population': r['identity'], 'summary': r['text'],
                    'tips': r['specifics'], 'comments': [], 'limits': '；'.join(r['limits']),
                    'topic': '本科智能审计团队项目经历', 'use_status': '官方具名学生故事',
                    'reading_scopes': [r['readingScope']], 'official': True, 'screened_only': False,
                    'expansionBatch': BATCH})
            changes.append({'code': code, 'action': 'new_official_evidence'})
    return changes


def run(write=False, allow_partial=False, input_dir=INPUT_ROOT):
    data = json.loads(DATA.read_text())
    before = deepcopy(data)
    correct_existing_attribution(data)
    paths = [input_dir / f'reviews_group_{g}.json' for g in 'abcd']
    missing = [str(p) for p in paths if not p.exists()]
    if missing and not allow_partial:
        raise SystemExit('Missing research inputs: ' + ', '.join(missing))
    groups = [json.loads(p.read_text()) for p in paths if p.exists()]
    teachers = {t['name']: t for group in groups for t in group['teachers']}
    source_map = build_source_map(data)
    coverage_rows, dossiers = [], []
    replaced, retained = 0, 0
    for mentor in data['mentors']:
        name = mentor['name']
        t = teachers.get(name, {})
        rs = baseline_reviews(mentor, data, source_map)
        for raw in t.get('reviews', []):
            if not confirmed(raw):
                continue
            new = normalize_review(name, raw, source_map)
            old = [r for r in rs if key(r['canonicalUrl']) == key(new['canonicalUrl']) and same_narrator(r, new)]
            # The older composite Wang Ye thread is replaced by its freshly read
            # source-level composite, even when its author string was shortened.
            if name == '王烨':
                old = [r for r in rs if key(r['canonicalUrl']) == key(new['canonicalUrl'])]
            for r in old:
                rs.remove(r)
                replaced += 1
            if new['id'] not in {r['id'] for r in rs}:
                rs.append(new)
        retained += sum(not r['readThisRound'] and 'legacyEvidenceId' in r for r in rs)
        status = coverage(name, rs)
        label = LABELS[status]
        if name == '傅祥斐':
            label = '论文指导自述，阶段未明'
        elif name == '王敬勇':
            label = '竞赛求教自述，阶段未明'
        elif name == '张兴亮':
            label = '曾受指导者弱评价，阶段未明'
        elif name == '刘国城':
            label = '历史硕士项目经历，类别待核'
        summary = t.get('coverageStatus') or ('已有课程或个人印象记录；范围见逐条身份与局限。' if rs else '在本轮公开检索范围内未取得可归属的学生个人评价；不等于没有评价，也不构成负面结论。')
        gap = unique(arr(t.get('gaps')) + ([] if status == 'mpacc_guidance' else ['尚缺近两届明确MPAcc直系学生的具体日常指导经历。']))
        d = {'coverageStatus': status, 'coverageLabel': label, 'summary': summary, 'reviews': rs,
             'recommendationPoints': points_for(name, rs, POINTS), 'concerns': points_for(name, rs, CONCERNS),
             'verificationQuestions': questions(mentor, t), 'gaps': gap,
             'aliasesTried': unique(arr(t.get('aliasesTried'))),
             'searchCoverage': {'queries': unique(arr(t.get('queries'))),
                 'readingScopes': unique(r['readingScope'] for r in rs), 'gaps': gap,
                 'note': '只说明实际检索和阅读边界，不声称覆盖全网或完整平台评论。'},
             'sampleCountNote': '同一评论者的跟评合并；同帖多条不等于多独立来源；学校精选访谈有选择偏差。'}
        mentor['studentReviews'] = d
        # The old summary said no social search had been performed. Keep legacy
        # evidence intact but replace those stale user-facing search statements.
        mentor['feedbackStatus'] = label
        mentor['feedbackDetails'] = {'status': label, 'basis': summary,
            'limits': '；'.join(gap) or '单个具名/匿名经历不能代表全部学生或承诺当前安排。'}
        dossiers.append(d)
        coverage_rows.append({'mentorId': mentor['id'], 'name': name, 'coverageStatus': status,
            'coverageLabel': label, 'reviewCount': len(rs), 'firsthandCount': sum(r['firsthand'] is True for r in rs),
            'sourceIds': unique(c for r in rs for c in r['sourceIds']),
            'recommendationPointCount': len(d['recommendationPoints']), 'supportedConcernCount': len(d['concerns']),
            'verificationQuestionCount': len(d['verificationQuestions'])})
    changes = source_intake(data, dossiers)
    ambiguity = sanitize_ambiguous(groups, data['sourceRegistry'])
    data['ambiguousMentorAliases'] = ambiguity
    source_updates = {}
    for group in groups:
        for src in group.get('sources', []):
            k = key(src.get('canonicalUrl') or src.get('sourceUrl') or src.get('url'))
            if not k:
                continue
            codes = source_codes(src, build_source_map(data))
            if not codes:
                continue
            code = codes[0]
            update = {'readingScope': src.get('readingScope'), 'read': src.get('read') is True,
                'readThisRound': src.get('readThisRound', True),
                'sameSource': code not in ('R701', 'R702'),
                'limits': arr(src.get('limits'))}
            source_updates.setdefault(code, []).append(update)
    for code, updates in source_updates.items():
        data['sourceRegistry'][code]['studentReviewUpdates'] = updates
    counts = Counter(r['coverageStatus'] for r in coverage_rows)
    total_reviews = sum(r['reviewCount'] for r in coverage_rows)
    meta = {'batch': BATCH, 'teachersSearched': len(teachers), 'teacherCount': len(coverage_rows),
        'teachersWithAttributableReviews': sum(r['reviewCount'] > 0 for r in coverage_rows),
        'coverageCounts': dict(counts), 'reviewRecords': total_reviews,
        'newSourceCodes': ['R701', 'R702'], 'newSocialPostCount': sum(p.get('expansionBatch') == BATCH for p in data['socialPosts']),
        'newOfficialEvidenceCount': sum(p.get('expansionBatch') == BATCH for p in data['officialEvidence']),
        'updatedExistingSourceCount': sum(c not in ('R701', 'R702') for c in source_updates),
        'newPostCountNote': '同帖新增评论、重新展开与官方访谈重读均不增加来源或帖子数。',
        'attributionRule': '完整姓名及明确上下文才归名；缩写、单姓和名单唯一匹配不足以归名。',
        'notFoundMeaning': '未检得不等于没有评价，不据此打分、排序或作避雷结论。'}
    data['meta']['studentReviewResearch'] = meta
    data['meta']['counts']['socialPosts'] = len(data['socialPosts'])
    data['meta']['counts']['officialEvidence'] = len(data['officialEvidence'])
    data['meta']['counts']['studentReviewRecords'] = total_reviews
    data['meta']['counts']['mentorsWithStudentReviews'] = meta['teachersWithAttributableReviews']
    errors = []
    if len(data['mentors']) != 34 or len(data['mentorCards']) != 17:
        errors.append('Roster/card count changed')
    for field in ('author', 'appEdition'):
        if before['meta'].get(field) != data['meta'].get(field):
            errors.append(f'meta.{field} changed')
    for code, old in before['sourceRegistry'].items():
        for f in ('title', 'author', 'date', 'url', 'originalUrl'):
            if old.get(f) != data['sourceRegistry'][code].get(f):
                errors.append(f'Existing source metadata changed: {code}.{f}')
    all_ids = []
    for row, d in zip(coverage_rows, dossiers):
        ids = {r['id'] for r in d['reviews']}
        all_ids.extend(ids)
        for r in d['reviews']:
            if r['attribution']['status'] != 'confirmed' or not r['sourceIds']:
                errors.append(f'Unattributed or unlinked review: {row["name"]} {r["id"]}')
            for c in r['sourceIds']:
                if c not in data['sourceRegistry']:
                    errors.append(f'Unknown source {c}')
        for p in d['recommendationPoints'] + d['concerns']:
            if not p['reviewIds'] or not set(p['reviewIds']).issubset(ids):
                errors.append(f'Unbacked editorial point: {row["name"]}')
        if row['name'] in ('李华', '徐伟') and row['reviewCount']:
            errors.append(f'Unresolved alias leaked into named review: {row["name"]}')
    if len(all_ids) != len(set(all_ids)):
        errors.append('Duplicate review ids')
    qa = {'ok': not errors, 'errors': errors, 'counts': meta,
          'sourceChanges': changes, 'existingReviewRecordsRefined': replaced,
          'unrepeatedLegacyRecordsRetained': retained, 'ambiguousAliasRecords': len(ambiguity),
          'preserved': {'mentors': 34, 'mentorCards': 17, 'author': True, 'appEdition': True,
                        'existingSourceMetadata': True},
          'checks': ['No initial-only reviews under named mentors', 'Every editorial point links confirmed review ids',
                     'No awards, lecture listings or coauthored papers substituted for student experiences',
                     'Historical/non-MPAcc/courses separated from explicit MPAcc guidance',
                     'Original post metadata preserved separately from comment metadata']}
    source_export = {'batch': BATCH, 'newSourceCodes': ['R701', 'R702'],
                     'sources': [{**data['sourceRegistry'][c], 'studentReviewUpdates': u} for c, u in source_updates.items()],
                     'ambiguousAliases': ambiguity,
                     'policy': '未确认实名的材料仅保留缩写、来源与归属缺口；不保存未核指控、私生活或辱骂原句。'}
    if errors:
        print(json.dumps(qa, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    if write:
        if missing:
            raise SystemExit('Refusing to write partial teacher coverage')
        (ROOT / 'data/reviews_research').mkdir(exist_ok=True)
        for path, group in zip([p for p in paths if p.exists()], groups):
            # Publish-safe checkpoint: no ambiguous candidate associations,
            # discarded quotations, raw screened snippets or unchecked leads.
            safe = {'batch': BATCH, 'teachers': group['teachers'],
                    'sources': group.get('sources', []),
                    'ambiguousAliases': sanitize_ambiguous([group], data['sourceRegistry']),
                    'searchLog': group.get('searchLog', []),
                    'methodNote': '仅保存已归名且有阅读记录的研究条目；不公开未核负面原句或候选实名。'}
            for t in safe['teachers']:
                t['reviews'] = [r for r in t.get('reviews', []) if confirmed(r)]
            (ROOT / 'data/reviews_research' / path.name).write_text(json.dumps(safe, ensure_ascii=False, indent=2) + '\n')
        exports = {'student-review-sources.json': source_export, 'student-review-qa.json': qa,
                   'student-review-coverage.json': {'batch': BATCH, 'summary': meta, 'teachers': coverage_rows}}
        for filename, content in exports.items():
            (ROOT / 'data' / filename).write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n')
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'write': write, 'ok': qa['ok'], **meta,
        'coverage': coverage_rows, 'sourceChanges': changes, 'refined': replaced, 'legacyRetained': retained}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Write live site data and publish-safe research exports')
    parser.add_argument('--allow-partial', action='store_true', help='Dry-run available inputs only')
    parser.add_argument('--input-dir', type=Path, default=INPUT_ROOT,
                        help='Research input directory (default: data/reviews_research, publish-safe checkpoint)')
    args = parser.parse_args()
    run(args.write, args.allow_partial, args.input_dir)
