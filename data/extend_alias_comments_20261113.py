"""Merge source-specific comment records; run after the earlier alias/context passes."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/site-data.json'
BATCH = ROOT / 'data/alias_comments_20261113'

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def main():
    data = json.loads(DATA.read_text())
    patch = json.loads((BATCH / 'new-reviews.json').read_text())
    mentors = {m['id']: m for m in data['mentors']}
    images = {}
    definitions = [
        ('x01-xw-dong', 'X01', '董与XW评论、追问及本帖教师名单'),
        ('x01-cxj', 'X01', 'CXJ劝退原句、追问及本帖教师名单'),
        ('x01-tzd-zl-dbr', 'X01', 'TZD与ZL同条推荐、DBR原句及教师名单'),
        ('x01-pj-zxl', 'X01', '潘俊提名、张兴亮应援及上层课程评论'),
        ('x01-lzz-zxl', 'X01', '李仲泽推荐、张兴亮提名及教师名单'),
        ('x01-lgc', 'X01', '刘国城大一会计学课程评论与作者回复'),
        ('x02-gfl', 'X02', '高凤莲推荐、作者回复及本帖教师名单'),
        ('x02-xw', 'X02', 'XW要求程度原句、作者回复及许汉y问句'),
        ('x02-liangliang', 'X02', '上层张兴亮和黄中生全名、Y.的亮亮推荐回复'),
    ]
    for stem, code, caption in definitions:
        name = stem + '-20261113.jpg'
        path = ROOT / 'dist/evidence/xhs' / name
        raw = path.read_bytes()
        images[stem] = {'src': './evidence/xhs/' + name, 'caption': caption,
            'sourceId': code, 'sourceUrl': data['sourceRegistry'][code]['canonicalUrl'],
            'kind': 'actual-browser-screenshot', 'textAltered': False,
            'width': 1363, 'height': 936, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'scope': ['原网页可见评论与上下文；不代表全部折叠回复均已读取。'], 'capturedAt': '2026-11-13'}

    def attach(review, key):
        shot = copy.deepcopy(images[key])
        review['screenshots'] = [shot]
        excerpt = review.get('contextNotes', {}).get('excerpt')
        if excerpt:
            excerpt.update(kind='visible_quote', screenshotSrc=shot['src'], scope='原网页截图可见；同图保留评论者、日期与上下文。')
        if review.get('selectionSignal'):
            review['selectionSignal']['excerpt']['kind'] = 'visible_quote'
        review.setdefault('researchProvenance', {})['screenshotAvailableThisRound'] = True
        review['limits'] = [x for x in review.get('limits', []) if '没有新增该评论' not in x and '日期读取' not in x and '读取记录对首评' not in x]
        review['readingScope'] = ['实际查看原网页对应评论及可见回复；未声称读完全部评论或折叠回复。']

    shot_keys = {
        'xw': 'x01-xw-dong', 'cxj': 'x01-cxj', 'tzd': 'x01-tzd-zl-dbr', 'zl': 'x01-tzd-zl-dbr',
        'xw-x02': 'x02-xw', 'dong-thread': 'x01-xw-dong', 'zxl-qiuqiu': 'x01-lzz-zxl',
        'zxl-wm': 'x01-pj-zxl', 'lgc-qingjiao': 'x01-lgc', 'pj-linyu': 'x01-pj-zxl'}
    for item in patch['reviews']:
        review = item['review']
        suffix = review['id'].removeprefix('sr-alias-comments-20261113-')
        attach(review, shot_keys[suffix])
        if suffix == 'xw':
            review['date'] = '2025-04-06'
            review['dateResolution'] = '本轮网页截图明确为2025-04-06，纠正历史自动读取差异。'
            review['contextNotes']['context'] = ['缄默的烛台追问“能说说为什么吗”，没有读到进一步原因；回复仅显示03-06，不推定年份。']
            review['selectionSignal']['scope'] = '反复强调不要选择；未说明原因、学位或接触关系。'
        elif suffix in ['tzd', 'zl']:
            review['date'] = '2025-04-09'
            review['sourceCommentKey'] = 'X01:天天发癫:2025-04-09:tzd-zl'
            review['sharedCommentId'] = 'x01-tiantian-20250409-tzd-zl'
        elif suffix == 'zxl-wm':
            review['date'] = '2025-04-03'
            review['sourceCommentKey'] = 'X01:wm:2025-04-03:张兴亮'
        elif suffix == 'cxj':
            review['narrator'] = '空白昵称'
            review['contextNotes']['context'] = ['。。追问“求细说”，画面日期07-06，年份未显示；未读到具体原因。']
        review['researchProvenance']['file'] = 'data/alias_comments_20261113/x01-reading.json' if 'X01' in review['sourceIds'] else 'data/alias_comments_20261113/x02-reading.json'
        dossier = mentors[item['mentorId']]['studentReviews']
        dossier['reviews'] = [r for r in dossier['reviews'] if r['id'] != review['id']] + [review]

    for item in patch['reviewAugments']:
        review = next(r for r in mentors[item['mentorId']]['studentReviews']['reviews'] if r['id'] == item['reviewId'])
        review.update(copy.deepcopy(item['patch']))
        attach(review, 'x02-gfl')
        review['sourceCommentKey'] = item['sourceCommentKey']

    # The nickname is resolved by the full names in its immediate parent, not by a guessed global alias.
    liang = copy.deepcopy(patch['reviews'][0]['review'])
    liang.update(id='sr-alias-comments-20261113-zxl-liangliang', sourceIds=['X02'],
        sourceUrl=data['sourceRegistry']['X02']['canonicalUrl'], canonicalUrl=data['sourceRegistry']['X02']['canonicalUrl'],
        sourceTitle='nau会计专硕导师求推荐 · 回复称呼', postAuthor='17元博物馆✨', postDate='03-31（年份未显示）',
        narrator='Y.', date='03-31（年份未显示）', year=None, polarity='positive',
        text='Y.在楼主点名张兴亮、黄中生的评论下回复“亮亮老师很好，非常推荐”；未说明本人学位或接触关系。',
        sourceCommentKey='X02:Y.:03-31:亮亮', experienceLabel='回复中的明确推荐 · 未说明具体经历')
    for key in ['dateVariants', 'dateResolution', 'screenshots']:
        liang.pop(key, None)
    liang['attribution'] = {'status':'confirmed','alias':'亮亮','reason':'直属上层评论点名张兴亮和黄中生，回复以“亮亮老师”指代；两者中只有张兴亮含“亮”。本帖教师名单、上层全名和回复同框确认，不跨帖推定。'}
    liang['contextNotes'] = {'excerpt':{'kind':'visible_quote','text':'亮亮老师很好，非常推荐','sourceIds':['X02']},
        'context':['直属上层作者：研究方向的话，比较喜欢张兴亮和黄中生老师，有没有学姐学长可以分享一下呀。', 'Y.在该评论下回复，未说明具体指导过程。'],
        'interpretation':{'text':'这是明确推荐态度；没有具体指导经历。','confidence':'limited'},
        'sourceIds':['X02']}
    liang['selectionSignal'] = {'direction':'recommend','intensity':'strong','alias':'亮亮',
        'excerpt':{'kind':'visible_quote','text':'亮亮老师很好，非常推荐'},'sourceIds':['X02'],
        'scope':'同楼上层姓名可对应张兴亮；评论者学位、接触关系和推荐理由未说明。'}
    liang['limits'] = ['该条是X02既有帖中的回复，不是新的独立帖子；没有具体指导过程。']
    liang['researchProvenance'] = {'file':'data/alias_comments_20261113/x02-reading.json','method':'live-browser-parent-and-reply','screenshotAvailableThisRound':True}
    attach(liang, 'x02-liangliang')
    dossier = mentors['mentor-13']['studentReviews']
    dossier['reviews'] = [r for r in dossier['reviews'] if r['id'] != liang['id']] + [liang]

    # Recover the existing DBR comment's exact wording without adding a duplicate record.
    dbr = next(r for r in mentors['mentor-01']['studentReviews']['reviews'] if r['id'] == 'sr-alias-20261113-dbr')
    dbr.update(narrator='涂卡图🐰', date='2025-04-02', readThisRound=True,
        text='评论者写“敢不敢选d b r”；没有说明具体经历，问句语气不足以直接判为推荐或劝退。',
        sourceCommentKey='X01:涂卡图🐰:2025-04-02:dbr')
    dbr['contextNotes'] = {'excerpt':{'kind':'visible_quote','text':'敢不敢选d b r','sourceIds':['X01']},
        'context':['同帖名单含董必荣；此条与momo单姓“董”的楼层分开。'],
        'interpretation':{'text':'可能是提醒或调侃，未给出具体原因，不定为强烈推荐或劝退。','confidence':'uncertain'},'sourceIds':['X01']}
    dbr['limits'] = ['未说明学位、接触关系或具体事件；不从问句补造评价理由。']
    attach(dbr, 'x01-tzd-zl-dbr')
    lee = next(r for r in mentors['mentor-28']['studentReviews']['reviews'] if r['id'] == 'sr-4f903dfc6b113f')
    lee['selectionSignal']['excerpt'] = {'kind':'visible_quote','text':'李仲泽我强力推荐'}
    lee['selectionSignal']['scope'] = '原话明确推荐；关于论文帮助是“有种……感觉”的期待，未说明实际指导过程。'
    lee['contextNotes'] = {'excerpt':{'kind':'visible_quote','text':'李仲泽我强力推荐','sourceIds':['X01']},
        'context':['原评论称年轻、幽默、为学生考虑；论文帮助部分用“有种……感觉”表达，未陈述发生过的改稿过程。'], 'sourceIds':['X01']}
    attach(lee, 'x01-lzz-zxl')

    aliases = {a['alias']:a for a in data['mentorAliases']}
    for alias, suffixes in {'XW':['xw','xw-x02'], 'CXJ':['cxj'], 'TZD':['tzd'], 'ZL':['zl'], '董':['dong-thread']}.items():
        a = aliases[alias]
        a['reviewIds'] = sorted(set(a['reviewIds'] + ['sr-alias-comments-20261113-' + suffix for suffix in suffixes]))
        a['basis'] = '本帖教师名单与对应评论语境核对；原句、回复和接触身份见导师资料。'
    aliases['董']['basis'] = '本帖名单唯一董姓，结合该楼书记指代与同帖全名评论；单姓楼与DBR楼分开保留。'
    for alias in ['高老师', '黄老师/黄导', '崔老师']:
        aliases[alias].update(status='ambiguous', basis='这里只出现姓氏称呼，尚缺同楼全名确认；列名录内候选，不把该称呼的评价直接归名。')
    aliases['许汉 y']['basis'] = '不想说的半姓名问句可对应许汉友；跟评只提职务，没有个人评价。'
    for alias, mid, code, basis, status, ids in [
        ('亮亮','mentor-13','X02','直属上层点名张兴亮、黄中生；Y.回复“亮亮”，与张兴亮对应。同楼画面保留。','matched',[liang['id']]),
        ('蔡老师','mentor-25','X01','单姓“蔡老师好，无脑推”下有人追问是否认真；暂列蔡显军候选，不把语气歧义归为实名强烈推荐。','ambiguous',[])]:
        a = {'alias':alias,'variants':[alias], 'mentorIds':[mid], 'status':status, 'basis':basis, 'sourceIds':[code], 'reviewIds':ids, 'observedInComment':True}
        if alias in aliases: aliases[alias].update(a)
        else: data['mentorAliases'].append(a)
    for old in data['ambiguousMentorAliases']:
        term = old.get('alias','').lower().replace(' ','')
        if term in ['zl','xw/xw','tzd','cxj']:
            old['publishUnderNamedMentor'] = True
        if old.get('alias') in ['高老师','黄老师/黄导','崔老师']:
            old.update(status='unresolved',label='称呼候选，未确认全名',publishUnderNamedMentor=False,reason='仅姓氏称呼，尚缺同楼全名确认。')

    for mid, summary in {'mentor-19':'X01明确劝退；X02称要求高、有点严格。两条均未说明接触关系。',
        'mentor-23':'TZD与ZL在同一条评论中被提名；未说明具体理由。',
        'mentor-25':'CXJ有直接劝退原句；另有全名简短提名，原句分别保留。',
        'mentor-01':'DBR问句与“董”反讽支线分别保留；未说明具体指导经历。'}.items():
        ds = mentors[mid]['studentReviews']
        ds.update(summary=summary,coverageStatus='weak_mentions',coverageLabel='选导态度 · 未说明具体经历')
        ds['gaps'] = [g for g in ds.get('gaps',[]) if not any(w in g for w in ['归名未解决','无可归名','缺实名学生'])]
        ds.setdefault('searchCoverage',{})['gaps'] = ds['gaps']
    for code in ['X01','X02']:
        newshots = [copy.deepcopy(v) for v in images.values() if v['sourceId'] == code]
        src = data['sourceRegistry'][code]
        src['screenshots'] = [s for s in src.get('screenshots',[]) if s.get('src') not in {v['src'] for v in newshots}] + newshots
        src['lastCommentReading'] = {'date':'2026-11-13','scope':'实际核对相关可见评论和回复，并保存对应原网页截图；未声称读完全部评论。'}
    # Keep the in-site source record consistent with the mentor dossier.
    grouped = {}
    for mentor in data['mentors']:
        for review in mentor['studentReviews']['reviews']:
            if not review['id'].startswith('sr-alias-comments-20261113-') and review['id'] != dbr['id']:
                continue
            key = review['sourceCommentKey']
            group = grouped.setdefault(key, {'mentors':[], 'reviews':[]})
            group['mentors'].append(mentor['name'])
            group['reviews'].append(review)
    for group in grouped.values():
        review = group['reviews'][0]
        post_id = data['sourceRegistry'][review['sourceIds'][0]]['postId']
        post = next(p for p in data['socialPosts'] if p['id'] == post_id)
        ids = [r['id'] for r in group['reviews']]
        comments = post.setdefault('comments', [])
        existing = next((c for c in comments if c.get('aliasReviewId') in ids or set(c.get('aliasReviewIds', [])).intersection(ids)), None)
        if existing is None:
            existing = next((c for c in comments if c.get('author') == review['narrator'] and c.get('teacher') in group['mentors']), None)
        if existing is None:
            existing = {}
            comments.append(existing)
        existing.update(teacher='、'.join(group['mentors']), author=review['narrator'], date_display=review.get('date') or '日期未显示',
            relationship=review.get('relationship','未说明'), content=review['text'], limits='；'.join(review.get('limits', [])),
            use_status=review['contextAssessment']['displayLabel'], aliasReviewId=ids[0], aliasReviewIds=ids,
            sourceCommentKey=review['sourceCommentKey'], screenshots=copy.deepcopy(review.get('screenshots', [])),
            contextAssessment=copy.deepcopy(review['contextAssessment']))
    reviews = [r for m in data['mentors'] for r in m['studentReviews']['reviews']]
    data['meta']['counts']['studentReviewRecords'] = len(reviews)
    data['meta']['counts']['mentorsWithStudentReviews'] = sum(bool(m['studentReviews']['reviews']) for m in data['mentors'])
    data['meta']['aliasCommentResearch'] = {'batch':'alias-comments-20261113','newReviewRecords':11,
        'distinctNewComments':10,'newTopLevelComments':9,'newReplies':1,'newPosts':0,'newIndependentSources':0,
        'newScreenshots':len(images),'reviewRecords':len(reviews),'scope':'核对两帖相关可见评论及回复，不声称全量；同一评论提名两位导师仍计一个原评论。'}
    save(DATA, data)
    save(BATCH / 'image-manifest.json', list(images.values()))
    save(BATCH / 'merge-report.json', data['meta']['aliasCommentResearch'])
    print(json.dumps(data['meta']['aliasCommentResearch'],ensure_ascii=False))

if __name__ == '__main__':
    main()
