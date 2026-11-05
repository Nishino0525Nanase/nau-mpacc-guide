import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sampleTracks = () => [
  {id:'sunrise', title:'走，一起去看日出吧', artist:'华晨宇', album:'希忘Hope', version:'录音室版', durationSeconds:275.4, fileNameAliases:['走 一起去看日出吧-华晨宇-希忘Hope.mp3'], listeningLinks:[{label:'QQ音乐搜索',url:'https://y.qq.com/n/ryqq/search?w=华晨宇%20走一起去看日出吧',type:'search'}]},
  {id:'forever', title:'For Forever', artist:'华晨宇', album:'H', version:'录音室版', durationSeconds:280.7, fileNameAliases:['For_Forever-华晨宇-H.mp3'], listeningLinks:[]},
  {id:'seek', title:'寻', artist:'华晨宇', album:'寻', version:'录音室版', durationSeconds:270.6, fileNameAliases:['寻-华晨宇-寻.mp3'], listeningLinks:[]},
  {id:'light', title:'向阳而生', artist:'华晨宇', album:'华晨宇日出演唱会特辑', version:'现场版', durationSeconds:702.6, fileNameAliases:['向阳而生-华晨宇-华晨宇日出演唱会特辑.mp3'], listeningLinks:[]}
];

function loadModule({AudioConstructor,URLConstructor=URL}={}) {
  let constructed = 0,networkCalls=0,persistentCalls=0;
  const globalHandlers = new Map();
  const AudioClass=AudioConstructor||class {constructor(){constructed++;throw new Error('Audio must be lazy');}};
  const window = {Audio:AudioClass,addEventListener:(name,fn)=>globalHandlers.set(name,fn),removeEventListener(){}};
  const document = {addEventListener(){},removeEventListener(){}};
  vm.runInNewContext(readFileSync(new URL('../dist/music.js',import.meta.url),'utf8'), {
    window,document,URL:URLConstructor,console,Audio:AudioClass,
    fetch(){networkCalls++;throw new Error('Music must not upload files or fetch media');},
    localStorage:{getItem(){persistentCalls++;throw new Error('No persisted audio');},setItem(){persistentCalls++;throw new Error('No persisted audio');}},
    setTimeout,clearTimeout,
  });
  return {api:window.NAUMusic,constructed:()=>constructed,sideEffects:()=>({networkCalls,persistentCalls}),globalHandlers};
}

class FakeAudio {
  constructor(){this.handlers=new Map();this.src='';this.paused=true;this.currentTime=0;this.duration=NaN;this.volume=1;this.muted=false;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;this.mode='resolve';this.pending=[];this.ended=false;}
  addEventListener(name,fn){if(!this.handlers.has(name))this.handlers.set(name,new Set());this.handlers.get(name).add(fn);}
  removeEventListener(name,fn){this.handlers.get(name)?.delete(fn);}
  emit(name){for(const fn of [...(this.handlers.get(name)||[])])fn({type:name,target:this});}
  load(){this.loadCalls++;this.duration=NaN;this.currentTime=0;this.ended=false;}
  removeAttribute(name){if(name==='src')this.src='';}
  pause(){this.pauseCalls++;this.paused=true;this.emit('pause');}
  play(){
    this.playCalls++;
    if(this.mode==='reject'){this.paused=true;return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));}
    if(this.mode==='pending')return new Promise((resolve,reject)=>this.pending.push({resolve:()=>{this.paused=false;this.emit('playing');resolve();},reject}));
    this.paused=false;this.ended=false;this.emit('playing');return Promise.resolve();
  }
}

function player(tracks=sampleTracks()) {
  const env=loadModule(),audio=new FakeAudio(),created=[],revoked=[];
  const engine=env.api.createPlayer({tracks,audio,
    createObjectURL:file=>{const url='blob:local-'+created.length;created.push({file,url});return url;},
    revokeObjectURL:url=>revoked.push(url)
  });
  return {...env,audio,engine,created,revoked};
}
const file=(name,type='audio/mpeg')=>({name,type,size:1024});
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const idOf=value=>value && typeof value==='object' ? value.id : value;

function mockMusicContainer() {
  const nodes=new Map(),handlers=new Map();
  return {
    innerHTML:'',
    querySelector(selector){
      if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',value:'',disabled:false,classList:{toggle(){}},setAttribute(){},click(){}});
      return nodes.get(selector);
    },
    querySelectorAll(){return [];},
    contains(){return true;},
    addEventListener(name,listener){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(listener);},
    removeEventListener(name,listener){handlers.get(name)?.delete(listener);},
    dispatch(name,event){for(const listener of [...(handlers.get(name)||[])])listener(event);},
    handlerCount(){return [...handlers.values()].reduce((count,listeners)=>count+listeners.size,0);},
  };
}

test('music boot and local import stay silent, in memory and ready for an explicit play gesture',async()=>{
  const env=loadModule();assert.equal(env.constructed(),0);
  assert.deepEqual(env.sideEffects(),{networkCalls:0,persistentCalls:0});
  const p=player();
  assert.equal(p.audio.playCalls,0);
  p.engine.importFiles([file('寻.wav','audio/wav')]);
  await flush();
  assert.equal(p.audio.playCalls,0,'file selection must not start playback');
  assert.equal(p.engine.getState().selectedId,'seek');
  assert.equal(p.engine.getState().loadedCount,1);
  assert.notEqual(p.engine.getState().status,'playing');
  assert.deepEqual(p.sideEffects(),{networkCalls:0,persistentCalls:0});
  await p.engine.play();
  assert.equal(p.audio.playCalls,1);
  assert.equal(p.engine.getState().status,'playing');
  assert.match(p.engine.getState().message,/寻/);
});

test('pagehide preserves a paused bfcache session, but releases files and listeners on permanent departure',async()=>{
  const audios=[],created=[],revoked=[];
  class MountAudio extends FakeAudio {constructor(){super();audios.push(this);}}
  class LocalURL extends URL {
    static createObjectURL(value){const url=`blob:session-${created.length}`;created.push({value,url});return url;}
    static revokeObjectURL(url){revoked.push(url);}
  }
  const env=loadModule({AudioConstructor:MountAudio,URLConstructor:LocalURL});
  const container=mockMusicContainer(),playlist={artist:'华晨宇',tracks:sampleTracks()};
  const clickPlay=()=>container.dispatch('click',{target:{closest:selector=>selector==='[data-music-action]'?{dataset:{musicAction:'toggle'}}:null}});
  env.api.mount(container,playlist);
  container.dispatch('change',{target:{id:'music-file-input',files:[file('寻.wav','audio/wav')],value:'local-file'}});
  clickPlay();await flush();
  const audio=audios[0];
  assert.equal(audio.paused,false);
  assert.equal(audio.playCalls,1);
  assert.equal(created.length,1);
  assert.equal(env.globalHandlers.has('beforeunload'),false,'beforeunload must not dispose a session that may enter bfcache');

  env.globalHandlers.get('pagehide')({persisted:true});
  assert.equal(audio.paused,true,'bfcache departure pauses immediately');
  assert.equal(env.api.isMounted(),true);
  assert.deepEqual(revoked,[],'bfcache must keep session Blob URLs usable');
  clickPlay();await flush();
  assert.equal(audio.paused,false,'the restored session can play the already selected local file');
  assert.equal(audio.playCalls,2);
  assert.equal(audios.length,1,'bfcache keeps the same Audio instance');

  env.globalHandlers.get('pagehide')({persisted:false});
  assert.equal(audio.paused,true);
  assert.equal(env.api.isMounted(),false);
  assert.deepEqual(revoked,[created[0].url]);
  assert.equal(audio.src,'','permanent departure releases the selected media source');
  assert.equal([...audio.handlers.values()].reduce((count,listeners)=>count+listeners.size,0),0,'disposed player leaves no audio listeners');
  assert.equal(container.handlerCount(),0,'destroyed view leaves no delegated event listeners');
  env.api.mount(container,playlist);
  assert.equal(audios.length,2,'after permanent cleanup a mount creates a fresh session');
  assert.equal(container.querySelector('#music-play-toggle').disabled,true,'a new session has no retained local files');
  assert.equal(audios[1].playCalls,0,'a new mount remains silent');
});

test('file matching handles the supplied punctuation and aliases while refusing guesses or ambiguity',()=>{
  const {api}=loadModule(),tracks=sampleTracks();
  assert.equal(api.normalizeFileName('For_Forever'),api.normalizeFileName('For Forever'));
  assert.equal(api.normalizeFileName('走，一起去看日出吧'),api.normalizeFileName('走 一起去看日出吧'));
  assert.equal(idOf(api.matchTrack('For_Forever-华晨宇-H.mp3',tracks)),'forever');
  assert.equal(idOf(api.matchTrack('走 一起去看日出吧-华晨宇-希忘Hope.mp3',tracks)),'sunrise');
  assert.equal(idOf(api.matchTrack('寻.wav',tracks)),'seek');
  assert.equal(api.matchTrack('我的寻翻唱版.mp3',tracks),null);
  assert.equal(api.matchTrack('陌生歌曲.mp3',tracks),null);
  assert.equal(api.matchTrack('寻.wav',[...tracks,{...tracks[2],id:'another-seek',fileNameAliases:['另一个版本.mp3']}]),null);
});

test('rejected playback never claims playing, and a stale play promise cannot restart a paused player',async()=>{
  const p=player();p.engine.importFiles([file('寻.wav','audio/wav')]);
  p.audio.mode='reject';await p.engine.play();
  assert.notEqual(p.engine.getState().status,'playing');
  assert.match(p.engine.getState().message,/播放|浏览器|点击|允许/);
  p.audio.mode='pending';const oldPlay=p.engine.play();
  p.engine.pause();p.audio.pending[0].resolve();await oldPlay;await flush();
  assert.equal(p.audio.paused,true);
  assert.notEqual(p.engine.getState().status,'playing');
});

test('an older failed play cannot overwrite a newer selection that is already playing',async()=>{
  const p=player();p.engine.importFiles([file('寻.wav','audio/wav'),file('For_Forever-华晨宇-H.mp3')]);
  p.audio.mode='pending';const oldPlay=p.engine.play('seek');
  p.audio.mode='resolve';await p.engine.play('forever');
  p.audio.pending[0].reject(Object.assign(new Error('old request'),{name:'AbortError'}));
  await oldPlay;await flush();
  assert.equal(p.engine.getState().selectedId,'forever');
  assert.equal(p.engine.getState().status,'playing');
  assert.equal(p.audio.paused,false);
});

test('seek uses real finite media duration, clamps values and follows media time events',()=>{
  const p=player();p.engine.importFiles([file('寻.wav','audio/wav')]);
  p.engine.seek(30);assert.equal(p.audio.currentTime,0,'playlist metadata is not a seekable media duration');
  p.audio.duration=8;p.audio.emit('loadedmetadata');
  p.engine.seek(99);assert.equal(p.audio.currentTime,8);
  p.engine.seek(-10);assert.equal(p.audio.currentTime,0);
  p.audio.currentTime=3.5;p.audio.emit('timeupdate');
  assert.equal(p.engine.getState().currentTime,3.5);
  assert.equal(p.engine.getState().duration,8);
  p.engine.setVolume(8);assert.equal(p.audio.volume,1);
  p.engine.setVolume(-5);assert.equal(p.audio.volume,0);
  const priorMute=p.audio.muted;p.engine.toggleMute();assert.equal(p.audio.muted,!priorMute);
});

test('next and automatic continuation use only local matches, and stop at the last loaded song',async()=>{
  const p=player();p.engine.importFiles([file('走 一起去看日出吧-华晨宇-希忘Hope.mp3'),file('寻.wav','audio/wav')]);
  await p.engine.play('sunrise');
  p.audio.paused=true;p.audio.ended=true;p.audio.emit('ended');await flush();
  assert.equal(p.engine.getState().selectedId,'seek','the unloaded middle song must be skipped');
  assert.equal(p.engine.getState().status,'playing');
  const played=p.audio.playCalls;
  p.audio.paused=true;p.audio.ended=true;p.audio.emit('ended');await flush();
  assert.equal(p.audio.playCalls,played,'end of local playlist must not create an endless playback loop');
  assert.notEqual(p.engine.getState().status,'playing');
  p.engine.next(-1);await flush();assert.equal(p.engine.getState().selectedId,'sunrise');
});

test('replacement and removal release object URLs, keep unrelated files, and never autoplay new imports',async()=>{
  const p=player();p.engine.importFiles([file('寻.wav','audio/wav'),file('For_Forever-华晨宇-H.mp3')]);
  const firstUrl=p.created[0].url;
  p.engine.importFiles([file('寻-华晨宇-寻.mp3')]);await flush();
  assert.equal(p.engine.getState().loadedCount,2);
  assert(p.revoked.includes(firstUrl));assert.equal(p.audio.playCalls,0);
  p.engine.importFiles([file('不是歌单的歌.mp3'),file('寻.exe','application/octet-stream')]);
  assert.equal(p.engine.getState().loadedCount,2,'unmatched or invalid input must not erase valid local matches');
  p.engine.clearFiles();
  assert.equal(p.engine.getState().loadedCount,0);
  assert.equal(new Set(p.revoked).size,p.created.length);
  p.engine.dispose();p.engine.dispose();
  assert.equal(p.audio.paused,true);
  const late=player();late.engine.importFiles([file('寻.wav','audio/wav')]);late.audio.mode='pending';
  const promise=late.engine.play();late.engine.dispose();late.audio.pending[0].resolve();await promise;
  assert.equal(late.audio.paused,true,'a late promise cannot restart sound after disposal');
  assert.equal(late.engine.getState().loadedCount,0);
});

test('music links are official HTTPS routes and generated markup treats supplied labels as text',()=>{
  const {api}=loadModule();
  for(const good of ['https://y.qq.com/n/ryqq/search?w=华晨宇','https://music.163.com/#/search/m/?s=华晨宇'])assert.equal(api.safeListeningUrl(good),new URL(good).href);
  for(const bad of ['javascript:alert(1)','data:text/html,bad','blob:local-one','file:///secret.mp3','/relative','http://y.qq.com/','https://y.qq.com.evil.example/','https://evil@y.qq.com/','https://evil.example/'])assert.equal(api.safeListeningUrl(bad),'');
  const tracks=sampleTracks();tracks[0].title='<img src=x onerror=alert(1)>';
  tracks[0].listeningLinks.push({label:'<script>bad</script>',url:'javascript:alert(1)',type:'direct'});
  const html=api.renderMarkup({title:'<script>oops</script>',ownerLabel:'<svg onload=bad()>',artist:'华晨宇',tracks});
  assert.match(html,/&lt;img/,'supplied title should be rendered as escaped text, not silently ignored');
  assert.doesNotMatch(html,/<script|<img|<svg onload|href="javascript:|href="data:/i);
  assert.doesNotMatch(html,/<audio[^>]*autoplay/i);
});
