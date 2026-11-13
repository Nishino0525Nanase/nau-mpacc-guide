/* Scope-limited offline reading. Never intercept analytics, admin, or external URLs. */
'use strict';
const BASE = new URL('./', self.location.href);
const CACHE_PREFIX = `nau-guide:${BASE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}1.0.26-review-context-20261113`;
const DATA_PATH = 'data/site-data.json';
const SHELL_PATHS = [
  './', 'index.html', 'app.js', 'music.js', 'life-images.js', 'style.css', 'install.js', 'favicon.svg',
  'manifest.webmanifest', 'icons/app-192.png', 'icons/app-512.png'
];
const SHELL = new Set(SHELL_PATHS.map(path => new URL(path, BASE).href));
const DATA_URL = new URL(DATA_PATH, BASE).href;
const ASSET_REVISIONS = {'app.js':'context1', 'style.css':'context1', 'life-images.js':'campus1'};

function classify(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return null;
  const isDocument = url.pathname === BASE.pathname || url.pathname === `${BASE.pathname}index.html`;
  for (const [key, value] of url.searchParams) {
    if (key === 'v' && value === 'edition1') continue;
    if (key === 'v' && value === ASSET_REVISIONS[url.pathname.slice(BASE.pathname.length)]) continue;
    if (isDocument && key === 'exclude_self' && value === '1') continue;
    return null;
  }
  url.search = '';
  url.hash = '';
  if (url.href === DATA_URL) return {key:DATA_URL, data:true};
  if (SHELL.has(url.href)) return {key:url.href, data:false, document:isDocument};
  return null;
}

async function usable(response, isData) {
  if (!response || !response.ok || !['basic', 'default'].includes(response.type) || response.redirected) return false;
  if (!isData) return true;
  try {
    const value = await response.clone().json();
    return Array.isArray(value.mentors) && Array.isArray(value.lifeChapters) && Array.isArray(value.socialPosts)
      && Array.isArray(value.musicPlaylist?.tracks) && value.musicPlaylist.tracks.length > 0
      && value.musicPlaylist.tracks.every(track => typeof track.audioUrl === 'string' && track.audioUrl.startsWith('./media/music/'));
  } catch (_) { return false; }
}

async function network(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try { return await fetch(request, {cache:'no-cache', signal:controller.signal}); }
  finally { clearTimeout(timer); }
}

function offlineData(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Guide-Offline', 'cached');
  return new Response(response.body, {status:response.status, statusText:response.statusText, headers});
}

async function reply(request, target) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await network(request);
    if (await usable(response, target.data)) {
      try { await cache.put(target.key, response.clone()); } catch (_) {}
      return response;
    }
  } catch (_) {}
  let cached = await cache.match(target.key);
  if (!cached && target.document) cached = await cache.match(new URL('./', BASE).href) || await cache.match(new URL('index.html', BASE).href);
  if (cached) return target.data ? offlineData(cached) : cached;
  if (target.data) return new Response(JSON.stringify({error:'offline_data_unavailable'}), {status:503, headers:{'Content-Type':'application/json; charset=utf-8','X-Guide-Offline':'missing','Cache-Control':'no-store'}});
  return new Response(target.document ? '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>需要联网载入</title><h1>此设备还没有离线资料</h1><p>请先联网打开指南并等待资料载入，再离线阅读。</p><button onclick="location.reload()">重新载入</button></html>' : 'This file is not available offline.', {status:503, headers:{'Content-Type':target.document?'text/html; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Static code is a versioned unit; a missing shell file aborts this installation.
    await cache.addAll([...SHELL]);
    try {
      const response = await network(DATA_URL);
      if (await usable(response, true)) await cache.put(DATA_URL, response);
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const target = classify(event.request);
  if (target) event.respondWith(reply(event.request, target));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'NAU_CHECK_OFFLINE') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (await cache.match(DATA_URL)) event.source?.postMessage({type:'NAU_OFFLINE_READY'});
  })());
});
