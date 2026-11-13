import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8'));

async function app(hash) {
  const elements=new Map(),handlers=new Map(),windowHandlers=new Map(),scrolls=[];
  let document;
  class Element {
    constructor(selector){this.selector=selector;this.dataset={};this.style={};this.attributes={};this.isConnected=true;this.open=false;this.innerHTML='';this.value='';this.textContent='';this.classList={add(){},remove(){},contains(){return false;}};}
    querySelector(selector){return get(selector);}
    querySelectorAll(){return [];}
    addEventListener(name,fn){handlers.set(this.selector+':'+name,fn);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getBoundingClientRect(){return {height:90,left:0,right:800,top:0,bottom:700};}
    focus(){document.activeElement=this;}
    scrollIntoView(){scrolls.push(this.selector);}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element(selector));return elements.get(selector);};
  document={querySelector:get,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},body:{style:{}},activeElement:get('initial'),title:'',addEventListener:(name,fn)=>handlers.set(name,fn)};
  const location={href:'https://example.github.io/nau-mpacc-guide/'+hash,hash};
  const window={location,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>windowHandlers.set(name,fn),dispatchEvent(){},scrollTo(){},scrollY:0};
  vm.runInNewContext(script,{document,window,location,navigator:{},URL,console,CSS:{escape:x=>x},CustomEvent:class{},Event:class{},fetch:async()=>({ok:true,json:async()=>structuredClone(dataset),headers:{get:()=>null}}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){}});
  for(let i=0;i<12;i++)await Promise.resolve();
  return {get,location,document,scrolls,skip(){
    let prevented=false;
    const link={classList:{contains:name=>name==='skip-link'},closest:()=>null,getAttribute:name=>name==='href'?'#main':null};
    handlers.get('click')({target:{closest:selector=>selector==='a[href]'?link:null},preventDefault(){prevented=true;}});
    if(!prevented){location.hash='#main';windowHandlers.get('hashchange')();}
    return prevented;
  }};
}

for(const [route,heading] of [['#posts','建议的背后，是这些原始来源'],['#life/life-09','南审生活指南']]) {
  test('skip to content preserves current guide route '+route,async()=>{
    const a=await app(route);
    assert.match(a.get('#app').innerHTML,new RegExp(heading));
    const content=a.get('#app').innerHTML;
    assert.equal(a.skip(),true,'skip link must suppress hash-router navigation');
    assert.equal(a.location.hash,route);
    assert.equal(a.get('#app').innerHTML,content);
    assert.equal(a.document.activeElement,a.get('#main'));
    assert.equal(a.scrolls.at(-1),'#main');
  });
}
