#!/usr/bin/env python3
"""Merge bounded, actually-read source notes without rebuilding or changing author metadata."""
from __future__ import annotations

import argparse
import collections
import copy
import hashlib
import json
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
BATCH = 'expanded-public-and-xhs'

def read(path):
    return json.loads(path.read_text())

def pid(row):
    return str(row.get('post_id') or row.get('id') or '')

def urlkey(url):
    p = urllib.parse.urlsplit(url)
    xhs = re.search(r'/(?:explore|discovery/item)/([0-9a-f]{24})', p.path)
    if xhs:
        return 'xhs:' + xhs.group(1)
    tieba = re.search(r'/p/(\d+)', p.path)
    if 'tieba.baidu.com' in p.netloc and tieba:
        return 'tieba:' + tieba.group(1)
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip('/'), '', ''))

def join_unique(values):
    return list(dict.fromkeys(str(x) for x in values if x))

def scopes(row):
    value = row.get('readingScopes') or row.get('reading_scope') or row.get('readingScopes') or []
    return [value] if isinstance(value, str) else list(value)

def query_names(row):
    value = row.get('queries') or ([row['query']] if row.get('query') else [])
    return [value] if isinstance(value, str) else list(value)

def category(row):
    text = row.get('category', '')
    if '背景' in text or '待核实' in text:
        return '背景或待核实材料'
    if row.get('usable_for_recommendation') is True or any(x in text for x in ['限定学习生活', '条件性经验', '有条件可用']):
        return '可用生活学习线索'
    return '背景或待核实材料'

def topic(row, origin):
    if row.get('topic'):
        return row['topic']
    title = row.get('title', '')
    if any(x in title for x in ['导师', '选导']):
        return '选导流程与提问'
    if '案例' in title:
        return '案例竞赛与实践'
    if any(x in title for x in ['实习', '毕业', '答辩', '论文']):
        return '论文实习与职业准备'
    return '研究生学习生活'

def is_read_screen(row):
    text = ' '.join(scopes(row)) + ' ' + row.get('reason', '')
    return not ('未完整审听' in text and '视频' in text)

def append_block(data, chapter_id, block_id, text, codes):
    chapter = next(x for x in data['lifeChapters'] if x['id'] == chapter_id)
    if any(x.get('expansionId') == block_id for x in chapter['blocks']):
        return
    chapter['blocks'].append({'type': 'p', 'text': text, 'sourceCodes': codes, 'expansionId': block_id})
    chapter['sourceCodes'] = join_unique(chapter.get('sourceCodes', []) + codes)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'dist/data/site-data.json'
    data = read(target)
    original_registry = copy.deepcopy(data['sourceRegistry'])
    author = copy.deepcopy(data['meta'].get('author'))
    before_chapter12 = copy.deepcopy(next(x for x in data['lifeChapters'] if x['id'] == 'life-12')['blocks'])
    mentors_before = copy.deepcopy(data['mentors'])
    feedback_before = copy.deepcopy(data['feedbackIndex'])
    old_expansion = data['meta'].get('researchExpansion', {})
    baseline = old_expansion.get('baseline', {
        'socialPosts': len(data['socialPosts']),
        'screenedOnlyInIndex': sum(bool(x.get('screenedOnly')) for x in data['socialPosts']),
        'sourceAliases': len(data['sourceRegistry']),
    })
    files = {
        'life': WORKSPACE / 'research_expand_life_20261105.json',
        'mentors': WORKSPACE / 'research_expand_mentors_20261105.json',
        'public': WORKSPACE / 'research_expand_public_20261105.json',
    }
    inputs = {name: read(path) for name, path in files.items()}
    for name, source in inputs.items():
        if not source.get('status', '').startswith('complete'):
            raise SystemExit('Research still incomplete: ' + name)

    candidates = []
    for origin, key in [('life', 'records'), ('mentors', 'posts'), ('public', 'records')]:
        for row in inputs[origin].get(key, []):
            candidates.append((origin, row))
    existing_ids = {x['id']: x for x in data['socialPosts']}
    existing_urls = {urlkey(x['url']): x for x in data['socialPosts']}
    additions, duplicates = [], []
    batch_records = []
    source_by_id = {}
    next_code = max([int(k[1:]) for k in data['sourceRegistry'] if re.fullmatch(r'E\d+', k)] or [0]) + 1
    same_author_notes = {}
    for relationship in inputs['life'].get('same_author_relationships', []):
        for post_id in relationship.get('new_post_ids', []):
            same_author_notes.setdefault(post_id, []).append(relationship['interpretation'])

    # The named author's already-confirmed MPAcc post and broad research-life posts form one cluster.
    for post_id in ['69317020000000001e025f54', '69aec1a7000000001a02c06e', '6aa4f4f20000000027015216']:
        same_author_notes.setdefault(post_id, []).append('与“噗噜噜小熊糖”的其他学期记录属于同一作者个案，不是多位独立学生的相互印证。')

    seen_candidate_ids = set()
    for origin, row in candidates:
        post_id = pid(row)
        if not post_id or not row.get('url'):
            raise SystemExit('Missing source identity')
        if row.get('screenedOnly'):
            raise SystemExit('An unread source was placed in retained records')
        key = urlkey(row['url'])
        if post_id in seen_candidate_ids:
            duplicates.append({'id': post_id, 'reason': 'duplicate in expanded retained records'})
            continue
        seen_candidate_ids.add(post_id)
        found = existing_ids.get(post_id) or existing_urls.get(key)
        if found:
            if found.get('expansionBatch') == BATCH:
                batch_records.append(found)
                source_by_id[post_id] = next((c for c in found.get('sourceIds', []) if re.fullmatch(r'E\d+', c)), None)
            else:
                duplicates.append({'id': post_id, 'reason': 'already in existing index'})
            continue
        code = f'E{next_code:03d}'
        next_code += 1
        limits = row.get('limitations') or '未核验作者学籍与当前适用政策；不能外推到所有MPAcc学生。'
        for note in same_author_notes.get(post_id, []):
            if note not in limits:
                limits += ' ' + note
        normalized = {
            'id': post_id,
            'key': row.get('key') or key,
            'sourceIds': [code, post_id],
            'canonicalUrl': row.get('canonicalUrl') or (f'https://www.xiaohongshu.com/explore/{post_id}' if key.startswith('xhs:') else row['url']),
            'url': row['url'],
            'title': row.get('title_cn_summary') or row['title'],
            'originalTitle': row.get('title') if row.get('title_cn_summary') else None,
            'author': row.get('author', '未公开'),
            'date': row.get('date', '未公开'),
            'platform': row.get('platform', '小红书'),
            'topic': topic(row, origin),
            'campus': row.get('campus', '未说明'),
            'population': row.get('population', '未说明'),
            'summary': row.get('summary', ''),
            'tips': row.get('tips', []),
            'comments': row.get('comments', []),
            'limitations': limits,
            'category': category(row),
            'reviewReason': row.get('recommendation_scope') or ('仅作按身份和阶段限定的经验与核对清单，不视为现行制度。' if category(row) == '可用生活学习线索' else '历史、转述、未获回答的提问或非MPAcc材料，只保留背景与核实价值。'),
            'verificationStatus': row.get('verificationStatus', '已读可见正文与评论；具体适用性待核实'),
            'needsVerification': True,
            'screenedOnly': False,
            'promotion': row.get('promotion', '原记录如涉及辅导品牌、私聊或推广因素，已在适用边界中限定。' if any(k in limits for k in ['辅导', '品牌', '私聊', '转发']) else '未据本次阅读确认推广属性'),
            'readingScopes': scopes(row),
            'queries': query_names(row),
            'inputFiles': [files[origin].name],
            'expansionBatch': BATCH,
        }
        if origin == 'public':
            normalized['evidenceIdentity'] = row.get('evidence_identity', '')
        data['socialPosts'].append(normalized)
        additions.append(normalized)
        batch_records.append(normalized)
        existing_ids[post_id] = normalized
        existing_urls[key] = normalized
        source_by_id[post_id] = code
        data['sourceRegistry'][code] = {
            'code': code, 'original_id': post_id, 'title': normalized['title'], 'label': normalized['title'],
            'url': normalized['url'], 'originalUrl': normalized['url'], 'canonicalUrl': normalized['canonicalUrl'],
            'date': normalized['date'], 'kind': normalized['platform'], 'population': normalized['population'],
            'status': normalized['verificationStatus'], 'limitations': limits, 'expansionBatch': BATCH,
        }
        for i, tip in enumerate(normalized['tips']):
            data['tipsIndex'].append({
                'id': post_id + ':exp-tip-' + str(i + 1), 'topic': normalized['topic'],
                'point': tip, 'context': normalized['summary'], 'scope': normalized['population'],
                'limits': limits, 'author': normalized['author'], 'date_display': normalized['date'],
                'url': normalized['url'], 'post_title': normalized['title'],
                'status': normalized['verificationStatus'], 'promotion': normalized['promotion'],
                'source_ids': code + '／' + post_id, 'source_key': normalized['key'], 'expansionBatch': BATCH,
            })

    retained_ids = {x['id'] for x in batch_records}
    screened_by_id = {}
    overridden_screening = []
    for origin, field in [('life', 'screened'), ('mentors', 'screened_out')]:
        for row in inputs[origin].get(field, []):
            post_id = pid(row)
            if post_id in retained_ids:
                overridden_screening.append({'id': post_id, 'reason': '另一检索组已实际读取更多内容，保留为有边界的背景来源；不重复计作筛除。'})
                continue
            if post_id in existing_ids:
                duplicates.append({'id': post_id, 'reason': 'screening duplicates previous index'})
                continue
            screened_by_id.setdefault(post_id, {
                'id': post_id, 'post_id': post_id, 'url': row['url'], 'title': row['title'],
                'platform': '小红书', 'date': row.get('date', '未公开'), 'category': '排除主要攻略选导依据' if is_read_screen(row) else '仅筛选记录',
                'reason': row.get('reason', ''), 'readingScopes': scopes(row),
                'read': is_read_screen(row), 'screenedOnly': not is_read_screen(row),
                'inputFiles': [files[origin].name], 'expansionBatch': BATCH,
            })
    new_screened = list(screened_by_id.values())
    data['screenedSources'] = [x for x in data.get('screenedSources', []) if x.get('expansionBatch') != BATCH] + new_screened
    unread = []
    unread_seen = set()
    for row in inputs['public'].get('unread_leads', []):
        identity = urlkey(row['url'])
        if identity in unread_seen or pid(row) in existing_ids:
            continue
        unread_seen.add(identity)
        unread.append({**row, 'sourceIds': [], 'read': False, 'expansionBatch': BATCH})
    data['unreadLeads'] = [x for x in data.get('unreadLeads', []) if x.get('expansionBatch') != BATCH] + unread

    def codes(*ids):
        out = [source_by_id[i] for i in ids]
        assert all(out)
        return out
    def refs(items):
        return ''.join('[' + x + ']' for x in items)
    paragraphs = [
        ('life-03', 'expanded-dorm-checklist',
         '把“宿舍怎么样”拆成一张设施核对表更有用：本专业本级的园区、楼栋与楼层，床桌形式，阳台和晾晒位置，洗澡、洗衣及饮水点，共用区域清洁分工和报修渠道。新读的宿舍帖与评论呈现了楼栋、年级和改造进度的差异；先拿到本人分配通知，再核对相应楼栋实拍，不根据他人的房型或费用安排采购。',
         ['6accd8e7000000001301ae8d', '6a6b4327000000002500a2bc', '6a9d72e60000000026014a87']),
        ('life-04', 'expanded-return-parcels',
         '退货寄件先在原订单核对支持的渠道：预约上门、自行送件和自寄报销的条件可能不同，运费险、退货宝或红包退款也不是同一回事。下单前确认能否报销、需留存哪些凭证，再写清校区、园区、楼栋与服务点；帖子里的某次上门或免费经历，不等于其他订单也享受同样服务。',
         ['6ae82278000000001802ead9']),
        ('life-05', 'expanded-canteen-window',
         '想给食堂尝新清单加一个具体位置，可到泽园食堂二楼“喜翻拌”旁询问猪排饭窗口。原帖还分享了打抛肉饭等消费体验，但没有据模糊价目图填入价格；菜单、营业、换配菜和份量都以现场为准，口味评价也只属于该作者的个人体验。',
         ['6ae96600000000001b01ebb1']),
        ('life-07', 'expanded-study-seat',
         '预约到座位之后，继续按当前系统提示完成到馆签到、暂离和签退，真正离开时及时释放座位。临时去教室自习则先查官方教室使用状态，遇上课或正式借用应让位；充电、空调、开闭楼时间和特定自习室资格，需要到馆、到楼确认，不把旧帖子截图当现行操作界面。',
         ['685530240000000017032d03', '68d22f3300000000130364ad']),
        ('life-08', 'expanded-course-planning',
         '具体课程体验比“研一忙不忙”更有参考价值。一位评论中明确自称会计专硕的作者，记录了期末复习Python课程及另一学期选修课从第一周开课的情况；同作者还有研二组会、课表与实习衔接的生活记录。因此可以提前问本级开课周次、实践作业和考核方式，把编程复习也排进计划。几篇记录出自同一人，不能当成多位MPAcc学生的一致评价，更不能据此认定所有年级课量。',
         ['69317020000000001e025f54', '69aec1a7000000001a02c06e', '6aa4f4f20000000027015216']),
        ('life-08', 'expanded-case-team-skills',
         '准备案例大赛时，简历里的匹配点可以具体到表格制作、绘图、Office排版、资料汇总和协作分工。新读的一则历史组队帖提出过这些要求，但招募已经结束，也没有提供指导教师姓名。跨校组队、学分或综测如何认定，应查当届竞赛与学院通知；该帖可帮助理解队伍需要什么，不能用来承诺获奖或推荐某位导师。',
         ['67d030e3000000002a00da89']),
        ('life-08', 'expanded-library-access',
         '遇到文献数据库要求付费，不急着判断“校园网失效”：先核对学校机构登录身份、资源订购范围和访问方式，再照图书馆官方指南排查或联系馆员。连上校园网络与拥有全部文献下载权限不是同一回事；社交提问帖没有给出可靠解决步骤时，不照评论自行安装来源不明的工具。',
         ['6ae9c0cd000000000e02d6a4']),
        ('life-08', 'expanded-internship-scope',
         '核实实习时，把“学校是否集中安排”“本级能填哪些志愿”“实际常驻或出差地点”“通勤与请假如何协调”分开问。新读的MAud地域提问和审计研究生实习月记，不能直接说明会计学院MPAcc的统一安排；另有MPAcc提问帖也没有得到可核实答复。把这些问题带到学院或导师处确认，比仅按城市或单位名称做预期更稳妥。',
         ['6a316953000000001700b402', '68e7199a00000000040149f8', '6ac73fe600000000180063c9']),
        ('life-09', 'expanded-scholarship-stages',
         '奖助时间线至少分成申请、初评、公示和实际到账四步保存。社交账号转发的评审通知不等于到账承诺；某位会计专硕作者当时还未领到奖学金的陈述，也不能推出全校固定发放日期。以会计学院、本级班委和财务部门的正式通知核对材料与节点，再安排个人预算。',
         ['6ae9a3480000000018039d89', '69317020000000001e025f54']),
    ]
    for chapter_id, block_id, text, identities in paragraphs:
        source_codes = codes(*identities)
        append_block(data, chapter_id, block_id, text + refs(source_codes), source_codes)

    chapter12 = next(x for x in data['lifeChapters'] if x['id'] == 'life-12')
    if not any(x.get('expansionId') == 'expanded-source-heading' for x in chapter12['blocks']):
        chapter12['blocks'].append({'type': 'heading', 'level': 2, 'text': '补充原帖与公开讨论', 'sourceCodes': [], 'expansionId': 'expanded-source-heading'})
    for record in batch_records:
        code = source_by_id[record['id']]
        marker = 'expanded-source-' + record['id']
        if not any(x.get('expansionId') == marker for x in chapter12['blocks']):
            chapter12['blocks'].append({'type': 'source', 'text': f'[{code}] {record["title"]}  {record["date"]}', 'url': record['url'], 'sourceCodes': [code], 'expansionId': marker})
        chapter12['sourceCodes'] = join_unique(chapter12.get('sourceCodes', []) + [code])

    raw_queries = []
    for origin, source in inputs.items():
        for row in source.get('query_log', []):
            name = row.get('query', '') if isinstance(row, dict) else str(row)
            if name:
                raw_queries.append({'query': name, 'group': origin})
    normalize_query = lambda q: re.sub(r'\s+', ' ', q.strip()).casefold()
    screened_read = sum(x['read'] for x in new_screened)
    screen_only = len(new_screened) - screened_read
    new_xhs = sum(x['platform'] == '小红书' for x in batch_records)
    valid = sum(x['category'] == '可用生活学习线索' for x in batch_records)
    expansion = {
        'baseline': baseline,
        'queryCount': len(raw_queries),
        'distinctQueryCount': len({normalize_query(x['query']) for x in raw_queries}),
        'queries': raw_queries,
        'newIndexedSources': len(batch_records),
        'newXhsSources': new_xhs,
        'newOtherPlatformSources': len(batch_records) - new_xhs,
        'newConditionalUsefulSources': valid,
        'newBackgroundSources': len(batch_records) - valid,
        'newActuallyReadUniqueSources': len(batch_records) + screened_read,
        'newReadExcludedSources': screened_read,
        'newScreenedOnlySources': screen_only,
        'newUnreadLeads': len(unread),
        'newPersonalMentorEvidence': 0,
        'sourceCodes': [source_by_id[x['id']] for x in batch_records],
        'sameAuthorRelationships': inputs['life'].get('same_author_relationships', []),
        'duplicateScreeningOverridden': overridden_screening,
        'duplicatesNotAdded': duplicates,
        'methodNote': '已读指实际查看过可见正文、图片或评论，并非图集、视频与全部评论均完整审读。新读来源、背景、筛除与未读线索分别计数；没有声称抓取平台全部内容。',
        'independenceNote': '同一作者的多个生活记录是一组个案。匿名问卷汇总页按1个来源计，不按其中答卷数增加帖子数量；转载和辅导品牌材料不当独立官方确认。',
        'limits': join_unique(sum((x.get('limits', []) for x in inputs.values()), [])),
    }
    data['meta']['researchExpansion'] = expansion
    categories = collections.Counter(x['category'] for x in data['socialPosts'])
    data['meta']['socialPostCategories'] = dict(categories)
    data['meta']['counts'].update({
        'socialPosts': len(data['socialPosts']), 'feedbackRecords': len(data['feedbackIndex']),
        'screenedSources': len(data['screenedSources']), 'unreadLeads': len(data['unreadLeads']),
    })
    data['meta']['platformNote'] = (
        f'{len(data["socialPosts"])}条为去重后的来源索引，保留了原有背景、筛除与仅筛选记录；'
        f'本轮新增收录{len(batch_records)}条（小红书{new_xhs}条、其他公开平台{len(batch_records)-new_xhs}条），'
        f'其中{valid}条仅可按身份和阶段限定参考。另列{screened_read}条实读后筛除、{screen_only}条仅筛查及{len(unread)}条正文未读线索，不计入新增有效来源。'
        '来源数量不等于独立MPAcc学生数，也不等于导师个人评价数量。'
    )
    data['meta']['sourceInputFiles'] = join_unique(data['meta'].get('sourceInputFiles', []) + [p.name for p in files.values()])
    data['meta'].pop('updatedAt', None)
    for download in data['downloads']:
        asset = ROOT / 'dist/downloads' / pathlib.PurePosixPath(download['url']).name
        if not asset.is_file():
            raise SystemExit('Missing existing download asset: ' + download['id'])
        download['bytes'] = asset.stat().st_size
    unresolved = set()
    def walk(value):
        if isinstance(value, dict):
            for code in value.get('sourceCodes', []):
                if code not in data['sourceRegistry']:
                    unresolved.add(code)
            for val in value.values():
                walk(val)
        elif isinstance(value, list):
            for val in value:
                walk(val)
    walk(data)
    identities = [x['id'] for x in data['socialPosts']]
    urls = [urlkey(x['url']) for x in data['socialPosts']]
    assert len(identities) == len(set(identities))
    assert len(urls) == len(set(urls))
    assert not unresolved
    assert author == data['meta'].get('author')
    assert original_registry.items() <= data['sourceRegistry'].items()
    assert data['mentors'] == mentors_before
    assert data['feedbackIndex'] == feedback_before
    assert chapter12['blocks'][:len(before_chapter12)] == before_chapter12
    assert len(data['mentors']) == 34 and len(data['mentorCards']) == 17 and len(data['lifeChapters']) == 12
    qa = {
        'socialPosts': len(data['socialPosts']), 'newIndexedSources': len(batch_records),
        'newXhsSources': new_xhs, 'newOtherPlatformSources': len(batch_records)-new_xhs,
        'newConditionalUsefulSources': valid, 'newBackgroundSources': len(batch_records)-valid,
        'newActuallyReadUniqueSources': expansion['newActuallyReadUniqueSources'],
        'newReadExcludedSources': screened_read, 'newScreenedOnlySources': screen_only,
        'newUnreadLeads': len(unread), 'newPersonalMentorEvidence': 0,
        'queryCount': expansion['queryCount'], 'distinctQueryCount': expansion['distinctQueryCount'],
        'categoryCounts': dict(categories), 'sourceAliases': len(data['sourceRegistry']),
        'uniqueSourceUrls': len({urlkey(x['url']) for x in data['sourceRegistry'].values() if x.get('url')}),
        'uniqueRawSourceUrls': len({x['url'] for x in data['sourceRegistry'].values() if x.get('url')}),
        'downloadSizes': {x['id']: x['bytes'] for x in data['downloads']},
        'sourceCodesUnresolved': sorted(unresolved),
        'originalAliasesPreserved': True, 'authorPreserved': True, 'updatedAtAbsent': 'updatedAt' not in data['meta'],
        'originalChapter12BlocksPreserved': True, 'mentorEvidenceUnchanged': True,
        'newParagraphs': len(paragraphs), 'writeRequested': args.write,
        'sourceFileHashes': {k: hashlib.sha256(v.read_bytes()).hexdigest() for k, v in files.items()},
    }
    if args.write:
        target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
        qa['outputSha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        qa['outputBytes'] = target.stat().st_size
    (ROOT / 'data/expanded-merge-qa.json').write_text(json.dumps(qa, ensure_ascii=False, indent=2))
    print(json.dumps(qa, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
