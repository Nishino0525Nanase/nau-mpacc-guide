import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));

async function boot(data){
  const elements=new Map(),handlers=new Map();
  let document,serial=0;
  class Element {
    constructor(selector){this.selector=selector;this.innerHTML='';this.textContent='';this.value='';this.dataset={};this.attributes={};this.style={};this.open=false;this.isConnected=true;this.classList={add(){},remove(){},contains(){return false;},toggle(){}};}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,fn){handlers.set(this.selector+':'+name,fn);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getAttribute(name){return this.attributes[name]??null;}
    getBoundingClientRect(){return {height:70,left:0,right:900,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;handlers.get(this.selector+':close')?.({target:this});}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('start'),addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/',hash:''};
  const window={location,matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){},scrollY:0,scrollTo(){}};
  vm.runInNewContext(script,{document,window,location,URL,CSS:{escape:x=>x},console,CustomEvent:class{},Event:class{},navigator:{},fetch:async()=>({ok:true,json:async()=>structuredClone(data),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  const click=(action,extra={})=>{
    const trigger=new Element('trigger-'+(++serial));trigger.dataset={action,...extra};document.activeElement=trigger;
    handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?trigger:null},preventDefault(){}});
    return trigger;
  };
  return {get,document,handlers,click,detail(id='mentor-01'){click('mentor',{id});return get('#dialog-content').innerHTML;},escapeImage(){
    const target=get('#review-image-dialog');let prevented=false;
    const event={target,key:'Escape',preventDefault(){prevented=true;},stopPropagation(){}};
    handlers.get(target.selector+':keydown')?.(event);
    handlers.get('keydown')?.(event);
    if(target.open){handlers.get(target.selector+':cancel')?.(event);if(!prevented&&target.open)target.close();}
  }};
}

const emptyDossier=()=>({coverageStatus:'not_found',coverageLabel:'暂无可归属学生评价',summary:'',reviews:[],recommendationPoints:[],concerns:[],verificationQuestions:[],gaps:[]});
const sourceUrl='https://www.xiaohongshu.com/explore/67ecb72b000000001e0042af';
function shot(src,extra={}){return {src,caption:'本条评论截图',scope:'只显示这条评论中的可见文字',width:400,height:1000,sourceUrl,...extra};}
function fixture(){
  const data=structuredClone(dataset);delete data.mentorAliases;data.ambiguousMentorAliases=[];
  data.studentOutcomes={records:[],statistics:[],achievements:[]};data.socialPosts=[];
  for(const mentor of data.mentors)mentor.studentReviews=emptyDossier();
  data.sourceRegistry.X01={title:'评价原帖',platform:'小红书',url:sourceUrl,canonicalUrl:sourceUrl};
  return data;
}
function setReview(data,index=0,overrides={}){
  const review={id:'image-review-'+index,text:'REVIEW_TEXT_'+index,narrator:'原帖评论者',degree:'未说明',relationship:'未说明',experienceType:'general',firsthand:null,sourceIds:['X01'],sourceUrl,attribution:{status:'confirmed',reason:'本条明确对应该位老师'},contextAssessment:{eligibleForRecommendation:false,eligibleForConcern:false},...overrides};
  data.mentors[index].studentReviews={...emptyDossier(),coverageStatus:'weak_mentions',reviews:[review]};return review;
}
function addPost(data,screenshots){data.socialPosts.push({id:'67ecb72b000000001e0042af',title:'真实原帖概览',url:sourceUrl,canonicalUrl:sourceUrl,sourceIds:['X01'],category:'导师评价线索',platform:'小红书',topic:'导师',summary:'POST_SUMMARY',screenshots});}
const imgCount=(html,path)=>[...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].filter(match=>match[1]===path).length;

test('an evaluation keeps its own deduplicated screenshots beside the text without repeating large copies',async()=>{
  const data=fixture();setReview(data,0,{screenshots:[shot('./evidence/xhs/own-one.jpg'),shot('./evidence/xhs/own-one.jpg'),shot('./evidence/xhs/own-two.jpg')]});
  addPost(data,[shot('./evidence/xhs/x01-post-top.jpg',{caption:'原帖正文与首段公开评论',mentorId:null,reviewId:null})]);
  const a=await boot(data),html=a.detail();
  assert.match(html,/class="review-entry/);assert.match(html,/class="student-review-record/);
  assert.match(html,/data-review-thumb/);assert.match(html,/data-action="review-image"/);
  assert.equal(imgCount(html,'./evidence/xhs/own-one.jpg'),1,'the same own image is not shown again as an expanded large image');
  assert(imgCount(html,'./evidence/xhs/own-two.jpg')<=1);
  assert.doesNotMatch(html,/src="\.\/evidence\/xhs\/x01-post-top\.jpg"/,'own comment images take priority over a general post overview');
});

test('a missing comment image uses only the real post overview, and missing evidence leaves no image gap',async()=>{
  const data=fixture();setReview(data);
  addPost(data,[
    shot('./evidence/xhs/someone-else.jpg',{caption:'另一位导师评论',mentorId:'mentor-02',reviewId:'different-review'}),
    shot('./evidence/xhs/x01-post-top.jpg',{caption:'原帖正文与首段公开评论',mentorId:null,reviewId:null})
  ]);
  const a=await boot(data),html=a.detail();
  assert.match(html,/src="\.\/evidence\/xhs\/x01-post-top\.jpg"/);
  assert.match(html,/原帖概览[，,、\s]*非本条评论截图/);
  assert.doesNotMatch(html,/src="\.\/evidence\/xhs\/someone-else\.jpg"/);
  const empty=fixture();setReview(empty);addPost(empty,[shot('./evidence/xhs/someone-else.jpg',{caption:'另一位导师评论',mentorId:'mentor-02',reviewId:'different-review'})]);
  const b=await boot(empty),without=b.detail();
  assert.doesNotMatch(without,/data-review-thumb|data-action="review-image"/);
  assert.match(without,/REVIEW_TEXT_0/);
});

test('image paths, captions and viewer requests cannot inject content or select another mentor record',async()=>{
  const data=fixture();setReview(data,0,{screenshots:[
    ...['./evidence/xhs/../secret.jpg','./evidence/xhs/a.jpg?token=secret','./evidence/xhs/a%2fb.jpg','./evidence/not-allowed/a.jpg','https://evil.example/private.jpg','javascript:alert(1)','data:image/png;base64,secret'].map(src=>shot(src)),
    shot('./evidence/xhs/safe.jpg',{caption:'<img src=x onerror=alert(1)>',alt:'<script>UNSAFE_ALT</script>',sourceUrl:'javascript:alert(2)'})
  ]});
  setReview(data,1,{id:'another-mentor-review',screenshots:[shot('./evidence/xhs/another-mentor.jpg')]});
  const a=await boot(data),html=a.detail();
  assert.match(html,/src="\.\/evidence\/xhs\/safe\.jpg"/);
  assert.doesNotMatch(html,/src="(?:https:|javascript:|data:)|href="javascript:|<img src=x|<script>|secret\.jpg|token=secret|a%2fb|not-allowed/);
  a.click('review-image',{mentorId:'mentor-01',reviewId:'another-mentor-review',index:'0'});
  assert.equal(a.get('#review-image-dialog').open,false,'an image request stays within its named mentor and review');
  assert.doesNotMatch(a.get('#review-image-content').innerHTML,/another-mentor\.jpg/);
});

test('the independent viewer navigates, changes scale and restores focus while preserving the mentor dialog',async()=>{
  const data=fixture();setReview(data,0,{screenshots:[shot('./evidence/xhs/own-one.jpg'),shot('./evidence/xhs/own-one.jpg'),shot('./evidence/xhs/own-two.jpg')]});
  const a=await boot(data),mentorHtml=a.detail(),mentorDialog=a.get('#detail-dialog');assert.equal(mentorDialog.open,true);
  const trigger=a.click('review-image',{mentorId:'mentor-01',reviewId:'image-review-0',index:'0'});
  const viewer=a.get('#review-image-dialog'),content=a.get('#review-image-content');
  assert.equal(viewer.open,true);assert.match(content.innerHTML,/own-one\.jpg/);
  assert.equal(mentorDialog.open,true);assert.equal(a.get('#dialog-content').innerHTML,mentorHtml);
  a.click('review-image-next');assert.match(content.innerHTML,/own-two\.jpg/);
  a.click('review-image-prev');assert.match(content.innerHTML,/own-one\.jpg/);
  a.click('review-image-mode',{mode:'original'});
  assert.equal(content.dataset.mode||content.getAttribute('data-mode'),'original');
  a.click('review-image-mode',{mode:'fit'});
  assert.equal(content.dataset.mode||content.getAttribute('data-mode'),'fit');
  a.click('review-image-close');assert.equal(viewer.open,false);
  assert.equal(a.document.activeElement,trigger,'close returns focus to the original thumbnail control');
  assert.equal(mentorDialog.open,true);assert.equal(a.get('#dialog-content').innerHTML,mentorHtml);
  const secondTrigger=a.click('review-image',{mentorId:'mentor-01',reviewId:'image-review-0',index:'1'});assert.equal(viewer.open,true);
  a.escapeImage();assert.equal(viewer.open,false);assert.equal(a.document.activeElement,secondTrigger);
  assert.equal(mentorDialog.open,true);assert.equal(a.get('#dialog-content').innerHTML,mentorHtml);
});

test('post images open in the same-page gallery, keep comment context, and reject images from another post',async()=>{
  const data=fixture();
  addPost(data,[shot('./evidence/content-repair-20261114b/table-01.webp'),shot('./evidence/content-repair-20261114b/table-02.webp')]);
  const post=data.socialPosts[0];
  post.comments=[{author:'评论者',text:'与本帖相关的评论',screenshots:[shot('./evidence/xhs/own-comment.jpg')]}];
  const a=await boot(data);a.click('post',{id:post.id});
  const html=a.get('#dialog-content').innerHTML;
  assert.match(html,/data-action="post-image"/);
  const trigger=a.click('post-image',{id:post.id,src:'./evidence/content-repair-20261114b/table-01.webp'});
  assert.equal(a.get('#review-image-dialog').open,true);
  assert.match(a.get('#review-image-content').innerHTML,/table-01.webp/);
  a.click('review-image-next');assert.match(a.get('#review-image-content').innerHTML,/table-02.webp/);
  a.click('review-image-prev');a.click('review-image-prev');
  assert.match(a.get('#review-image-content').innerHTML,/own-comment.jpg/);
  a.escapeImage();assert.equal(a.get('#review-image-dialog').open,false);
  assert.equal(a.document.activeElement,trigger);
  assert.equal(a.get('#detail-dialog').open,true);
  assert.equal(a.get('#dialog-content').innerHTML,html);
  a.click('post-image',{id:post.id,src:'./evidence/xhs/another-post.jpg'});
  assert.equal(a.get('#review-image-dialog').open,false);
});
