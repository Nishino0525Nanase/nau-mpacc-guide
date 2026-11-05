/* Aggregate page-open counts only. No cookies, visitor ID, SDK or replay.
 * Each page load gets an ephemeral random event ID; never interpret it as UV.
 * Owner exclusion uses a local preference, processed before any capture.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.NAUAnalytics) return;
  var OPT_OUT = 'nau_analytics_opt_out';
  var OLD_ID = 'nau_mpacc_guide_anon_id_v1';
  var OLD_CHOICE = 'nau_privacy_consent_v1';
  var disabled = false;
  var attempted = false;
  function storage() {
    try { return window.localStorage; } catch (_) { return null; }
  }
  function clearOldIdentity() {
    try { var s = storage(); if (s) s.removeItem(OLD_ID); } catch (_) {}
  }
  function isOptedOut() {
    if (disabled) return true;
    var n = window.navigator || {};
    var dnt = String(n.doNotTrack || window.doNotTrack || n.msDoNotTrack || '').toLowerCase();
    if (dnt === '1' || dnt === 'yes' || n.globalPrivacyControl === true) return true;
    try {
      var s = storage();
      if (!s || s.getItem(OPT_OUT) === '1') return true;
      // Respect an explicit refusal from an earlier release.
      var raw = s.getItem(OLD_CHOICE);
      if (raw) {
        var choice = JSON.parse(raw);
        if (choice && choice.version === 1 && choice.analytics === false) return true;
      }
      return false;
    } catch (_) { return true; }
  }
  function disable() {
    disabled = true;
    clearOldIdentity();
    try {
      var s = storage();
      if (!s) return false;
      s.setItem(OPT_OUT, '1');
      return s.getItem(OPT_OUT) === '1';
    } catch (_) { return false; }
  }
  function config() {
    var c = window.NAU_ANALYTICS;
    if (!c || c.enabled === false || typeof c.token !== 'string' || !/^phc_[A-Za-z0-9_-]{10,}$/.test(c.token)) return null;
    if (typeof c.allowedHost !== 'string' || typeof c.pathPrefix !== 'string') return null;
    if (!c.allowedHost || /[/:?#\s]/.test(c.allowedHost) || c.pathPrefix.charAt(0) !== '/' || /[?#]/.test(c.pathPrefix)) return null;
    try {
      var api = new URL(c.apiHost);
      if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(api.origin)) return null;
      if (api.pathname !== '/' || api.search || api.hash || api.username || api.password) return null;
      return { token: c.token, apiHost: api.origin, host: c.allowedHost.toLowerCase(), prefix: c.pathPrefix.replace(/\/?$/, '/') };
    } catch (_) { return null; }
  }
  function allowedPage(c) {
    try {
      var p = new URL(window.location.href);
      if (p.protocol !== 'https:' || p.hostname.toLowerCase() !== c.host) return null;
      if (c.host === 'localhost' || c.host.endsWith('.localhost') || /^127\./.test(c.host) || c.host === '0.0.0.0' || c.host === '[::1]') return null;
      if (![c.prefix, c.prefix.slice(0, -1), c.prefix + 'index.html'].includes(p.pathname)) return null;
      if (p.searchParams.has('admin') || /^#\/?(?:admin|dashboard)(?:[/?]|$)/i.test(p.hash)) return null;
      return p;
    } catch (_) { return null; }
  }
  function notifyOwner(saved) {
    var doc = window.document;
    var target = doc && doc.getElementById && doc.getElementById('toast');
    if (!target) return;
    target.textContent = saved ? '已排除当前浏览器：以后的访问不计入统计。' : '本次访问已排除，但设置未能保存；下次请仍使用排除链接打开。';
    if (target.classList) target.classList.add('visible');
  }
  clearOldIdentity();
  window.NAUAnalytics = Object.freeze({ disable: disable, isOptedOut: isOptedOut });
  try {
    var ownerPage = new URL(window.location.href);
    if (ownerPage.searchParams.get('exclude_self') === '1') {
      var saved = disable();
      ownerPage.searchParams.delete('exclude_self');
      if (window.history && typeof window.history.replaceState === 'function') window.history.replaceState(null, '', ownerPage.href);
      notifyOwner(saved);
      return;
    }
  } catch (_) { return; }
  function capture() {
    var c = config();
    if (attempted || !c || isOptedOut() || typeof window.fetch !== 'function') return;
    var p = allowedPage(c);
    if (!p || !window.crypto || typeof window.crypto.randomUUID !== 'function') return;
    var id;
    try { id = 'pv_' + window.crypto.randomUUID(); } catch (_) { return; }
    var referrer = '';
    try { referrer = new URL(window.document.referrer).hostname; } catch (_) {}
    var payload = {
      api_key: c.token,
      event: '$pageview',
      distinct_id: id,
      properties: {
        source: 'nau-mpacc-guide',
        analytics_mode: 'aggregate_v2',
        $process_person_profile: false,
        $current_url: p.origin + p.pathname,
        $pathname: p.pathname,
        $host: p.hostname,
        referrer_host: referrer,
        $ip: null,
        $geoip_disable: true
      }
    };
    attempted = true;
    try {
      var request = window.fetch(c.apiHost + '/i/v0/e/', {
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
  }
  capture();
}());
