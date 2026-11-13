import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));
const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const entries=dataset.mentors.flatMap(mentor=>(mentor.studentReviews?.reviews||[]).map(review=>({mentor,review})));
const added=entries.filter(({review})=>review.id.startsWith('sr-alias-comments-20261113-'));
const find=id=>{
  const entry=entries.find(({review})=>review.id===id);
  assert(entry,`missing review ${id}`);
  return entry;
};
const excerpt=review=>review.contextNotes?.excerpt?.text||review.text||'';
const quoteKinds=new Set(['recorded_quote','visible_quote']);
function assertDirectScreenshot(review){
  const screenshots=(review.screenshots||[]).filter(image=>image.kind==='actual-browser-screenshot'&&image.textAltered===false);
  assert(screenshots.length,`${review.id}: a visible quotation needs an actual unaltered browser screenshot`);
  for(const image of screenshots){
    assert.match(image.src,/^\.\/evidence\//,'the screenshot must be a published local evidence image');
    assert(review.sourceIds.includes(image.sourceId),'the screenshot must belong to this review source');
    const bytes=readFileSync(new URL('../dist/'+image.src.replace(/^\.\//,''),import.meta.url));
    assert(bytes.length>0,'the screenshot file must exist and contain image bytes');
    assert(bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))||bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),'evidence must be an actual JPEG or PNG file');
    if(image.bytes!==undefined)assert.equal(bytes.length,image.bytes);
    if(image.sha256)assert.equal(createHash('sha256').update(bytes).digest('hex'),image.sha256);
  }
  const quotedImage=review.contextNotes?.excerpt?.screenshotSrc;
  if(quotedImage)assert(screenshots.some(image=>image.src===quotedImage),'the visible excerpt must point to its actual screenshot');
}

async function boot(data=dataset){
  const elements=new Map(),handlers=new Map();
  let document;
  class Element{
    constructor(selector){this.selector=selector;this.innerHTML='';this.textContent='';this.value='';this.dataset={};this.attributes={};this.style={};this.open=false;this.hidden=false;this.isConnected=true;this.classList={add(){},remove(){},contains(){return false;}};}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,handler){handlers.set(this.selector+':'+name,handler);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getBoundingClientRect(){return {height:70,left:0,right:900,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),addEventListener:(name,handler)=>handlers.set(name,handler)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:''};
  const window={location,matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){},scrollY:0,scrollTo(){}};
  vm.runInNewContext(script,{document,window,location,URL,CSS:{escape:value=>value},console,CustomEvent:class{},Event:class{},navigator:{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  return {
    panel:()=>get('#mentor-selection-signals').innerHTML,
    detail(id){handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:'mentor',id}}:null},preventDefault(){}});return get('#dialog-content').innerHTML;}
  };
}

test('the November alias update adds eleven records from ten comments without multiplying source posts',()=>{
  assert.equal(entries.length,55);
  assert.equal(new Set(entries.map(({review})=>review.id)).size,55,'review ids must remain unique');
  assert.equal(added.length,11);
  const expected={
    'sr-alias-comments-20261113-xw':'徐伟',
    'sr-alias-comments-20261113-cxj':'蔡显军',
    'sr-alias-comments-20261113-tzd':'谭志东',
    'sr-alias-comments-20261113-zl':'张力',
    'sr-alias-comments-20261113-xw-x02':'徐伟',
    'sr-alias-comments-20261113-dong-thread':'董必荣',
    'sr-alias-comments-20261113-zxl-qiuqiu':'张兴亮',
    'sr-alias-comments-20261113-zxl-wm':'张兴亮',
    'sr-alias-comments-20261113-lgc-qingjiao':'刘国城',
    'sr-alias-comments-20261113-pj-linyu':'潘俊',
    'sr-alias-comments-20261113-zxl-liangliang':'张兴亮'
  };
  assert.deepEqual(Object.fromEntries(added.map(({mentor,review})=>[review.id,mentor.name])),expected);
  assert.equal(new Set(added.map(({review})=>review.sourceCommentKey)).size,10,'nine new parent comments plus the separately captured Liangliang reply');
  assert.deepEqual([...new Set(added.flatMap(({review})=>review.sourceIds))].sort(),['X01','X02']);
  for(const {review} of added){
    assert(review.sourceCommentKey,'each record needs a source-comment identity');
    assert.equal(review.attribution.status,'confirmed');
    assert.equal(review.contextAssessment.eligibleForRecommendation,false);
    assert.equal(review.contextAssessment.eligibleForConcern,false);
    assert(quoteKinds.has(review.contextNotes.excerpt.kind),'quotes must identify whether they came from a screenshot or a reading record');
    if(review.contextNotes.excerpt.kind==='visible_quote'||review.selectionSignal?.excerpt?.kind==='visible_quote')assertDirectScreenshot(review);
    for(const code of review.sourceIds)assert(dataset.sourceRegistry[code]);
  }
});

test('TZD and ZL share one nomination while different narrators retain separate records',()=>{
  const tzd=find('sr-alias-comments-20261113-tzd').review;
  const zl=find('sr-alias-comments-20261113-zl').review;
  assert.equal(tzd.sourceCommentKey,zl.sourceCommentKey);
  assert.equal(tzd.sharedCommentId,zl.sharedCommentId);
  assert.equal(excerpt(tzd),'那就tzd和zl，比较符合你的要求');
  assert.equal(excerpt(tzd),excerpt(zl));
  assert(tzd.relatedReviewIds.includes(zl.id));
  assert(zl.relatedReviewIds.includes(tzd.id));
  assert.equal(tzd.narrator,'天天发癫');
  assert.equal(zl.narrator,'天天发癫');
  assert.equal(tzd.date,'2025-04-09','the directly captured date supersedes the earlier reading result');
  assert.equal(zl.date,'2025-04-09');
  assert(!tzd.selectionSignal&&!zl.selectionSignal,'a conditional nomination is not a strong recommendation');
  const group=added.filter(({review})=>review.sourceCommentKey===tzd.sourceCommentKey);
  assert.deepEqual(group.map(({mentor})=>mentor.name).sort(),['张力','谭志东']);
  assert.notEqual(find('sr-alias-comments-20261113-zxl-qiuqiu').review.sourceCommentKey,find('sr-alias-comments-20261113-zxl-wm').review.sourceCommentKey);
  assert.equal(find('sr-alias-comments-20261113-zxl-wm').review.date,'2025-04-03');
  assert.notEqual(find('sr-alias-comments-20261113-lgc-qingjiao').review.narrator,find('sr-129b0dd973f0d1').review.narrator);
});

test('repeated avoidance and explicit attitudes keep different strength labels in the published UI',async()=>{
  const xw=find('sr-alias-comments-20261113-xw').review;
  const cxj=find('sr-alias-comments-20261113-cxj').review;
  const gfl=find('sr-3ec4800bf7c77e').review;
  assert.equal(xw.selectionSignal.direction,'avoid');
  assert.equal(xw.selectionSignal.intensity,'strong');
  assert.equal(xw.selectionSignal.excerpt.text,'不要xw，一定一定不要');
  assert.equal(cxj.selectionSignal.direction,'avoid');
  assert.equal(cxj.selectionSignal.intensity,'explicit');
  assert.equal(cxj.selectionSignal.excerpt.text,'避雷cxj');
  assert.equal(gfl.selectionSignal.direction,'recommend');
  assert.equal(gfl.selectionSignal.intensity,'explicit');
  assert.equal(gfl.selectionSignal.excerpt.text,'那必须高凤莲');
  for(const review of [xw,cxj,gfl]){
    assert(quoteKinds.has(review.selectionSignal.excerpt.kind));
    if(review.selectionSignal.excerpt.kind==='visible_quote')assertDirectScreenshot(review);
    assert.equal(review.firsthand,null);
    assert.equal(review.contextAssessment.eligibleForConcern,false);
    assert.equal(review.contextAssessment.eligibleForRecommendation,false);
  }
  const app=await boot();
  assert.match(app.panel(),/不要xw，一定一定不要/);
  assert.match(app.panel(),/避雷cxj/);
  assert.match(app.panel(),/那必须高凤莲/);
  assert.match(app.detail('mentor-19'),/原帖强烈劝退/);
  const cai=app.detail('mentor-25'),gao=app.detail('mentor-09');
  assert.match(cai,/原帖明确劝退/);
  assert.doesNotMatch(cai,/原帖强烈劝退/,'a short explicit warning must not acquire an invented stronger label');
  assert.match(gao,/原帖明确推荐/);
  assert.doesNotMatch(gao,/原帖强烈推荐/);
});

test('the X02 strictness impression stays separate from the X01 warning and does not become avoidance',async()=>{
  const warning=find('sr-alias-comments-20261113-xw').review;
  const strict=find('sr-alias-comments-20261113-xw-x02').review;
  assert.equal(strict.narrator,'小张要长高');
  assert.deepEqual(strict.sourceIds,['X02']);
  assert.deepEqual(warning.sourceIds,['X01']);
  assert.notEqual(strict.sourceCommentKey,warning.sourceCommentKey);
  assert.equal(excerpt(strict),'xw老师要求很高，有点严格');
  assert.equal(strict.polarity,'neutral');
  assert.equal(strict.firsthand,null);
  assert.equal(strict.experienceType,'general');
  assert(!strict.selectionSignal);
  assert.equal(strict.contextAssessment.eligibleForConcern,false);
  const data=structuredClone(dataset);
  const mentor=data.mentors.find(item=>item.id==='mentor-19');
  mentor.studentReviews.reviews=[structuredClone(strict)];
  mentor.studentReviews.recommendationPoints=[];
  mentor.studentReviews.concerns=[];
  const app=await boot(data),detail=app.detail(mentor.id);
  assert.match(detail,/xw老师要求很高，有点严格/);
  assert.doesNotMatch(detail,/selection-signal-badge|原帖强烈劝退|原帖明确劝退/);
  assert.doesNotMatch(app.panel(),/xw老师要求很高，有点严格/);
});

test('questions remain lookup context rather than attributed student reviews',()=>{
  const questionAuthors=new Set(['不想说','小红薯64C310D3']);
  for(const {review} of entries){
    assert(!questionAuthors.has(review.narrator),'a mentor question is not a personal evaluation');
    assert.doesNotMatch(excerpt(review),/^想问一下许汉\s*y\s*老师怎么样/);
    assert.doesNotMatch(excerpt(review),/^想问问[，,]?贺建刚老师怎么样/);
  }
  const xu=dataset.mentorAliases.find(item=>item.alias==='许汉 y');
  assert(xu,'the partial-name question may remain available as a lookup');
  assert.deepEqual(xu.reviewIds,[],'a name lookup alone must not create evaluation evidence');
});

test('the Liangliang reply maps to Zhang Xingliang through the named parent comment and direct screenshot',async()=>{
  const {mentor,review}=find('sr-alias-comments-20261113-zxl-liangliang');
  assert.equal(mentor.id,'mentor-13');
  assert.equal(mentor.name,'张兴亮');
  assert.equal(review.narrator,'Y.');
  assert.equal(review.date,'03-31（年份未显示）');
  assert.deepEqual(review.sourceIds,['X02']);
  assert.equal(review.experienceType,'general');
  assert.equal(review.firsthand,null);
  assert.equal(review.polarity,'positive');
  assert.equal(excerpt(review),'亮亮老师很好，非常推荐');
  assert.equal(review.contextNotes.excerpt.kind,'visible_quote');
  assert.match(JSON.stringify(review),/研究方向的话，比较喜欢张兴亮和黄中生老师，有没有学姐学长可以分享一下呀/,'preserve the actual parent comment naming both teachers');
  assert.match(review.attribution.reason,/父评论|上层|同楼|楼上|该层/,'the naming basis must identify the thread relationship');
  assert.match(review.attribution.reason,/张兴亮/);
  assertDirectScreenshot(review);
  assert.equal(review.selectionSignal.direction,'recommend');
  assert.equal(review.selectionSignal.intensity,'strong');
  assert.equal(review.selectionSignal.excerpt.kind,'visible_quote');
  assert.equal(review.selectionSignal.excerpt.text,'亮亮老师很好，非常推荐');
  const alias=dataset.mentorAliases.find(item=>item.alias==='亮亮');
  assert(alias,'the observed nickname should be searchable');
  assert.equal(alias.status,'matched');
  assert.deepEqual(alias.mentorIds,['mentor-13']);
  assert(alias.reviewIds.includes(review.id));
  assert(alias.sourceIds.includes('X02'));
  const app=await boot(),detail=app.detail('mentor-13');
  assert.match(detail,/原帖强烈推荐/);
  assert.match(detail,/亮亮老师很好，非常推荐/);
});

test('irony, course impressions and a doctorate joke retain their limited scope',()=>{
  const dong=find('sr-alias-comments-20261113-dong-thread').review;
  assert.equal(dong.polarity,'neutral');
  assert.equal(dong.firsthand,null);
  assert(!dong.selectionSignal);
  assert.match(dong.contextNotes.interpretation.text,/反讽|调侃/);
  assert.match(JSON.stringify(dong.hearsayParts),/学长/);
  assert.notEqual(dong.id,find('sr-alias-20261113-dbr').review.id);
  const course=find('sr-alias-comments-20261113-lgc-qingjiao').review;
  assert.equal(course.experienceType,'course');
  assert.equal(course.firsthand,true);
  assert.match(course.degree,/本科/);
  assert.equal(course.contextAssessment.eligibleForRecommendation,false);
  const pan=find('sr-alias-comments-20261113-pj-linyu').review;
  assert.equal(pan.experienceType,'general');
  assert.equal(pan.firsthand,null);
  assert(!pan.selectionSignal);
  assert.match(pan.text,/不能.*保证|不是.*保证/);
  const xw=find('sr-alias-comments-20261113-xw').review;
  assert.equal(xw.date,'2025-04-06','the actual browser screenshot resolves conflicting earlier reading dates');
  assertDirectScreenshot(xw);
});

test('the source popup keeps recovered attribution and counts a shared nomination once',()=>{
  const post=dataset.socialPosts.find(item=>item.id==='67ecb72b000000001e0042af');
  const dbr=post.comments.find(item=>item.aliasReviewId==='sr-alias-20261113-dbr');
  assert.equal(dbr.author,'涂卡图🐰');
  assert.equal(dbr.date_display,'2025-04-02');
  assert.match(dbr.content,/敢不敢选d b r/);
  assert.doesNotMatch(dbr.limits,/昵称未留存|日期未保留|原句未留存/);
  const tzd=find('sr-alias-comments-20261113-tzd').review;
  const shared=post.comments.filter(item=>item.sourceCommentKey===tzd.sourceCommentKey);
  assert.equal(shared.length,1);
  assert.deepEqual(shared[0].aliasReviewIds.slice().sort(),['sr-alias-comments-20261113-tzd','sr-alias-comments-20261113-zl']);
  assert.match(shared[0].teacher,/谭志东/);
  assert.match(shared[0].teacher,/张力/);
});
