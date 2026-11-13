import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../dist/', import.meta.url);
const base = 'https://example.github.io/nau-mpacc-guide/';
const sample = {mentors:[{name:'导师'}],lifeChapters:[{title:'生活'}],socialPosts:[{title:'摘记'}],musicPlaylist:{tracks:[{id:'sample-track',audioUrl:'./media/music/sample-track.mp3'}]}};
const json = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});

function worker() {
  const handlers = new Map(), stores = new Map(), calls = [];
  let fetcher = async () => json(sample);
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(key) { return store.get(String(key))?.clone(); },
        async put(key, value) { store.set(String(key), value.clone()); },
        async addAll(keys) {
          for (const key of keys) {
            const file = key.slice(base.length) || 'index.html';
            assert(existsSync(new URL(file, root)), `Precache file is missing: ${file}`);
            store.set(key, new Response('shell'));
          }
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const self = {location:{href:base+'sw.js'},addEventListener:(name, fn) => handlers.set(name,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}};
  vm.runInNewContext(readFileSync(new URL('sw.js',root),'utf8'), {
    self,caches,URL,Response,Headers,AbortController,setTimeout,clearTimeout,
    fetch:async(request, options) => { calls.push(String(request.url || request)); return fetcher(request,options); }
  });
  return {
    stores,caches,calls,setFetch(fn) { fetcher=fn; },
    async lifecycle(name) { let promise; handlers.get(name)({waitUntil:p=>promise=p}); await promise; },
    async request(path, method='GET') {
      let response;
      handlers.get('fetch')({request:{url:new URL(path,base).href,method},respondWith:p=>response=p});
      return response ? await response : null;
    },
    async offlineReady() {
      let promise, message;
      handlers.get('message')({data:{type:'NAU_CHECK_OFFLINE'},source:{postMessage:value=>message=value},waitUntil:p=>promise=p});
      await promise;
      return message;
    }
  };
}

test('manifest stays within a GitHub Pages subdirectory and has real PNG icons', () => {
  const manifest=JSON.parse(readFileSync(new URL('manifest.webmanifest',root),'utf8'));
  assert.equal(new URL(manifest.scope,base+'manifest.webmanifest').href,base);
  assert.equal(new URL(manifest.start_url,base+'manifest.webmanifest').href,base);
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.id,undefined,'use start_url as app identity without a root-relative id collision');
  for (const size of [192,512]) {
    const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}`);
    assert(icon);
    const png=readFileSync(new URL(icon.src,root));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
});

test('SW only intercepts the exact local GET whitelist, including owner exclusion navigation', async () => {
  const sw=worker();
  await sw.lifecycle('install');
  for (const path of ['', 'index.html?exclude_self=1', 'app.js?v=edition1','app.js?v=downloads1','style.css?v=downloads1','life-images.js?v=campus1','music.js?v=edition1','data/site-data.json?v=edition1']) assert(await sw.request(path),path);
  const count=sw.calls.length;
  for (const path of ['analytics.js','analytics-config.js','admin/','admin/index.html','video/','?admin=1','?unexpected=1','downloads/test.apk','music/private-song.mp3','media/music/sample-track.mp3','media/music/sample-track.m4a','../another-project/','https://us.i.posthog.com/i/v0/e/','https://example.com/app.js']) assert.equal(await sw.request(path),null,path);
  assert.equal(await sw.request('data/site-data.json','POST'),null);
  assert.equal(sw.calls.length,count,'bypassed requests must not reach worker fetch');
});

test('JSON is fresh online and falls back to valid cached data for network, HTTP and format failures', async () => {
  const sw=worker();
  await sw.lifecycle('install');
  const newer={...sample,socialPosts:[{title:'新摘记'},{title:'另篇'}]};
  sw.setFetch(async()=>json(newer));
  assert.equal((await (await sw.request('data/site-data.json?v=edition1')).json()).socialPosts.length,2);
  for (const fail of [async()=>{throw new Error('offline');},async()=>new Response('failure',{status:500}),async()=>json({wrong:true}),async()=>json({mentors:[],lifeChapters:[],socialPosts:[]}),async()=>json({...sample,musicPlaylist:{tracks:[{id:'sample-track'}]}}),async()=>new Response('not json')]) {
    sw.setFetch(fail);
    const response=await sw.request('data/site-data.json?v=edition1');
    assert.equal(response.headers.get('X-Guide-Offline'),'cached');
    assert.equal((await response.json()).socialPosts.length,2);
  }
  assert.equal((await sw.offlineReady()).type,'NAU_OFFLINE_READY');
  const dataKeys=[...sw.stores.values()].flatMap(store=>[...store.keys()]).filter(key=>key.includes('site-data'));
  assert.deepEqual(dataKeys,[base+'data/site-data.json']);
});

test('missing offline data is explicit, exclusion navigation keeps its shell and old caches are scoped', async () => {
  const sw=worker();
  sw.setFetch(async()=>{throw new Error('offline');});
  const missing=await sw.request('data/site-data.json?v=edition1');
  assert.equal(missing.status,503);
  assert.equal(missing.headers.get('X-Guide-Offline'),'missing');
  await sw.lifecycle('install');
  const page=await sw.request('?exclude_self=1');
  assert.equal(await page.text(),'shell');
  sw.stores.set('nau-guide:/nau-mpacc-guide/:old',new Map());
  sw.stores.set('nau-guide:/other-project/:old',new Map());
  sw.stores.set('unrelated-cache',new Map());
  await sw.lifecycle('activate');
  assert.equal(sw.stores.has('nau-guide:/nau-mpacc-guide/:old'),false);
  assert.equal(sw.stores.has('nau-guide:/other-project/:old'),true);
  assert.equal(sw.stores.has('unrelated-cache'),true);
});

function installer({standalone=false,ios=false,href=base+'#downloads',storageFails=false}={}) {
  const events=new Map(), docEvents=new Map(), storage=new Map(), registered=[];
  const element=()=>({hidden:false,disabled:false,textContent:'',innerHTML:'',classList:{add(){}},querySelector:()=>({focus(){}})});
  const ids=new Map(['app-edition-cards','install-app','install-status','edition-connection','offline-status','toast','install-steps'].map(id=>['#'+id,element()]));
  const media={matches:standalone,addEventListener(){}};
  const win={matchMedia:()=>media,addEventListener:(name,fn)=>events.set(name,fn),isSecureContext:true};
  const doc={querySelector:selector=>ids.get(selector),addEventListener:(name,fn)=>docEvents.set(name,fn),currentScript:{src:base+'install.js?v=edition1'}};
  const serviceWorker={addEventListener(){},ready:Promise.resolve(),register:(url,options)=>{registered.push([String(url),options]);return Promise.resolve({active:{postMessage(){}}});}};
  const localStorage={setItem:(key,value)=>{if(storageFails)throw new Error('storage unavailable');storage.set(key,value);},getItem:key=>storage.get(key),removeItem:key=>storage.delete(key)};
  const location=new URL(href);
  vm.runInNewContext(readFileSync(new URL('install.js',root),'utf8'), {window:win,document:doc,navigator:{standalone:ios,onLine:true,serviceWorker},location,localStorage,URL,console});
  return {win,ids,storage,registered,events,location,
    mount(meta) {win.NAUEdition.mount(meta);},
    click() {return docEvents.get('click')({target:{closest:()=>ids.get('#install-app')}});},
    event(name,event={}) {events.get(name)?.(event);}
  };
}

test('no prompt shows real manual steps; standalone and iOS modes are recognized', async () => {
  const env=installer();
  env.mount({web:{version:'1.0.0'}});
  assert.equal(env.ids.get('#install-app').textContent,'查看安装方法');
  await env.click();
  assert.equal(env.ids.get('#install-steps').open,true);
  assert.match(env.ids.get('#app-edition-cards').innerHTML,/Safari/);
  assert.match(env.ids.get('#app-edition-cards').innerHTML,/Chrome/);
  assert.equal(env.registered[0][0],base+'sw.js');
  assert.equal(env.registered[0][1].scope,'/nau-mpacc-guide/');
  for(const settings of [{standalone:true},{ios:true}]) {
    const env=installer(settings);env.mount();
    assert.equal(env.ids.get('#install-app').hidden,true);
    assert.match(env.ids.get('#install-status').textContent,/独立应用窗口/);
  }
});

test('accepting the browser prompt does not falsely claim installed; cancel and appinstalled work', async () => {
  for(const outcome of ['accepted','dismissed']) {
    const env=installer();env.mount();let prompted=0,prevented=0;
    env.event('beforeinstallprompt',{preventDefault(){prevented++;},async prompt(){prompted++;},userChoice:Promise.resolve({outcome})});
    assert.equal(env.ids.get('#install-app').textContent,'安装到此设备');
    await env.click();
    assert.equal(prevented,1);assert.equal(prompted,1);
    assert.equal(env.ids.get('#install-app').hidden,false);
    assert.match(env.ids.get('#install-status').textContent,outcome==='accepted'?/已提交安装请求/:/已取消安装/);
    env.event('appinstalled');
    assert.equal(env.ids.get('#install-app').hidden,true);
    assert.match(env.ids.get('#install-status').textContent,/已安装，可从桌面/);
  }
});

test('APK links require available=true and a real HTTP(S) APK path', () => {
  const env=installer();
  for(const android of [{available:false,url:'./downloads/app.apk'},{available:true,url:''},{available:true,url:'javascript:alert(1)'},{available:true,url:'#downloads'},{available:true,url:'not-a-url'}]) {
    env.mount({android});assert.doesNotMatch(env.ids.get('#app-edition-cards').innerHTML,/data-download="android-app"/);
  }
  env.mount({android:{available:true,url:'./downloads/app.apk',version:'1.0.0',bytes:1048576,sha256:'a'.repeat(64)}});
  assert.match(env.ids.get('#app-edition-cards').innerHTML,/data-download="android-app"/);
  assert.match(env.ids.get('#app-edition-cards').innerHTML,/1.0 MB/);
  assert.match(env.ids.get('#app-edition-cards').innerHTML,/a{64}/);
});

test('owner exclusion works with analytics unavailable and preserves the parameter on storage failure', () => {
  const href=base+'?exclude_self=1#downloads';
  const env=installer({href});
  assert.equal(env.storage.get('nau_analytics_opt_out'),'1');
  assert.match(env.ids.get('#toast').textContent,/已排除当前浏览器/);
  const failed=installer({href,storageFails:true});
  assert.match(failed.ids.get('#toast').textContent,/未能保存/);
  assert.equal(failed.location.href,href);
});


test('bundled Android edition shows its current version without a second installation prompt', async () => {
  const env=installer({href:'https://appassets.androidplatform.net/guide/index.html'});
  env.mount({android:{available:false,version:'1.0.1',changes:['返回键先关闭资料弹窗']}});
  let html=env.ids.get('#app-edition-cards').innerHTML;
  assert.match(html,/正在使用 Android 版/);
  assert.match(html,/版本 1\.0\.1/);
  assert.match(html,/Word \/ Excel/);
  assert.match(html,/返回键先关闭资料弹窗/);
  assert.doesNotMatch(html,/准备中|暂未提供下载|网页应用|id="install-app"|id="install-steps"|data-download="android-app"/);
  assert.match(env.ids.get('#edition-connection').textContent,/内置资料/);
  assert.equal(env.ids.get('#install-app').hidden,true);
  assert.equal(env.registered.length,0,'native assets do not attempt a browser service worker');
  let prompted=0;
  env.event('beforeinstallprompt',{preventDefault(){},async prompt(){prompted++;},userChoice:Promise.resolve({outcome:'accepted'})});
  await env.click();
  assert.equal(prompted,0);
  env.mount({android:{available:true,url:'./downloads/app.apk',version:'1.0.1'}});
  html=env.ids.get('#app-edition-cards').innerHTML;
  assert.doesNotMatch(html,/data-download="android-app"/,'an installed native reader does not offer to install itself');
});

test('release changes are optional, limited to text, and escaped beside a verified download', () => {
  const env=installer();
  env.mount({android:{available:true,url:'./downloads/app.apk',version:'1.0.1',label:'旧按钮名',changes:['返回 <资料> 后继续阅读',null,{html:'<script>bad()</script>'},'']}});
  const html=env.ids.get('#app-edition-cards').innerHTML;
  assert.match(html,/下载 Android 安装包/);
  assert.match(html,/返回 &lt;资料&gt; 后继续阅读/);
  assert.doesNotMatch(html,/<script>|\[object Object\]|旧按钮名/);
  assert.match(html,/data-download="android-app"/);
  env.mount({android:{available:false,changes:'不是清单'}});
  assert.doesNotMatch(env.ids.get('#app-edition-cards').innerHTML,/edition-changes/);
});


test('only a native asset URL can supply the running package version, with safe fallback', () => {
  const native=installer({href:'https://appassets.androidplatform.net/guide/index.html?app_version=1.0.1'});
  native.mount({android:{version:'1.0.0'}});
  assert.match(native.ids.get('#app-edition-cards').innerHTML,/版本 1\.0\.1/);
  assert.doesNotMatch(native.ids.get('#app-edition-cards').innerHTML,/版本 1\.0\.0/);
  for (const invalid of ['1.0','01.0.1','1.0.1<script>','https://example.com/1.0.1']) {
    const env=installer({href:'https://appassets.androidplatform.net/guide/index.html?app_version='+encodeURIComponent(invalid)});
    env.mount({android:{version:'1.0.0'},web:{version:'0.9.0'}});
    assert.match(env.ids.get('#app-edition-cards').innerHTML,/版本 1\.0\.0/);
    assert.doesNotMatch(env.ids.get('#app-edition-cards').innerHTML,/<script>/);
  }
  const nativeFallback=installer({href:'https://appassets.androidplatform.net/guide/index.html?app_version=invalid'});
  nativeFallback.mount({web:{version:'1.0.1'}});
  assert.match(nativeFallback.ids.get('#app-edition-cards').innerHTML,/版本 1\.0\.1/);
  const web=installer({href:base+'?app_version=9.9.9#downloads'});
  web.mount({web:{version:'1.0.1'},android:{available:true,url:'./downloads/app.apk',version:'1.0.0'}});
  const html=web.ids.get('#app-edition-cards').innerHTML;
  assert.match(html,/版本 1\.0\.0/);
  assert.doesNotMatch(html,/9\.9\.9|正在使用 Android 版/);
});


test('a new native package does not show the previous public APK changelog as its own', () => {
  const env=installer({href:'https://appassets.androidplatform.net/guide/index.html?app_version=1.0.2'});
  env.mount({android:{version:'1.0.1',changes:['旧版本说明']},web:{version:'1.0.2'}});
  const html=env.ids.get('#app-edition-cards').innerHTML;
  assert.match(html,/版本 1\.0\.2/);
  assert.doesNotMatch(html,/旧版本说明|edition-changes/);
  env.mount({android:{version:'1.0.2',changes:['当前版本说明']}});
  assert.match(env.ids.get('#app-edition-cards').innerHTML,/当前版本说明/);
});
