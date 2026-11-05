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
