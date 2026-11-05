#!/usr/bin/env python3
"""Lossless content conversion for the public MPAcc guide UI, without new claims."""
from pathlib import Path
from copy import deepcopy
from collections import Counter
from urllib.parse import urlsplit,urlunsplit
import json,re,shutil,hashlib
ROOT=Path('/workspace/scratch/52b746d649d3')
DIST=ROOT/'nau-guide-site/dist'
read=lambda n:json.loads((ROOT/n).read_text())
life=read('life_content.json');guide=read('mentor_expanded_content.json')
roster=read('research_advisor_roster.json');norm=read('nau_index_work/normalized_evidence.json')
raw_posts=[p for p in norm['posts'] if not p['official']]
assert len(raw_posts)==82

def canonical(url):
 try:
  x=urlsplit(url);return urlunsplit((x.scheme,x.netloc,x.path,'',''))
 except Exception:return url

def text(value):
 if value is None:return ''
 if isinstance(value,str):return value
 if isinstance(value,list):return '\n'.join(text(x) for x in value)
 return json.dumps(value,ensure_ascii=False)

sources=deepcopy(life['source_registry'])
for code,s in sources.items():
 s.update({'code':code,'label':s.get('title',code),'originalUrl':s.get('url','')})
for b in guide['blocks']:
 if b['type']=='source':
  code=b['text'].split(' ',1)[0]
  sources[code]={'code':code,'title':b['text'],'label':b['text'],'url':b['url'],'originalUrl':b['url'],'kind':'导师手册来源','date':''}
for p in norm['posts']:
 for code in p['ids']:
  # Existing short codes retain the precise guide mapping; record aliases separately.
  if code not in sources:
   sources[code]={'code':code,'title':p['title'],'label':p['title'],'url':p['url'],'originalUrl':p['url'],'canonicalUrl':p['canonical_url'],'date':p['date_display'],'kind':'官方' if p['official'] else '小红书原帖','population':p['population'],'limitations':p['limits'],'category':p.get('review_category','官方资料'),'originalId':p.get('note_id',''),'postId':p.get('note_id','')}
url_to_post={canonical(p['url']):p for p in raw_posts}
for s in sources.values():
 s['canonicalUrl']=s.get('canonicalUrl') or canonical(s.get('url',''))
 p=url_to_post.get(s['canonicalUrl'])
 if p:
  s.update({'postId':p['note_id'] or p['key'],'sourceIds':p['ids'],'population':p['population'],'campus':p['campus'],'category':p.get('review_category',''),'limitations':p['limits']})

def codes_for(value):
 # Inspect string leaves; JSON array brackets are structure, not source citations.
 if isinstance(value,dict):
  return list(dict.fromkeys(c for v in value.values() for c in codes_for(v)))
 if isinstance(value,list):
  return list(dict.fromkeys(c for v in value for c in codes_for(v)))
 if not isinstance(value,str):return []
 found=[]
 for bracket in re.findall(r'\[([^\]]+)\]',value):
  for a,z in re.findall(r'(?<![A-Za-z])(\d{2})[—–\-至](\d{2})',bracket):
   found.extend(f'{n:02d}' for n in range(int(a),int(z)+1))
  found+=re.findall(r'(?:[FLPCVRX]\d{2}|\d{2}补?)',bracket)
 return list(dict.fromkeys(c for c in found if c in sources))

def block_copy(b):
 x=deepcopy(b);x['sourceCodes']=codes_for(b)
 return x

def sections(blocks,prefix):
 intro=[];out=[];current=None
 for b in blocks:
  if b['type']=='heading' and b.get('level',1)==1:
   current={'id':f'{prefix}-{len(out)+1:02d}','number':len(out)+1,'title':b['text'],'blocks':[]};out.append(current)
  elif current is None:intro.append(block_copy(b))
  else:current['blocks'].append(block_copy(b))
 for c in out:c['sourceCodes']=list(dict.fromkeys(k for b in c['blocks'] for k in b['sourceCodes']))
 return intro,out
life_intro,chapters=sections(life['blocks'],'life')
mentor_intro,mentor_sections=sections(guide['blocks'],'mentor-guide')
assert len(chapters)==12 and len(mentor_sections)==5
cards={b['name']:b for b in guide['blocks'] if b['type']=='card'}
assert len(cards)==17
name_to_id={m['name']:f'mentor-{m["roster_order"]:02d}' for m in roster['advisors']}
DIRECTIONS=[
 {'id':'G1','label':'智能会计与智能财务'},
 {'id':'G2','label':'管理会计与内部控制'},
 {'id':'G3','label':'资本市场会计与财务管理'},
 {'id':'G4','label':'政府会计与国家治理'},
 {'id':'G5','label':'注册会计师审计与财会监督'},
 {'id':'G6','label':'大数据审计与会计智能化交叉'}]

def evidence_kind(f):
 rel=f.get('relationship','');t=rel+' '+f.get('content','')+' '+f.get('limits','')
 if any(x in t for x in ['朋友论文','听研究生学姐','研究生 push 是转述','研究生指导会 push']):return 'secondhand'
 if any(x in rel for x in ['身份未','关系身份未','未说明','未明示','未在该条明示']):return 'uncertain'
 if any(x in rel for x in ['本科','上课','课程','曾受指导','论文指导关系','竞赛求教']):return 'firsthand'
 return 'uncertain'

mentors=[];mentor_cards=[]
for m in roster['advisors']:
 mid=name_to_id[m['name']];card=cards.get(m['name']);qual=m['qualification']
 title_match=re.search(r'副教授|教授|讲师|研究员',qual)
 fields=[{'label':k,'value':v} for k,v in card['fields']] if card else [
  {'label':'职称及导师资格','value':qual},
  {'label':'主要研究方向','value':m['research_directions']},
  {'label':'公开联系方式','value':m['public_email']},
  {'label':'公开程度','value':m['profile_coverage']},
  {'label':'备注','value':m['notes']}]
 links=[{'label':'官方教师页','url':m['profile_url']}]
 for u in m.get('source_urls',[]):
  if u!=m['profile_url']:links.append({'label':'补充官方来源','url':u})
 if card:
  for s in card.get('sources',[]):
   if s['url'] not in {x['url'] for x in links}:links.append(deepcopy(s))
 if m.get('historical_contact'):
  links.append({'label':'历史公开联系方式 待核实','url':m['historical_contact']['url']})
 ev=[{'id':mid+'-official','kind':'official','category':'官方方向与资格','statusLabel':'官方资料','population':'列入2026-01-08的125300专业硕导名单，不代表当年名额','date':m.get('profile_publication_date','未公开'),'text':'职称及资格：'+qual+'；研究方向：'+m['research_directions']+'；公开联系方式：'+m['public_email'],'url':m['profile_url'],'limitations':m['notes'],'sourceIds':['ROSTER-'+m['name']]}]
 for f in norm['feedback']:
  if m['name'] not in re.split(r'[、，,；;/／]+',f.get('teacher','')):continue
  ev.append({'id':f['id'],'kind':evidence_kind(f),'category':'按接触身份限定的匿名线索','statusLabel':f.get('status','待核实线索'),'population':f.get('relationship','身份未明'),'date':f.get('date_display','未公开'),'text':f['content'],'url':f['url'],'limitations':f['limits'],'author':f['author'],'sourceIds':[s for s in re.split(r'[／、,]+',f.get('source_ids','')) if s],'postId':f['source_key'].split(':',1)[-1]})
 for p in norm['official']:
  if p['topic']=='官方学生访谈' and p['title'].startswith(m['name']+'：'):
   ev.append({'id':p['ids'][0],'kind':'official','category':'官方具名学生个案','statusLabel':'具名MPAcc学生个案 保留时点','population':p['population'],'date':p['date_display'],'text':p['summary'],'url':p['url'],'limitations':p['limits'],'sourceIds':p['ids']})
 item={'id':mid,'name':m['name'],'title':title_match.group() if title_match else '未公开','qualification':qual,'directions':re.findall(r'G\d',m.get('guide_categories','')),'research':m['research_directions'],'summary':card.get('reason','') if card else m['research_directions'],'email':m['public_email'],'profileUrl':m['profile_url'],'profileFields':fields,'hasDetailedCard':bool(card),'evidence':ev,'links':links,'feedbackStatus':m.get('feedback_index_label') or m['social_feedback_status']['status'],'feedbackDetails':deepcopy(m['social_feedback_status']),'quotaStatus':m['annual_quota_status'],'notes':m['notes'],'publicInformationStatus':m['profile_coverage'],'historicalContact':deepcopy(m.get('historical_contact')),'rosterOrder':m['roster_order'],'rosterSourceUrl':m['roster_source_url'],'rosterSourceDate':m['roster_source_date'],'sourceCodes':list(dict.fromkeys(c for f in fields for c in codes_for(f['value'])))}
 mentors.append(item)
 if card:
  mentor_cards.append({'mentorId':mid,'name':m['name'],'fields':fields,'profileFields':fields,'reason':card.get('reason',''),'links':deepcopy(card.get('sources',[])),'sourceCodes':item['sourceCodes'],'originalFields':deepcopy(card['fields'])})

social=[]
for p in raw_posts:
 platform='小红书' if 'xiaohongshu.com' in p['url'] else ('贴吧' if 'tieba.baidu.com' in p['url'] else ('知乎' if 'zhihu.com' in p['url'] else '其他'))
 social.append({'id':p.get('note_id') or p['key'],'key':p['key'],'sourceIds':p['ids'],'canonicalUrl':p['canonical_url'],'url':p['url'],'title':p['title'],'author':p['author'],'date':p['date_display'],'platform':platform,'topic':p['topic'],'campus':p['campus'],'population':p['population'],'summary':p['summary'],'tips':deepcopy(p['tips']),'comments':deepcopy(p['comments']),'limitations':p['limits'],'category':p.get('review_category','背景或待核实材料'),'reviewReason':p.get('review_reason',''),'verificationStatus':p.get('use_status','需结合身份与日期核实'),'needsVerification':True,'screenedOnly':p.get('screened_only',False),'promotion':p.get('promotion','原记录未单独标注'),'readingScopes':p.get('reading_scopes',[]),'queries':p.get('queries',[]),'inputFiles':p.get('files',[])})

profiles=[]
for i,b in enumerate(guide['blocks']):
 if b['type']!='heading' or b.get('level')!=2:continue
 match=re.match(r'类型([A-E])\s*(.*)',b['text'])
 if not match and not b['text'].startswith('补充目标'):continue
 blocks=[]
 for nb in guide['blocks'][i+1:]:
  if nb['type']=='heading':break
  blocks.append(block_copy(nb))
 pid=match.group(1) if match else 'public-sector';title=match.group(2) if match else b['text'].replace('补充目标 ','')
 combined='\n'.join(text(x.get('text','')) for x in blocks)
 ids=[name_to_id[n] for n in name_to_id if n in combined]
 dir_ids=sorted({x for m in mentors if m['id'] in ids for x in m['directions']})
 profiles.append({'id':pid,'title':title,'summary':blocks[0].get('text','') if blocks else '', 'mentorIds':ids,'directionIds':dir_ids,'blocks':blocks,'sourceCodes':list(dict.fromkeys(c for x in blocks for c in x['sourceCodes'])),'additionalNamedPeople':['许文瀚'] if '许文瀚' in combined else []})

download_specs=[
 ('mentor-guide','导师选择参考','南京审计大学MPAcc导师选择参考_20261105.docx','mentor-guide.docx','docx','34名导师框架 17张详细卡片与个人匹配建议'),
 ('life-guide','学习生活攻略','南京审计大学MPAcc学习生活攻略_20261105.docx','life-guide.docx','docx','12章学习生活和办事参考 含可点击目录与来源'),
 ('evidence-index','原帖与官方证据索引','outputs/nau_xhs_20261105/南审小红书资料索引_20261105.xlsx','evidence-index.xlsx','xlsx','82条社交原帖及官方资料 适用人群与证据边界')]
downloads=[]
for ident,title,source,dest,fmt,desc in download_specs:
 src=ROOT/source;out=DIST/'downloads'/dest;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,out)
 downloads.append({'id':ident,'title':title,'url':'./downloads/'+dest,'format':fmt,'description':desc,'filename':dest,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
result={
 'meta':{'schemaVersion':'1.0.0','title':'南京审计大学 MPAcc 选导与生活指南','updatedAt':'2026-11-05','counts':{'mentors':len(mentors),'detailedMentorCards':len(mentor_cards),'lifeChapters':len(chapters),'socialPosts':len(social),'officialEvidence':len(norm['official']),'feedbackRecords':len(norm['feedback'])},'socialPostCategories':dict(Counter(p['category'] for p in social)),'rosterSource':roster['roster_source'],'directionNote':'G1至G6是资料导览分类，不是统一招生方向；报考以当年125300目录，在读以本级培养方案。','evidenceNote':'官方资料、具名个案、本科课程、研究生转述和身份不明评价分开保留；个人评价不构成导师性格、招生名额或普遍指导风格结论。','quotaNote':'名单内不代表当年仍有名额；正式选导以当年双选通知及导师本人回复为准。','platformNote':'82条为已整理的原帖索引，含筛除与背景材料，不表示82条都是MPAcc亲历或导师评价。','sourceInputFiles':['life_content.json','mentor_expanded_content.json','research_advisor_roster.json','nau_index_work/normalized_evidence.json']},
 'directions':DIRECTIONS,'mentors':mentors,'mentorCards':mentor_cards,'lifeTitle':life['title'],'lifeIntro':life_intro,'lifeChapters':chapters,'mentorTitle':guide['title'],'mentorIntro':mentor_intro,'mentorGuideSections':mentor_sections,'socialPosts':social,'sourceRegistry':sources,'targetProfiles':profiles,'downloads':downloads,
 'officialEvidence':[deepcopy({k:v for k,v in p.items() if k!='raw'}) for p in norm['official']],
 'feedbackIndex':deepcopy(norm['feedback']),'tipsIndex':deepcopy(norm['tips']),
 'rosterConflicts':deepcopy(roster['conflicts']),'rosterExclusions':deepcopy(roster['exclusions']),'generalLimits':deepcopy(roster['general_limits'])}
assert [len(result[k]) for k in ['mentors','mentorCards','lifeChapters','socialPosts']]==[34,17,12,82]
assert len({p['id'] for p in social})==82
assert all(p['url'] and p['population'] and p['category'] for p in social)
assert all(m['rosterSourceDate']=='2026-01-08' for m in mentors)
assert sum(len(x['blocks'])+1 for x in chapters)+len(life_intro)==len(life['blocks'])
# All links in the specified guide blocks and registry remain present in the generated JSON.
raw_json=json.dumps(result,ensure_ascii=False,indent=2)
required=set()
def collect_links(x):
 if isinstance(x,dict):
  for k,v in x.items():
   if k in ['url','profile_url','roster_source_url'] and isinstance(v,str):required.add(v)
   else:collect_links(v)
 elif isinstance(x,list):
  for v in x:collect_links(v)
collect_links(life);collect_links(guide);collect_links(roster)
missing=[u for u in required if u not in raw_json]
assert not missing,missing
out=DIST/'data/site-data.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(raw_json)
print(json.dumps({'file':str(out),'bytes':out.stat().st_size,'counts':result['meta']['counts'],'targetProfiles':len(profiles),'sourceRegistryKeys':len(sources),'downloads':[x['filename'] for x in downloads],'all_required_links_retained':not missing},ensure_ascii=False))
