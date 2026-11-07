import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
const code = await fs.readFile(new URL('../dist/analytics.js', import.meta.url), 'utf8');
const site = 'https://nishino0525nanase.github.io/nau-mpacc-guide/';
function boot(options = {}) {
  const map = options.map || new Map();
  const writes = [], requests = [], notices = [];
  const toast = { textContent: '', classList: { add: value => notices.push(value) } };
  const window = {
    location: new URL(options.url || site),
    navigator: options.navigator || {},
    document: { referrer: options.referrer || '', getElementById: () => toast },
    localStorage: {
      getItem: key => { if (options.blocked) throw Error('blocked'); return map.get(key) ?? null; },
      setItem: (key, value) => { if (options.blocked || options.writeFails) throw Error('blocked'); writes.push(key); map.set(key, value); },
      removeItem: key => { if (options.blocked) throw Error('blocked'); map.delete(key); }
    },
    crypto: { randomUUID },
    fetch: (url, init) => { requests.push({url, init, payload: JSON.parse(init.body)}); return options.reject ? Promise.reject(Error('offline')) : Promise.resolve({ok: true}); },
    NAU_ANALYTICS: { token: 'phc_public_test_capture_token', apiHost: 'https://us.i.posthog.com', allowedHost: 'nishino0525nanase.github.io', pathPrefix: '/nau-mpacc-guide/', ...(options.config || {}) }
  };
  window.history = { replaceState: (_a, _b, url) => { window.location = new URL(url); } };
  const context = vm.createContext({window, URL});
  vm.runInContext(code, context);
  return {window, map, writes, requests, toast, notices, reload: () => vm.runInContext(code, context)};
}
test('one anonymous pageview without persistent identity, private URL or cookies', () => {
  const env = boot({url: site + '?email=private@example.com#private', referrer:'https://search.example/?q=private'});
  assert.equal(env.requests.length, 1);
  const {payload, init} = env.requests[0];
  assert.equal(payload.event, '$pageview');
  assert.match(payload.distinct_id, /^pv_[a-f0-9-]{36}$/);
  assert.equal(payload.properties.$current_url, site);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$ip, null);
  assert.equal(payload.properties.$geoip_disable, true);
  assert.equal(payload.properties.analytics_mode, 'aggregate_v3_devices');
  assert.equal(payload.properties.device_type, '其他');
  assert.equal(payload.properties.device_os, '未知');
  assert.equal(payload.properties.device_browser, '未知');
  assert.equal(payload.properties.referrer_host, 'search.example');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.ok(!init.body.includes('private'));
  assert.deepEqual(env.writes, []);
  assert.equal(env.map.size, 0);
});
test('each full load uses a fresh event ID; duplicate script and hash changes add no PV', () => {
  const first = boot(); first.window.location.hash = '#life'; first.reload();
  const second = boot({map: first.map});
  assert.equal(first.requests.length, 1);
  assert.notEqual(first.requests[0].payload.distinct_id, second.requests[0].payload.distinct_id);
});
for (const [label, navigator, expected] of [
  ['reduced Android Chrome', {userAgent:'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36', userAgentData:{mobile:true,platform:'Android'}}, ['手机','Android','Chrome']],
  ['explicit Android tablet', {userAgent:'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36', userAgentData:{mobile:false,platform:'Android'}}, ['平板','Android','Chrome']],
  ['ambiguous Android desktop mode', {userAgent:'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36', userAgentData:{mobile:false,platform:'Android'}}, ['其他','Android','Chrome']],
  ['iPad desktop mode', {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform:'MacIntel',maxTouchPoints:5}, ['平板','iPadOS','Safari']],
  ['Mac without touch', {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform:'MacIntel',maxTouchPoints:0}, ['电脑','macOS','Safari']],
  ['iPhone Safari', {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}, ['手机','iOS','Safari']],
  ['iPhone Chrome', {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/156.0 Mobile/15E148 Safari/604.1'}, ['手机','iOS','Chrome']],
  ['touchscreen Windows Edge', {userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',platform:'Win32',maxTouchPoints:10}, ['电脑','Windows','Edge']],
  ['Linux Firefox', {userAgent:'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',platform:'Linux x86_64'}, ['电脑','Linux','Firefox']],
  ['Chrome OS', {userAgent:'Mozilla/5.0 (X11; CrOS x86_64 1.0) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36'}, ['电脑','Chrome OS','Chrome']],
  ['Android WebView', {userAgent:'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/156.0.0.0 Mobile Safari/537.36'}, ['手机','Android','Android WebView']],
  ['WeChat browser', {userAgent:'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0'}, ['手机','Android','微信内置浏览器']],
  ['low entropy brand only', {userAgentData:{platform:'Windows',mobile:false,brands:[{brand:'Not_A Brand'},{brand:'Chromium'},{brand:'Microsoft Edge'}]}}, ['电脑','Windows','Edge']],
  ['unidentified Mobile token', {userAgent:'UnknownAgent Mobile'}, ['其他','未知','未知']]
]) test('coarse device categories: '+label, () => {
  const env=boot({navigator});
  assert.equal(env.requests.length,1);
  const p=env.requests[0].payload.properties;
  assert.deepEqual([p.device_type,p.device_os,p.device_browser],expected);
  assert.deepEqual(env.writes,[]);
  assert.equal(env.map.size,0);
});
test('device categories never add raw UA, model, versions, or high entropy requests', () => {
  let highEntropyCalls=0;
  const ua='Mozilla/5.0 (Linux; Android 14; PRIVATE_MODEL_22122RK93C Build/PRIVATE_BUILD) AppleWebKit/537.36 Chrome/156.1.2.3 Mobile Safari/537.36';
  const env=boot({navigator:{userAgent:ua,userAgentData:{mobile:true,platform:'Android',brands:[{brand:'Google Chrome',version:'PRIVATE_VERSION'}],getHighEntropyValues:()=>{highEntropyCalls++;throw Error('must not be called');}}}});
  assert.equal(highEntropyCalls,0);
  assert.equal(env.requests.length,1);
  assert.deepEqual(Object.keys(env.requests[0].payload.properties).sort(),[
    '$current_url','$geoip_disable','$host','$ip','$pathname','$process_person_profile',
    'analytics_mode','device_browser','device_os','device_type','referrer_host','source'
  ].sort());
  assert.doesNotMatch(env.requests[0].init.body,/PRIVATE_|156\.1\.2\.3|userAgent|model|platformVersion|device_id/);
});
test('restricted device getters fail safely without breaking the one-count behavior', () => {
  const navigator=Object.defineProperty({},'userAgent',{get(){throw Error('restricted');}});
  const env=boot({navigator});
  assert.equal(env.requests.length,1);
  const p=env.requests[0].payload.properties;
  assert.deepEqual([p.device_type,p.device_os,p.device_browser],['其他','未知','未知']);
});
test('owner exclusion is applied before capture, saved, and survives ordinary reopening', () => {
  const env = boot({url: site + '?exclude_self=1#mentors'});
  assert.equal(env.requests.length, 0);
  assert.equal(env.map.get('nau_analytics_opt_out'), '1');
  assert.equal(env.window.location.href, site + '#mentors');
  assert.match(env.toast.textContent, /已排除当前浏览器/);
  assert.equal(boot({map: env.map}).requests.length, 0);
});
test('owner link fails closed and reports when the persistent write fails', () => {
  const env = boot({url: site + '?exclude_self=1', writeFails: true});
  assert.equal(env.requests.length, 0);
  assert.equal(env.window.NAUAnalytics.isOptedOut(), true);
  assert.match(env.toast.textContent, /未能保存/);
});
test('legacy identity is deleted; prior explicit refusal is respected', () => {
  const map = new Map([['nau_mpacc_guide_anon_id_v1','old-id'],['nau_privacy_consent_v1',JSON.stringify({version:1, analytics:false})]]);
  const env=boot({map});
  assert.equal(map.has('nau_mpacc_guide_anon_id_v1'), false);
  assert.equal(env.requests.length, 0);
});
for (const [label, opts] of [
  ['owner', {map:new Map([['nau_analytics_opt_out','1']])}],
  ['DNT', {navigator:{doNotTrack:'1'}}],
  ['GPC', {navigator:{globalPrivacyControl:true}}],
  ['blocked settings', {blocked:true}],
  ['other host', {url:'https://example.com/nau-mpacc-guide/'}],
  ['preview', {url:'https://preview.example/nau-mpacc-guide/'}],
  ['different repository', {url:'https://nishino0525nanase.github.io/another/'}],
  ['removed video page', {url:site+'video/'}],
  ['removed management page', {url:site+'admin/'}],
  ['secret key', {config:{token:'phx_private_key'}}],
  ['untrusted endpoint', {config:{apiHost:'https://example.com'}}]
]) test(label+' sends no count', () => assert.equal(boot(opts).requests.length, 0));
test('device properties are not read before exclusion, storage, host, or config guards', () => {
  for(const opts of [
    {url:site+'?exclude_self=1'},
    {map:new Map([['nau_analytics_opt_out','1']])},
    {navigator:{doNotTrack:'1'}},
    {navigator:{globalPrivacyControl:true}},
    {blocked:true},
    {url:'https://example.com/nau-mpacc-guide/'},
    {url:site+'admin/'},
    {config:{enabled:false}}
  ]) {
    let reads=0;
    const navigator={...opts.navigator};
    for(const key of ['userAgent','platform','userAgentData','maxTouchPoints']) {
      Object.defineProperty(navigator,key,{get(){reads++;throw Error('device access before guard');}});
    }
    const env=boot({...opts,navigator});
    assert.equal(env.requests.length,0);
    assert.equal(reads,0);
  }
});
test('network failure never breaks the guide', async () => {
  assert.doesNotThrow(() => boot({reject:true}));
  await new Promise(resolve=>setImmediate(resolve));
});
test('public HTML and source omit removed UI and media capability', async () => {
  const html=await fs.readFile(new URL('../dist/index.html', import.meta.url),'utf8');
  assert.doesNotMatch(html,/consent\.(?:js|css)|data-cookie-settings|自愿视频|站点管理|\.\/video\/|\.\/admin\//);
  assert.doesNotMatch(code,/getUserMedia|RTCPeerConnection|document\.cookie|setInterval|sessionStorage/);
  for(const path of ['../dist/video/index.html','../dist/admin/index.html','../dist/consent.js']) {
    await assert.rejects(fs.access(new URL(path,import.meta.url)));
  }
});
