import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const code = await fs.readFile(new URL('../dist/analytics.js', import.meta.url), 'utf8');
const consentCode = await fs.readFile(new URL('../dist/consent.js', import.meta.url), 'utf8');
const ownerCode = await fs.readFile(new URL('../dist/admin/owner.js', import.meta.url), 'utf8');
const consentKey = 'nau_privacy_consent_v1';
const identityKey = 'nau_mpacc_guide_anon_id_v1';
const choice = allowed => JSON.stringify({ version: 1, analytics: allowed });
const sampleConfig = {
  token: 'phc_public_test_capture_token',
  apiHost: 'https://us.i.posthog.com',
  allowedHost: 'nishino0525nanase.github.io',
  pathPrefix: '/nau-mpacc-guide/'
};
const site = 'https://nishino0525nanase.github.io/nau-mpacc-guide/';
const uuid = '12345678-1234-4123-8123-123456789abc';

function boot(options = {}) {
  const map = options.map || new Map();
  const requests = [];
  if (!map.has(consentKey) && options.consent !== null) map.set(consentKey, choice(options.consent !== false));
  const listeners = new Map();
  const addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); };
  const dispatchEvent = event => { for (const fn of listeners.get(event.type) || []) fn(event); return true; };
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const store = {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
  if (options.setThrowsOnly) store.setItem = () => { throw new Error('quota exceeded'); };
  if (options.storageThrows) store.getItem = store.setItem = () => { throw new Error('storage blocked'); };
  const window = {
    location: new URL(options.url || site),
    navigator: { ...(options.navigator || {}) },
    document: { referrer: options.referrer || '', readyState: 'loading', addEventListener() {} },
    addEventListener, dispatchEvent, CustomEvent,
    localStorage: store,
    crypto: options.crypto || { randomUUID: () => uuid },
    fetch: options.fetch || ((url, init) => { requests.push({ url, init, payload: JSON.parse(init.body) }); return Promise.resolve({ ok: true }); }),
    NAU_ANALYTICS: options.config === null ? undefined : { ...sampleConfig, ...(options.config || {}) }
  };
  const context = vm.createContext({ window, URL });
  if (options.order === 'analytics-first') { vm.runInContext(code, context); vm.runInContext(consentCode, context); }
  else { vm.runInContext(consentCode, context); vm.runInContext(code, context); }
  return { window, context, requests, map, reloadScript: () => vm.runInContext(code, context), reloadConsent: () => vm.runInContext(consentCode, context),
    storageEvent: key => dispatchEvent({ type: 'storage', key }) };
}

test('one page open sends the agreed anonymous PV and only allowed properties', () => {
  const { requests } = boot({ url: site + '?email=private@example.org#private', referrer: 'https://search.example/find?q=secret#fragment' });
  assert.equal(requests.length, 1);
  const { url, init, payload } = requests[0];
  assert.equal(url, 'https://us.i.posthog.com/i/v0/e/');
  assert.equal(payload.event, '$pageview');
  assert.equal(payload.distinct_id, 'anon_' + uuid);
  assert.equal(payload.properties.source, 'nau-mpacc-guide');
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$current_url, site);
  assert.equal(payload.properties.$pathname, '/nau-mpacc-guide/');
  assert.equal(payload.properties.referrer_host, 'search.example');
  assert.equal(payload.properties.$ip, null);
  assert.equal(payload.properties.$geoip_disable, true);
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.keepalive, true);
  assert.ok(!init.body.includes('private@example.org'));
  assert.ok(!init.body.includes('secret'));
  assert.deepEqual(Object.keys(payload.properties).sort(), ['$current_url', '$geoip_disable', '$host', '$ip', '$pathname', '$process_person_profile', 'referrer_host', 'source'].sort());
});

test('anonymous browser ID persists across full page loads without a fake visit counter', () => {
  const first = boot();
  const second = boot({ map: first.map });
  assert.equal(first.requests[0].payload.distinct_id, second.requests[0].payload.distinct_id);
  assert.deepEqual([...first.map.keys()], [consentKey, identityKey]);
});

test('duplicate script execution and hash navigation do not send another PV', () => {
  const env = boot();
  env.window.location.hash = '#teacher-panjun';
  env.reloadScript();
  assert.equal(env.requests.length, 1);
});

for (const [label, options] of [
  ['missing config', { config: null }],
  ['explicitly disabled', { config: { enabled: false } }],
  ['missing token', { config: { token: '' } }],
  ['personal key rejected', { config: { token: 'phx_private_key_should_never_be_sent' } }],
  ['untrusted ingestion host', { config: { apiHost: 'https://untrusted.example' } }],
  ['ingestion URL with query', { config: { apiHost: 'https://us.i.posthog.com/?secret=x' } }],
  ['other site', { url: 'https://other.example/nau-mpacc-guide/' }],
  ['other project on same host', { url: 'https://nishino0525nanase.github.io/another-project/' }],
  ['similar prefix', { url: 'https://nishino0525nanase.github.io/nau-mpacc-guide-extra/' }],
  ['localhost', { url: 'https://localhost/nau-mpacc-guide/', config: { allowedHost: 'localhost' } }],
  ['loopback', { url: 'https://127.0.0.1/nau-mpacc-guide/', config: { allowedHost: '127.0.0.1' } }],
  ['admin directory', { url: site + 'admin/' }],
  ['admin HTML', { url: site + 'admin.html' }],
  ['admin query', { url: site + '?admin=1' }],
  ['admin hash', { url: site + '#/admin' }],
  ['DNT', { navigator: { doNotTrack: '1' } }],
  ['GPC', { navigator: { globalPrivacyControl: true } }],
  ['blocked storage', { storageThrows: true }],
  ['no secure random ID', { crypto: {} }]
]) {
  test(label + ': no request and no browser ID written', () => {
    const env = boot(options);
    assert.equal(env.requests.length, 0);
    assert.equal(env.map.has('nau_mpacc_guide_anon_id_v1'), false);
  });
}

test('owner opt-out is persistent and compatible with the owner page key', () => {
  const map = new Map([['nau_analytics_opt_out', '1']]);
  const env = boot({ map });
  assert.equal(env.requests.length, 0);
  assert.equal(env.window.NAUAnalytics.isOptedOut(), true);
  env.window.NAUAnalytics.enable();
  assert.equal(map.get('nau_analytics_opt_out'), '0');
  assert.equal(env.requests.length, 1);
  const enabled = boot({ map });
  assert.equal(enabled.requests.length, 1);
  enabled.window.NAUAnalytics.disable();
  assert.equal(map.get('nau_analytics_opt_out'), '1');
});

test('owner enable never overrides DNT', () => {
  const env = boot({ navigator: { doNotTrack: '1' } });
  env.window.NAUAnalytics.enable();
  assert.equal(env.window.NAUAnalytics.isOptedOut(), true);
  assert.equal(env.requests.length, 0);
});

test('transport rejection is swallowed without breaking the page', async () => {
  assert.doesNotThrow(() => boot({ fetch: () => Promise.reject(new Error('network blocked')) }));
  await new Promise(resolve => setImmediate(resolve));
});

test('synchronous transport failure is swallowed', () => {
  assert.doesNotThrow(() => boot({ fetch: () => { throw new Error('fetch unavailable'); } }));
});

test('corrupt stored identity is replaced with a random anonymous ID', () => {
  const map = new Map([['nau_mpacc_guide_anon_id_v1', 'person@example.org']]);
  const env = boot({ map });
  assert.equal(env.requests[0].payload.distinct_id, 'anon_' + uuid);
  assert.ok(!env.requests[0].init.body.includes('person@example.org'));
});

test('first visit does not collect, write an ID, or infer consent from an old owner preference', () => {
  const map = new Map([['nau_analytics_opt_out', '0'], [identityKey, 'anon_' + uuid]]);
  const env = boot({ map, consent: null });
  assert.equal(env.window.NAUConsent.getAnalyticsConsent(), 'unset');
  assert.equal(env.requests.length, 0);
  assert.equal(map.has(identityKey), false);
  assert.equal(map.has(consentKey), false);
});

test('explicit allowance immediately sends exactly one current-page PV', () => {
  const env = boot({ consent: null });
  assert.equal(env.window.NAUConsent.setAnalyticsConsent(true), true);
  assert.equal(env.window.NAUConsent.getAnalyticsConsent(), 'granted');
  assert.equal(env.requests.length, 1);
  assert.equal(JSON.parse(env.map.get(consentKey)).analytics, true);
  env.window.NAUConsent.setAnalyticsConsent(true);
  env.window.dispatchEvent(new env.window.CustomEvent('nau:consentchange'));
  env.window.location.hash = '#life';
  env.reloadScript();
  env.reloadConsent();
  assert.equal(env.requests.length, 1);
});

test('essential-only selection persists without any anonymous identifier or request', () => {
  const env = boot({ consent: null });
  env.window.NAUConsent.setAnalyticsConsent(false);
  assert.equal(env.requests.length, 0);
  assert.equal(env.window.NAUConsent.getAnalyticsConsent(), 'denied');
  assert.equal(env.map.has(identityKey), false);
  const later = boot({ map: env.map });
  assert.equal(later.requests.length, 0);
});

test('withdrawing consent clears identity immediately and prevents future page-load tracking', () => {
  const env = boot();
  assert.equal(env.requests.length, 1);
  env.window.NAUConsent.setAnalyticsConsent(false);
  assert.equal(env.map.has(identityKey), false);
  assert.equal(env.requests.length, 1, 'previously sent events cannot be recalled');
  const later = boot({ map: env.map });
  assert.equal(later.requests.length, 0);
  env.window.NAUConsent.setAnalyticsConsent(true);
  assert.equal(env.requests.length, 1, 're-grant must not double-count the same page open');
});

test('cross-tab grant and withdrawal are read from storage, and do not trust event payloads', () => {
  const env = boot({ consent: null });
  env.window.dispatchEvent(new env.window.CustomEvent('nau:consentchange', { detail: { analytics: true } }));
  assert.equal(env.requests.length, 0);
  env.map.set(consentKey, choice(true));
  env.storageEvent(consentKey);
  assert.equal(env.requests.length, 1);
  env.map.set(consentKey, choice(false));
  env.storageEvent(consentKey);
  assert.equal(env.map.has(identityKey), false);
  assert.equal(env.requests.length, 1);
});

test('cross-tab owner exclusion clears identity, and resuming never grants consent', () => {
  const env = boot();
  env.map.set('nau_analytics_opt_out', '1');
  env.storageEvent('nau_analytics_opt_out');
  assert.equal(env.map.has(identityKey), false);
  const denied = boot({ consent: false });
  denied.window.NAUAnalytics.enable();
  assert.equal(denied.requests.length, 0);
  assert.equal(denied.window.NAUConsent.getAnalyticsConsent(), 'denied');
});

for (const navigator of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
  test('explicit consent does not override browser privacy signals ' + JSON.stringify(navigator), () => {
    const env = boot({ consent: null, navigator });
    env.window.NAUConsent.setAnalyticsConsent(true);
    env.window.NAUAnalytics.enable();
    assert.equal(env.requests.length, 0);
    assert.equal(env.map.has(identityKey), false);
  });
}

test('explicit consent does not override owner exclusion', () => {
  const env = boot({ consent: null, map: new Map([['nau_analytics_opt_out', '1']]) });
  env.window.NAUConsent.setAnalyticsConsent(true);
  assert.equal(env.requests.length, 0);
  env.window.NAUAnalytics.enable();
  assert.equal(env.requests.length, 1);
});

test('both consent and analytics script load orders keep opt-in and once-per-load behavior', () => {
  for (const order of ['consent-first', 'analytics-first']) {
    const env = boot({ consent: null, order });
    assert.equal(env.requests.length, 0);
    env.window.NAUConsent.setAnalyticsConsent(true);
    assert.equal(env.requests.length, 1);
    env.reloadScript();
    env.reloadConsent();
    env.storageEvent(consentKey);
    assert.equal(env.requests.length, 1);
  }
});

test('invalid or future consent records fail closed', () => {
  for (const value of ['yes', '{}', '{"version":2,"analytics":true}', '{"version":1,"analytics":"true"}']) {
    const env = boot({ map: new Map([[consentKey, value]]) });
    assert.equal(env.requests.length, 0);
    assert.equal(env.window.NAUConsent.getAnalyticsConsent(), 'unset');
    assert.equal(env.map.has(identityKey), false);
  }
});

test('blocked consent storage cannot enable analytics and does not throw', () => {
  const env = boot({ consent: null, storageThrows: true });
  assert.equal(env.window.NAUConsent.setAnalyticsConsent(true), false);
  assert.equal(env.requests.length, 0);
  assert.equal(env.map.has(identityKey), false);
  assert.doesNotThrow(() => env.window.NAUConsent.setAnalyticsConsent(false));
});

test('owner page restoring inclusion leaves optional consent denied', () => {
  const map = new Map([['nau_analytics_opt_out', '1'], [consentKey, choice(false)]]);
  const handlers = {};
  const button = { setAttribute() {}, addEventListener(type, fn) { handlers[type] = fn; } };
  const status = {};
  const localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const context = vm.createContext({ window: { addEventListener() {} }, navigator: {}, localStorage, document: { getElementById: id => id === 'exclude-self' ? button : status } });
  vm.runInContext(ownerCode, context);
  handlers.click();
  assert.equal(map.get('nau_analytics_opt_out'), '0');
  assert.equal(JSON.parse(map.get(consentKey)).analytics, false);
  assert.match(status.textContent, /尚未允许匿名统计/);
});


test('withdrawal removes a previous grant even when quota blocks storing the new choice', () => {
  const map = new Map([[consentKey, choice(true)], [identityKey, 'anon_' + uuid]]);
  const env = boot({ map, setThrowsOnly: true });
  env.window.NAUConsent.setAnalyticsConsent(false);
  assert.equal(env.window.NAUConsent.getAnalyticsConsent(), 'denied');
  assert.equal(map.has(consentKey), false);
  assert.equal(map.has(identityKey), false);
  const later = boot({ map, consent: null });
  assert.equal(later.requests.length, 0);
});
