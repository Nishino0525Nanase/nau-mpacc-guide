import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const code = await fs.readFile(new URL('../dist/analytics.js', import.meta.url), 'utf8');
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
  const store = {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
  if (options.storageThrows) store.getItem = store.setItem = () => { throw new Error('storage blocked'); };
  const window = {
    location: new URL(options.url || site),
    navigator: { ...(options.navigator || {}) },
    document: { referrer: options.referrer || '' },
    localStorage: store,
    crypto: options.crypto || { randomUUID: () => uuid },
    fetch: options.fetch || ((url, init) => { requests.push({ url, init, payload: JSON.parse(init.body) }); return Promise.resolve({ ok: true }); }),
    NAU_ANALYTICS: options.config === null ? undefined : { ...sampleConfig, ...(options.config || {}) }
  };
  const context = vm.createContext({ window, URL });
  vm.runInContext(code, context);
  return { window, context, requests, map, reloadScript: () => vm.runInContext(code, context) };
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
  assert.deepEqual([...first.map.keys()], ['nau_mpacc_guide_anon_id_v1']);
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
  assert.equal(env.requests.length, 0);
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
