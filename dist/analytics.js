/* Minimal anonymous page-open analytics. No SDK, autocapture, replay or identity calls.
 * Public config must be loaded first as window.NAU_ANALYTICS.
 * Event contract: $pageview, properties.source === 'nau-mpacc-guide'.
 * Local storage holds a random browser ID and opt-out flag, never visit counters.
 * Docs: https://posthog.com/docs/api/capture
 *       https://posthog.com/docs/data/anonymous-vs-identified-events
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.NAUAnalytics) return;

  var OPT_OUT = 'nau_analytics_opt_out';
  var BROWSER_ID = 'nau_mpacc_guide_anon_id_v1';
  var locallyDisabled = false;

  function storage() {
    try { return window.localStorage; } catch (_) { return null; }
  }

  function privacySignal() {
    var nav = window.navigator || {};
    var dnt = String(nav.doNotTrack || window.doNotTrack || nav.msDoNotTrack || '').toLowerCase();
    return dnt === '1' || dnt === 'yes' || nav.globalPrivacyControl === true;
  }

  function isOptedOut() {
    if (locallyDisabled || privacySignal()) return true;
    try {
      var store = storage();
      return !store || store.getItem(OPT_OUT) === '1';
    } catch (_) { return true; }
  }

  function disable() {
    locallyDisabled = true;
    try { var store = storage(); if (store) store.setItem(OPT_OUT, '1'); } catch (_) {}
  }

  function enable() {
    locallyDisabled = false;
    try { var store = storage(); if (store) store.setItem(OPT_OUT, '0'); } catch (_) {}
    // A full reload is needed to capture a new page open. DNT/GPC still take priority.
  }

  window.NAUAnalytics = Object.freeze({ disable: disable, enable: enable, isOptedOut: isOptedOut });

  function settings() {
    var config = window.NAU_ANALYTICS;
    if (!config || config.enabled === false || typeof config.token !== 'string') return null;
    var token = config.token.trim();
    // Reject personal/secret API keys rather than accidentally publish them in a request.
    if (!/^phc_[A-Za-z0-9_-]{10,}$/.test(token)) return null;
    if (typeof config.allowedHost !== 'string' || typeof config.pathPrefix !== 'string') return null;
    var host = config.allowedHost.trim().toLowerCase();
    var prefix = config.pathPrefix;
    if (!host || /[/:?#\s]/.test(host) || prefix.charAt(0) !== '/' || /[?#]/.test(prefix)) return null;
    if (prefix.charAt(prefix.length - 1) !== '/') prefix += '/';
    try {
      var api = new URL(config.apiHost);
      if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(api.origin)) return null;
      if (api.pathname !== '/' || api.search || api.hash || api.username || api.password) return null;
      return { token: token, apiHost: api.origin, allowedHost: host, pathPrefix: prefix };
    } catch (_) { return null; }
  }

  function allowedPage(config) {
    try {
      var page = new URL(window.location.href);
      var host = page.hostname.toLowerCase();
      if (page.protocol !== 'https:' || host !== config.allowedHost) return null;
      if (host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '0.0.0.0' || host === '[::1]') return null;
      if (page.pathname !== config.pathPrefix.slice(0, -1) && !page.pathname.startsWith(config.pathPrefix)) return null;
      var path = decodeURIComponent(page.pathname);
      if (/(?:^|\/)(?:admin|analytics-admin|dashboard)(?:\.html)?(?:\/|$)/i.test(path)) return null;
      if (page.searchParams.has('admin') || /^(?:#\/?)(?:admin|dashboard)(?:[/?]|$)/i.test(page.hash)) return null;
      return page;
    } catch (_) { return null; }
  }

  function anonymousId() {
    try {
      var store = storage();
      if (!store) return null;
      var id = store.getItem(BROWSER_ID);
      if (/^anon_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) return id;
      var crypto = window.crypto;
      if (!crypto || typeof crypto.randomUUID !== 'function') return null;
      id = 'anon_' + crypto.randomUUID();
      store.setItem(BROWSER_ID, id);
      // Do not silently switch to a new per-load ID when storage is blocked: that inflates UV.
      return store.getItem(BROWSER_ID) === id ? id : null;
    } catch (_) { return null; }
  }

  var config = settings();
  if (!config || isOptedOut() || typeof window.fetch !== 'function') return;
  var page = allowedPage(config);
  if (!page) return;
  var id = anonymousId();
  if (!id) return;

  var referrerHost = '';
  try { referrerHost = new URL(window.document.referrer).hostname; } catch (_) {}
  var payload = {
    api_key: config.token,
    event: '$pageview',
    distinct_id: id,
    properties: {
      source: 'nau-mpacc-guide',
      $process_person_profile: false,
      $current_url: page.origin + page.pathname,
      $pathname: page.pathname,
      $host: page.hostname,
      referrer_host: referrerHost,
      $ip: null,
      $geoip_disable: true
    }
  };

  try {
    var request = window.fetch(config.apiHost + '/i/v0/e/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      keepalive: true,
      mode: 'cors'
    });
    if (request && typeof request.catch === 'function') request.catch(function () {});
  } catch (_) {}
  // Deliberately no hashchange/history listeners: exactly one attempted PV per full load.
}());
