import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));
const decode=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');

async function app({secure=true,clipboard=true,denied=false,data=dataset}={}) {
  const elements=new Map(), handlers=new Map(), winHandlers=new Map(), copies=[], writes=[];
  let document;
  class Element {
    constructor(selector){this.selector=selector;this.dataset={};this.style={};this.attributes={};this.isConnected=true;this.open=false;this._html='';this.value='';this.textContent='';this.classList={add(){},remove(){},contains(){return false;}};}
    set innerHTML(value){
      this._html=value;
      if(this.selector==='#dialog-content') {
        const match=value.match(/<textarea[^>]*id="contact-copy-text"[^>]*>([\s\S]*?)<\/textarea>/);
        if(match) get('#contact-copy-text').value=decode(match[1]);
      }
    }
    get innerHTML(){return this._html;}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,fn){handlers.set(this.selector+':'+name,fn);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getBoundingClientRect(){return {height:90,left:0,right:800,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    select(){this.selected=true;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),title:'',addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:''};
  const window={location,isSecureContext:secure,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>winHandlers.set(name,fn),dispatchEvent(){},scrollTo(){},scrollY:0};
  const navigator=clipboard?{clipboard:{writeText:async text=>{if(denied)throw new Error("NotAllowedError");copies.push(text);}}}:{};
  vm.runInNewContext(script,{document,window,location,navigator,URL,console,CSS:{escape:x=>x},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options?.detail;}},Event:class{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push([key,value])},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  const click=(action,id,extra={})=>{const target=new Element('action');target.dataset={action,id,...extra};handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?target:null},preventDefault(){}});};
  return {get,copies,writes,click,location,window,search(value){handlers.get('input')({target:{id:'mentor-search',value,parentElement:{querySelector:()=>get('.search-clear')}}});},changeReview(value){handlers.get('change')({target:{id:'review-coverage',value}});},editContact(text){get('#contact-copy-text').value=text;handlers.get('input')({target:{id:'contact-copy-text',value:text}});},async changeMentor(id){handlers.get('change')({target:{id:'contact-mentor',value:id}});await Promise.resolve();},route(hash){location.hash=hash;winHandlers.get('hashchange')();},async flush(){for(let i=0;i<6;i++)await Promise.resolve();}};
}


const emptyDossier=()=>({coverageStatus:'not_found',coverageLabel:'暂无可归属学生评价',summary:'尚缺可归属的学生体验。',reviews:[],recommendationPoints:[],concerns:[],verificationQuestions:['近期是否固定组会，论文每轮反馈一般多久？'],gaps:['近年直系学生的公开经历尚缺。']});
const reviewFixture=()=>{
  const data=structuredClone(dataset);
  delete data.mentorAliases; // This fixture exercises legacy data without a resolved alias catalog.
  data.ambiguousMentorAliases=[{alias:'LH/lh',text:'UNRESOLVED_GLOBAL_ALLEGATION'}, {alias:'WY',text:'DO_NOT_ASSIGN'}, {alias:'XW/xw',status:'unresolved'}, {alias:'WJY/wjy',status:'unresolved'}, {alias:'d b r',status:'unresolved'}, {alias:'XW xw',status:'unresolved'}, {alias:'SWT / DWT',status:'search_only'}, {alias:'高老师',status:'unresolved'}, {alias:'许汉 y',status:'unresolved'}, {alias:'QZ',status:'potential_collision'}];
  data.sourceRegistry.TEST_GOOD={url:'https://example.org/student-story',title:'学生经历来源'};
  data.sourceRegistry.TEST_BAD={url:'javascript:alert(1)',title:'不安全地址'};
  data.mentors.forEach(mentor=>mentor.studentReviews=emptyDossier());
  const missing=data.mentors[0];
  missing.studentReviews.reviews=[{id:'unresolved',text:'UNRESOLVED_PERSONAL_ALLEGATION',attribution:{status:'unresolved',alias:'LH'}}];
  missing.studentReviews.recommendationPoints=[{text:'UNSUPPORTED_PRAISE',reviewIds:['missing-review']}];
  missing.studentReviews.concerns=[{text:'UNSUPPORTED_CONCERN',reviewIds:['unresolved']}];
  const course=data.mentors[1];
  course.studentReviews={...emptyDossier(),coverageStatus:'course_only',coverageLabel:'本科课程经历',summary:'只有本科课程接触，不能推广到研究生培养。',reviews:[{
    id:'course-confirmed',sourceIds:['TEST_GOOD','TEST_BAD'],sourceUrl:'javascript:alert(2)',sourceTitle:'课程评价原文',narrator:'课程评论者 <img src=x onerror=alert(3)>',date:'2025-05-01',degree:'本科会计学',year:'2024级',relationship:'只上过本科课程',experienceType:'course',firsthand:true,polarity:'mixed',attribution:{status:'confirmed',alias:course.name,reason:'评论原文写出完整姓名。'},text:'老师逐步讲解分析过程 <script>alert(4)</script> [TEST_GOOD]',specifics:['每次作业会指出计算和论证步骤。'],limits:['没有跟随该老师写MPAcc论文，不能据此判断专硕指导。','仅限该课程。'],readingScope:['已读原帖正文。','已读完整评论。'],firsthandScope:['本人只上过本科课程。','本人没有参与论文指导。'],hearsayParts:'朋友的论文体验属于转述。'
  },{id:'unresolved-course',text:'HIDDEN_ALIAS_CLAIM',attribution:{status:'unresolved',alias:'WY'}}],recommendationPoints:[{text:'作业反馈有具体步骤。',reviewIds:['course-confirmed'],sourceIds:['TEST_GOOD'],scope:'仅限该本科课程经历。'}],concerns:[{text:'课程作业反馈较密，需要预留时间。',reviewIds:['course-confirmed'],scope:'仅适用于该学期的课程安排。'}],verificationQuestions:['MPAcc论文反馈频率与课程作业要求是否不同？']};
  course.evidence.push({kind:'firsthand',text:'LEGACY_DUPLICATE_FEEDBACK'});
  const direct=data.mentors[2];
  direct.studentReviews={...emptyDossier(),coverageStatus:'mpacc_guidance',coverageLabel:'MPAcc指导亲历',summary:'有明确MPAcc身份的论文指导经历。',reviews:[{id:'mpacc-confirmed',narrator:'2023级MPAcc学生',degree:'MPAcc',year:'2023级',relationship:'论文指导学生',firsthand:true,experienceType:'guidance',polarity:'positive',attribution:{status:'confirmed',alias:direct.name,reason:'作者明确导师全名和专硕身份。'},text:'选题后逐次修改研究设计。',limits:'只反映这一位学生的经历。'}]};
  const undergraduate=data.mentors[3];
  undergraduate.studentReviews={...emptyDossier(),coverageStatus:'non_mpacc_guidance',coverageLabel:'本科项目经历／非MPAcc指导',summary:'仅本科项目指导。',reviews:[{id:'undergrad-confirmed',degree:'本科',relationship:'本科项目指导',firsthand:true,experienceType:'guidance',attribution:{status:'confirmed',reason:'本科项目文章写出指导老师全名。'},text:'项目中讨论问题。',limits:'不能当作MPAcc培养体验。'}]};
  const unknown=data.mentors[4];
  unknown.studentReviews={...emptyDossier(),coverageStatus:'guidance_unspecified',coverageLabel:'指导经历 · 阶段未明',reviews:[{id:'unknown-confirmed',degree:'学位阶段未知',firsthand:true,experienceType:'guidance',attribution:{status:'confirmed',reason:'写出全名，未说明学位。'},text:'询问过论文问题。'}]};
  return data;
};

test('missing personal evidence cannot create praise, concerns or named abbreviation allegations',async()=>{
 const a=await app({data:reviewFixture()});
 assert.match(a.get('#app').innerHTML,/先看谁说了什么，再看推荐与提醒/);
 assert.match(a.get('#app').innerHTML,/LH、WY/);
 assert.doesNotMatch(a.get('#app').innerHTML,/UNRESOLVED_GLOBAL_ALLEGATION|DO_NOT_ASSIGN/);
 const aliases=a.get('#app').innerHTML.match(/缩写线索：([^<]+?)。/)?.[1];
 assert.equal(aliases,'LH、WY、XW、WJY、DBR、QZ','combined aliases normalize, de-duplicate and omit search-only or partial non-Latin names');
 assert.doesNotMatch(a.get('#app').innerHTML,/本轮仍需核实的缩写/,'potential collisions must not be described as observed comments');
 a.click('mentor','mentor-01');const html=a.get('#dialog-content').innerHTML;
 assert.match(html,/暂无可归属的公开学生体验/);
 assert.match(html,/联系前向直系学生核实/);
 assert.match(html,/近期是否固定组会/);
 assert.doesNotMatch(html,/UNSUPPORTED_PRAISE|UNSUPPORTED_CONCERN|UNRESOLVED_PERSONAL_ALLEGATION|避雷与适配提醒|被推荐的具体理由/);
 assert(html.indexOf('学生个人评价')<html.indexOf('公开信息'));
});

test('student experience records expose identity, attribution, specific process and limits with safe sources',async()=>{
 const a=await app({data:reviewFixture()});a.click('mentor','mentor-02');const html=a.get('#dialog-content').innerHTML;
 for(const text of ['本科课程经历','本人经历自述','本科会计学','2024级','只上过本科课程','作业反馈有具体步骤','课程作业反馈较密','原帖写法','评论原文写出完整姓名','材料范围','不能据此判断专硕指导','MPAcc论文反馈频率','本人亲历范围','本人只上过本科课程。；本人没有参与论文指导。','转述／朋友经历的部分','朋友的论文体验属于转述。','已读原帖正文。；已读完整评论。'])assert(html.includes(text),text);
 assert.match(html,/&lt;script&gt;alert\(4\)&lt;\/script&gt;/);
 assert.match(html,/&lt;img src=x onerror=alert\(3\)&gt;/);
 assert.match(html,/href="https:\/\/example.org\/student-story"/);
 assert.doesNotMatch(html,/<script>|<img src=x|href="javascript:|HIDDEN_ALIAS_CLAIM|LEGACY_DUPLICATE_FEEDBACK/);
 assert.doesNotMatch(html,/\[&quot;没有跟随|\[&quot;已读原帖|\[&quot;本人只上过/,'array metadata must render as prose, not serialized JSON');
 assert.match(html,/<details class="student-review-record"><summary>/,'records should start folded');
});

test('coverage filtering keeps MPAcc distinct from other guidance and keeps comparison and session drafts',async()=>{
 const data=reviewFixture(), a=await app({data});
 a.click('compare-toggle','mentor-01');a.click('compare-toggle','mentor-02');a.click('compare-toggle','mentor-04');
 a.changeReview('mpacc_guidance');let html=a.get('#mentor-results').innerHTML;
 assert(html.includes(data.mentors[2].name));assert(!html.includes(data.mentors[3].name));
 a.changeReview('other_guidance');html=a.get('#mentor-results').innerHTML;
 assert(html.includes(data.mentors[3].name));assert(html.includes(data.mentors[4].name));assert(!html.includes(data.mentors[2].name));
 a.changeReview('has_records');html=a.get('#mentor-results').innerHTML;
 assert(!html.includes(data.mentors[0].name));assert(html.includes(data.mentors[1].name));
 a.click('compare-open');html=a.get('#dialog-content').innerHTML;
 assert.match(html,/3 \/ 3|董必荣/);
 assert.match(html,/本科项目经历／非MPAcc指导/);
 assert.match(html,/暂无可归属的学生个人评价/);
 assert.match(html,/作业反馈有具体步骤/);
 assert.doesNotMatch(html,/LEGACY_DUPLICATE_FEEDBACK|UNSUPPORTED_CONCERN|HIDDEN_ALIAS_CLAIM/);
 a.click('contact-prepare','mentor-02');a.editContact('保留课程老师的联系提纲');a.click('compare-close');
 a.route('#life/life-08');a.route('#mentors');a.click('contact-prepare','mentor-02');assert.equal(a.get('#contact-copy-text').value,'保留课程老师的联系提纲');
 a.click('compare-close');a.click('reset-mentors');assert.match(a.get('#mentor-results').innerHTML,new RegExp(data.mentors[0].name));
 assert.deepEqual(a.writes,[]);
});

test('review screenshots reject unsafe paths, escape captions, and never inherit another branch from the same post',async()=>{
 const data=reviewFixture(), review=data.mentors[1].studentReviews.reviews[0];
 review.sourceUrl='https://example.org/student-story';
 data.sourceRegistry.TEST_GOOD.screenshots=[{src:'./evidence/xhs/other-mentor-branch.png',caption:'OTHER_TEACHER_BRANCH'}];
 review.screenshots=[{src:'./evidence/xhs/review-safe-01.png',caption:'<img src=x onerror=alert(8)>',alt:'评论" onload="alert(9)',scope:'只截<一条>回复，不包含后续讨论。',sourceUrl:'javascript:alert(6)',width:1360,height:900},
  ...['https://evil.example/evidence.png','javascript:alert(7)','./evidence/xhs/../secret.png','./evidence/xhs/a.png?token=private','./evidence/xhs/a%2fb.png','data:image/png;base64,bad'].map(src=>({src,caption:'UNSAFE_CAPTURE'}))];
 const a=await app({data});a.click('mentor','mentor-02');let html=a.get('#dialog-content').innerHTML;
 assert.doesNotMatch(html,/class="evidence-screenshots"/,'review evidence is a compact adjacent image');
 a.click('review-image',null,{mentorId:'mentor-02',reviewId:'course-confirmed',index:'0'});
 assert.equal(a.get('#review-image-dialog').open,true);
 html+=a.get('#review-image-content').innerHTML;
 assert.match(html,/src="\.\/evidence\/xhs\/review-safe-01\.png"/);
 assert.match(html,/width="1360" height="900" loading="lazy" decoding="async"/);
 assert.match(html,/&lt;img src=x onerror=alert\(8\)&gt;/);
 assert.match(html,/alt="评论&quot; onload=&quot;alert\(9\)"/);
 assert.match(html,/只截&lt;一条&gt;回复/);
 assert.match(html,/打开原帖 ↗/);
 assert.doesNotMatch(html,/OTHER_TEACHER_BRANCH|other-mentor-branch|UNSAFE_CAPTURE|href="javascript:|src="https:\/\/evil|<img src=x/);
});

test('post details expose registered captures and explicit comment captures while posts without images stay quiet',async()=>{
 const data=reviewFixture(), post=data.socialPosts[0];
 post.sourceIds=['R799'];post.screenshots=[];
 data.sourceRegistry.R799={title:'同帖截图来源',url:post.url,postId:post.id,screenshots:[{src:'./evidence/xhs/post-overview.jpg',caption:'正文与可见评论',scope:'仅本屏，不代表全部评论。'}]};
 post.comments=[{author:'公开评论者',text:'课程经历的补充。',screenshots:[{src:'./evidence/xhs/comment-01.webp',caption:'评论分支',scope:'只记录这一条跟评。'}]}];
 const a=await app({data});a.route('#posts');assert.match(a.get('#post-results').innerHTML,/附 1 张原帖／评论截图/);
 a.click('post',post.id);let html=a.get('#dialog-content').innerHTML;
 assert.match(html,/src="\.\/evidence\/xhs\/post-overview\.jpg"/);
 assert.match(html,/src="\.\/evidence\/xhs\/comment-01\.webp"/);
 assert.match(html,/仅本屏，不代表全部评论/);
 assert.match(html,/只记录这一条跟评/);
 assert.match(html,/查看原图 ↗/);
 a.click('mentor','mentor-01');html=a.get('#dialog-content').innerHTML;
 assert.doesNotMatch(html,/来源页面与评论截图|截图未提供|post-overview|comment-01/);
});

test('post dialog keeps a shared capture under its explicit comment and shows each image once',async()=>{
 const data=reviewFixture(), post=data.socialPosts[0];
 const shared={src:'./evidence/xhs/shared-comment.jpg',caption:'明确归属的评论截图'};
 const overview={src:'./evidence/xhs/shared-post-top.jpg',caption:'原帖正文截图'};
 post.sourceIds=['R799'];post.screenshots=[shared,overview];
 data.sourceRegistry.R799={title:'同帖来源',url:post.url,screenshots:[shared,overview]};
 post.comments=[{author:'原评论者',text:'THIS_COMMENT_OWNS_CAPTURE',screenshots:[shared]},
  {author:'其他回复者',text:'ANOTHER_COMMENT',screenshots:[shared]}];
 const a=await app({data});a.route('#posts');
 assert.match(a.get('#post-results').innerHTML,/附 2 张原帖／评论截图/);
 a.click('post',post.id);const html=a.get('#dialog-content').innerHTML;
 assert.equal((html.match(/<img[^>]+src="\.\/evidence\/xhs\/shared-comment\.jpg"/g)||[]).length,1);
 assert.equal((html.match(/<img[^>]+src="\.\/evidence\/xhs\/shared-post-top\.jpg"/g)||[]).length,1);
 assert(html.indexOf('THIS_COMMENT_OWNS_CAPTURE')<html.indexOf('shared-comment.jpg'));
 assert(html.indexOf('shared-comment.jpg')<html.indexOf('ANOTHER_COMMENT'));
 assert(html.indexOf('ANOTHER_COMMENT')<html.indexOf('shared-post-top.jpg'));
});

test('source and review maintenance counters stay outside the public page',async()=>{
 const data=reviewFixture();
 delete data.meta.reviewContextAudit;
 data.meta.research102={newOfficialSources:987,updatedSocialPosts:988};
 data.meta.studentReviewResearch.round8={newTeacherSelfReports:1,authenticatedXhsSourcesReread:2,screenshotsCaptured:5,newStudentExperiences:0,newXhsSources:0};
 const a=await app({data});a.route('#posts');
 assert.match(a.get('#app').innerHTML,/建议的背后，是这些原始来源/);
 assert.doesNotMatch(a.get('#app').innerHTML,/新增 <strong>|补读 <strong>|补入 <strong>|本轮|<strong>987<\/strong>|<strong>988<\/strong>/);
 delete data.meta.studentReviewResearch.round8;
 const older=await app({data});older.route('#posts');
 assert.doesNotMatch(older.get('#app').innerHTML,/新增 <strong>|补读 <strong>|补入 <strong>|本轮|<strong>987<\/strong>|<strong>988<\/strong>/);
});

test('ambiguous endorsements stay neutral without exposing maintenance summaries',async()=>{
 const data=reviewFixture();
 data.socialPosts=data.socialPosts.slice(0,7);
 data.meta.reviewContextAudit={reclassifiedReviewRecords:3,reclassifiedSocialContexts:1};
 data.mentors.forEach(mentor=>mentor.studentReviews=emptyDossier());
 const urls=['https://www.xiaohongshu.com/explore/000000000000000000000001','https://xiaohongshu.com/explore/000000000000000000000001','https://www.rednote.com/discovery/item/000000000000000000000002'];
 for(let i=0;i<3;i++) {
  const mentor=data.mentors[i],id=`weak-context-${i}`;
  mentor.studentReviews={...emptyDossier(),coverageStatus:'weak_mentions',reviews:[{id,sourceIds:[i<2?'X01':'X02'],canonicalUrl:urls[i],sourceUrl:urls[i],experienceType:'general',firsthand:null,polarity:['positive','mixed','negative'][i],attribution:{status:'confirmed',reason:'全名仅确认讨论对象。'},text:'只有笼统提名，没有本人接触过程。',contextAssessment:{displayLabel:'仅提名／语气与身份待核',eligibleForRecommendation:false,eligibleForConcern:false}}],recommendationPoints:[{text:'JOKE_SUPPORT_MUST_NOT_RENDER',reviewIds:[id]}],concerns:[{text:'AMBIGUOUS_CONCERN_MUST_NOT_RENDER',reviewIds:[id]}]};
 }
 const a=await app({data}), overview=a.get('#app').innerHTML;
 assert.match(overview,/课程印象、转述、弱提名与指导亲历分别标注/);
 for(let i=0;i<3;i++) {
  a.click('mentor',data.mentors[i].id);const html=a.get('#dialog-content').innerHTML;
  assert.match(html,/仅提名／语气与身份待核/);
  assert.doesNotMatch(html,/正面体验|体验有利弊|需重视的具体体验|JOKE_SUPPORT_MUST_NOT_RENDER|AMBIGUOUS_CONCERN_MUST_NOT_RENDER/);
 }
 a.route('#posts');const latest=a.get('#app').innerHTML;
 assert.doesNotMatch(latest,/本轮修正|本轮未新增|新增 <strong>1<\/strong> 份教师本人自述|补入 <strong>5<\/strong> 张真实截图/);
});


test('mentor keyword search finds visible confirmed comment text, quotes and attribution',async()=>{
  const data=reviewFixture(),mentor=data.mentors[1],review=mentor.studentReviews.reviews[0];
  review.text='论文会逐段批注，修改建议比较具体。';
  review.specifics=['组会先讲研究设计'];
  review.contextNotes={excerpt:{kind:'visible_quote',text:'这次作业反馈很细'},context:['同楼层说明是本科课程'],interpretation:{text:'不能从课程直接推导硕士培养'}};
  const a=await app({data});
  for(const query of ['逐段批注','组会先讲研究设计','这次作业反馈很细','课程评论者','同楼层说明是本科课程']) {
    a.search(query);
    const names=[...a.get('#mentor-results').innerHTML.matchAll(/<h3 class="mentor-name">([^<]+)/g)].map(match=>match[1]);
    assert.deepEqual(names,[mentor.name],query);
  }
  a.click('mentor',mentor.id);
  const detail=a.get('#dialog-content').innerHTML;
  assert.match(detail,/这次作业反馈很细/);
  assert.match(detail,/本科会计学/,'search does not change the actual degree boundary');
});

test('mentor comment search excludes unresolved aliases, unsupported points and superseded internals',async()=>{
  const data=reviewFixture(),review=data.mentors[1].studentReviews.reviews[0];
  review.contextInterpretationBeforeRound10={text:'SUPERSEDED_REVIEW_MARKER'};
  review.inputFiles=['INTERNAL_REVIEW_FILE_MARKER'];
  review.selectionSignal={direction:'avoid',intensity:'strong',excerpt:{kind:'visible_quote',text:'INVALID_SIGNAL_MARKER'},sourceIds:['TEST_BAD']};
  const a=await app({data});
  for(const query of ['HIDDEN_ALIAS_CLAIM','UNRESOLVED_PERSONAL_ALLEGATION','UNRESOLVED_GLOBAL_ALLEGATION','UNSUPPORTED_PRAISE','UNSUPPORTED_CONCERN','SUPERSEDED_REVIEW_MARKER','INTERNAL_REVIEW_FILE_MARKER','INVALID_SIGNAL_MARKER','LEGACY_DUPLICATE_FEEDBACK']) {
    a.search(query);
    assert.doesNotMatch(a.get('#mentor-results').innerHTML,/class="mentor-name"/,query);
  }
});

test('comment keyword search intersects review coverage, direction and saved filters',async()=>{
  const data=reviewFixture(),course=data.mentors[1],mpacc=data.mentors[2];
  course.studentReviews.reviews[0].text=mpacc.studentReviews.reviews[0].text='讨论研究设计中的具体问题';
  course.directions=['G2'];mpacc.directions=['G3'];
  const a=await app({data});a.search('研究设计中的具体问题');
  const names=()=>[...a.get('#mentor-results').innerHTML.matchAll(/<h3 class="mentor-name">([^<]+)/g)].map(match=>match[1]);
  assert.deepEqual(names(),[course.name,mpacc.name]);
  a.changeReview('mpacc_guidance');assert.deepEqual(names(),[mpacc.name]);
  a.click('direction','G2');assert.deepEqual(names(),[]);
  a.click('direction','G3');assert.deepEqual(names(),[mpacc.name]);
  a.click('saved-only');assert.deepEqual(names(),[]);
  a.click('save',mpacc.id);assert.deepEqual(names(),[mpacc.name]);
});
