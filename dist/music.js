/* One manually started player. Only the selected song is loaded. */
(() => {
  'use strict';

  const list = value => Array.isArray(value) ? value : [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const finite = value => Number.isFinite(Number(value));
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));
  const documentUrl = baseUrl => baseUrl || (typeof document !== 'undefined' && document.baseURI) || window.location?.href || 'https://guide.invalid/';
  function bundledPage(baseUrl) { try { return new URL(documentUrl(baseUrl)).hostname === 'appassets.androidplatform.net'; } catch (_) { return false; } }
  function safeAudioUrl(value, id, baseUrl) {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return '';
    if (value !== `./media/music/${id}.mp3` && value !== `./media/music/${id}.m4a`) return '';
    try {
      const base = new URL(documentUrl(baseUrl));
      if (!['http:', 'https:'].includes(base.protocol) || bundledPage(baseUrl)) return '';
      return new URL(value, base).href;
    } catch (_) { return ''; }
  }

  function safeListeningUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      return ['y.qq.com', 'c.y.qq.com', 'music.163.com'].includes(url.hostname) ? url.href : '';
    } catch (_) { return ''; }
  }

  function formatTime(value) {
    const seconds = finite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function validTracks(playlist) {
    const seen = new Set();
    return list(playlist?.tracks).filter(track => {
      if (!track || typeof track.id !== 'string' || !track.id || seen.has(track.id) || typeof track.title !== 'string') return false;
      seen.add(track.id);
      return true;
    });
  }

  function listeningLinks(track) {
    return list(track?.listeningLinks).map(link => ({...link, url:safeListeningUrl(link?.url)})).filter(link => link.url);
  }

  function linksHtml(track, compact = false) {
    return listeningLinks(track).slice(0, compact ? 1 : 3).map(link => {
      const label = link.label || (link.type === 'direct' ? '打开平台曲目' : '到平台搜索');
      return `<a class="${compact ? 'music-platform-small' : 'music-platform-link'}" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" data-music-external>${esc(label)} <span aria-hidden="true">↗</span></a>`;
    }).join('');
  }

  function createPlayer({tracks, audio, baseUrl}) {
    const playlist = validTracks({tracks});
    if (!audio || typeof audio.play !== 'function' || typeof audio.pause !== 'function') throw new Error('Audio element required');
    const sources = new Map(playlist.map(track => [track.id, safeAudioUrl(track.audioUrl, track.id, baseUrl)]).filter(([,url]) => url));
    const positions = new Map(), subscribers = new Set();
    const events = [];
    let selectedId = playlist[0]?.id || '', activeId = '', status = 'idle';
    const unavailableMessage = bundledPage(baseUrl) ? '歌曲需联网，请切换“在线”模式收听。' : '这首音频暂未载入，可到平台收听。';
    let message = bundledPage(baseUrl) ? unavailableMessage : '点播放，听一首歌。';
    let disposed = false, desiredPlay = false, intent = 0, pendingPosition = null;
    audio.autoplay = false;
    audio.loop = false;
    audio.preload = 'metadata';
    try { audio.volume = 0.55; } catch (_) {}

    const selected = () => playlist.find(track => track.id === selectedId) || null;
    const sourceIsCurrent = () => {
      const url = sources.get(selectedId);
      if (!url || activeId !== selectedId || audio.src !== url) return false;
      return !audio.currentSrc || audio.currentSrc === url;
    };
    const durationKnown = () => sourceIsCurrent() && finite(audio.duration) && Number(audio.duration) > 0;
    const rememberPosition = () => {
      if (sourceIsCurrent() && finite(audio.currentTime)) positions.set(selectedId, Math.max(0, Number(audio.currentTime)));
    };

    function getState() {
      const known = durationKnown();
      return {
        selectedId, track:selected(), status, message,
        availableIds:[...sources.keys()], availableCount:sources.size,
        currentTime:sourceIsCurrent() && finite(audio.currentTime) ? Math.max(0, Number(audio.currentTime)) : (positions.get(selectedId) || 0),
        duration:known ? Number(audio.duration) : 0, durationKnown:known,
        volume:finite(audio.volume) ? clamp(audio.volume, 0, 1) : 1,
        muted:Boolean(audio.muted), disposed,
      };
    }

    function notify() {
      const snapshot = getState();
      for (const subscriber of subscribers) {
        try { subscriber(snapshot); } catch (_) { /* A view cannot interrupt playback cleanup. */ }
      }
    }

    function pause(reason) {
      if (disposed) return;
      desiredPlay = false;
      intent += 1;
      rememberPosition();
      audio.pause();
      if (activeId) {
        status = 'paused';
        message = reason || `已暂停：${selected()?.title || '当前曲目'}`;
      }
      notify();
    }

    function clearSource() {
      activeId = '';
      pendingPosition = null;
      audio.removeAttribute?.('src');
      audio.load?.();
    }

    function choose(id) {
      if (disposed || !playlist.some(track => track.id === id)) return false;
      if (id === selectedId) return true;
      desiredPlay = false;
      intent += 1;
      rememberPosition();
      audio.pause();
      if (activeId) clearSource();
      selectedId = id;
      if (sources.has(id)) {
        status = 'ready';
        message = `已选择：${selected()?.title}。点播放开始。`;
      } else {
        status = 'idle';
        message = unavailableMessage;
      }
      notify();
      return true;
    }

    async function play(id = selectedId) {
      if (disposed || !choose(id)) return false;
      const url = sources.get(selectedId);
      if (!url) {
        message = unavailableMessage;
        status = 'idle';
        notify();
        return false;
      }
      if (activeId !== selectedId || audio.src !== url) {
        activeId = selectedId;
        pendingPosition = positions.get(selectedId) || 0;
        audio.src = url;
        audio.load?.();
      }
      const request = ++intent;
      desiredPlay = true;
      status = 'loading';
      message = `正在打开：${selected()?.title}`;
      notify();
      try {
        await audio.play();
        if (disposed || request !== intent || !desiredPlay) {
          if (!desiredPlay) audio.pause();
          return false;
        }
        if (audio.paused) {
          desiredPlay = false;
          status = 'paused';
          message = '播放尚未开始，请再次点播放。';
          notify();
          return false;
        }
        status = 'playing';
        message = `正在播放：${selected()?.title}`;
        notify();
        return true;
      } catch (_) {
        if (disposed || request !== intent) return false;
        desiredPlay = false;
        status = 'error';
        message = '这首音频暂时无法播放，请稍后重试，或到平台收听。';
        notify();
        return false;
      }
    }

    function adjacent(delta, wrap) {
      const available = playlist.map((track, index) => ({track, index})).filter(item => sources.has(item.track.id));
      if (!available.length) return null;
      const index = playlist.findIndex(track => track.id === selectedId);
      const target = delta > 0 ? available.find(item => item.index > index) : available.slice().reverse().find(item => item.index < index);
      return target?.track || (wrap ? (delta > 0 ? available[0].track : available[available.length - 1].track) : null);
    }

    function next(delta = 1) {
      const target = adjacent(delta < 0 ? -1 : 1, true);
      if (!target) return false;
      const resume = desiredPlay || status === 'playing';
      choose(target.id);
      if (resume) return play(target.id);
      return true;
    }

    function seek(value) {
      if (disposed || !durationKnown() || !finite(value)) return false;
      try {
        audio.currentTime = clamp(value, 0, audio.duration);
        rememberPosition();
        notify();
        return true;
      } catch (_) { return false; }
    }

    function setVolume(value) {
      if (disposed || !finite(value)) return;
      try { audio.volume = clamp(value, 0, 1); } catch (_) { message = '当前设备请使用系统音量键调节。'; }
      notify();
    }

    function toggleMute() { if (!disposed) { audio.muted = !audio.muted; notify(); } }

    function listen(name, listener) {
      audio.addEventListener(name, listener);
      events.push([name, listener]);
    }

    listen('loadedmetadata', () => {
      if (!sourceIsCurrent()) return;
      if (pendingPosition !== null && durationKnown()) {
        try { audio.currentTime = clamp(pendingPosition, 0, audio.duration); } catch (_) {}
        pendingPosition = null;
      }
      notify();
    });
    listen('durationchange', () => { if (sourceIsCurrent()) notify(); });
    listen('timeupdate', () => { if (sourceIsCurrent()) { rememberPosition(); notify(); } });
    listen('playing', () => {
      if (!sourceIsCurrent()) return;
      if (!desiredPlay) { audio.pause(); return; }
      status = 'playing'; message = `正在播放：${selected()?.title}`; notify();
    });
    listen('pause', () => {
      if (!sourceIsCurrent() || desiredPlay || status === 'ended' || status === 'error') return;
      rememberPosition(); status = 'paused'; message = `已暂停：${selected()?.title}`; notify();
    });
    listen('waiting', () => { if (sourceIsCurrent() && desiredPlay) { status = 'loading'; message = '正在缓冲音频…'; notify(); } });
    listen('error', () => {
      if (!sourceIsCurrent()) return;
      desiredPlay = false; intent += 1; status = 'error';
      message = '音频暂时无法载入，请检查网络后重试，或到平台收听。';
      notify();
    });
    listen('ended', () => {
      if (!sourceIsCurrent()) return;
      rememberPosition();
      const proceed = desiredPlay;
      desiredPlay = false; intent += 1; status = 'ended'; message = `已播放完：${selected()?.title}`;
      const target = proceed ? adjacent(1, false) : null;
      notify();
      if (target) { choose(target.id); void play(target.id); }
    });

    function dispose() {
      if (disposed) return;
      pause();
      clearSource();
      positions.clear();
      disposed = true; desiredPlay = false; intent += 1;
      for (const [name, listener] of events) audio.removeEventListener(name, listener);
      subscribers.clear();
    }

    return {getState, select:choose, play, pause, next, seek, setVolume, toggleMute, dispose,
      subscribe(listener) { subscribers.add(listener); listener(getState()); return () => subscribers.delete(listener); }};
  }

  function renderMarkup(playlist) {
    const tracks = validTracks(playlist);
    const albums = [...new Set(tracks.map(track => track.album).filter(Boolean))];
    const versions = [...new Set(tracks.map(track => track.version).filter(Boolean))];
    const first = tracks[0];
    return `<div class="section-heading music-heading"><div><span class="small-label">MUSIC / A SMALL BREAK</span><h2>${esc(playlist?.title || '音乐小憩')}</h2><p>${esc(playlist?.intro || '读累了，就停一会儿。挑一首歌，换个节奏。')}</p></div><div class="section-count"><strong>${tracks.length}</strong> 首 · ${esc(playlist?.artist || '华晨宇')}</div></div>${tracks.length ? `<section class="music-room" aria-label="自选歌单与音乐播放器"><div class="music-layout"><aside class="music-player" aria-label="当前曲目"><div class="music-disc" aria-hidden="true"><div class="music-disc-center"><span>留声</span><small>YU NUO’S PLAYLIST</small></div></div><p class="music-owner">${esc(playlist?.ownerLabel || '雨诺自选')}</p><h3 id="music-now-title">${esc(first.title)}</h3><p id="music-now-meta" class="music-now-meta">${esc(first.artist || playlist?.artist || '华晨宇')} · ${esc(first.album || '')}</p><p id="music-now-version" class="music-now-version">${esc(first.version || '')}</p><div class="music-progress"><label class="sr-only" for="music-seek">播放进度</label><input type="range" id="music-seek" min="0" max="1" value="0" step="0.1" disabled aria-label="播放进度"><div class="music-clock"><span id="music-current-time">0:00</span><span id="music-total-time">${formatTime(first.durationSeconds)}</span></div></div><div class="music-controls"><button type="button" class="music-step" data-music-action="previous" aria-label="上一首">‹</button><button type="button" id="music-play-toggle" class="music-play-toggle" data-music-action="toggle" aria-label="播放：${esc(first.title)}">播放</button><button type="button" class="music-step" data-music-action="next" aria-label="下一首">›</button></div><div class="music-volume"><button type="button" data-music-action="mute" aria-label="静音" aria-pressed="false">静音</button><label class="sr-only" for="music-volume">音量</label><input type="range" id="music-volume" min="0" max="1" step="0.05" value="0.55" aria-label="音量"></div><p id="music-playback-status" class="music-playback-status" role="status" aria-live="polite">点播放，听一首歌。</p><div id="music-current-links" class="music-current-links">${linksHtml(first)}</div><p class="music-platform-note">平台搜索结果可能包含其他版本，请按歌曲页面核对。</p></aside><div class="music-library"><div class="music-listening-note"><h3>把熟悉的歌，放在这里听</h3><p>从这份自选歌单里，挑一首想听的。点播放就可以开始。</p><p class="music-session-note">按歌单顺序播放；离开栏目或切到后台会暂停，回来后可继续。</p></div><div class="music-filters"><div class="music-search"><label for="music-search">找一首歌</label><input type="search" id="music-search" placeholder="搜索歌名或专辑" autocomplete="off"></div><div><label for="music-album">专辑</label><select id="music-album"><option value="">全部专辑</option>${albums.map(album => `<option value="${esc(album)}">${esc(album)}</option>`).join('')}</select></div><div><label for="music-version">版本</label><select id="music-version"><option value="">全部版本</option>${versions.map(version => `<option value="${esc(version)}">${esc(version)}</option>`).join('')}</select></div></div><div class="results-bar"><span id="music-result-count" role="status" aria-live="polite">${tracks.length} 首歌曲</span><button type="button" class="text-button" data-music-action="reset-filters">清除筛选</button></div><div id="music-track-list" class="music-track-list"></div></div></div></section>` : '<div class="empty-state"><h3>歌单暂未载入</h3><p>请稍后刷新，其他指南内容仍可继续阅读。</p></div>'}`;
  }

  let session = null, sessionKey = '', view = null;

  function leave() {
    view?.destroy();
    view = null;
    session?.pause('已离开音乐栏目，播放已暂停。');
  }

  function mount(container, playlist) {
    leave();
    const tracks = validTracks(playlist);
    const key = tracks.map(track => `${track.id}:${track.audioUrl || ''}`).join('|');
    container.innerHTML = renderMarkup(playlist);
    if (!tracks.length) return;
    const AudioConstructor = window.Audio;
    if (!session || sessionKey !== key) {
      session?.dispose();
      session = null;
      sessionKey = key;
      if (typeof AudioConstructor === 'function') session = createPlayer({tracks, audio:new AudioConstructor()});
    }
    const find = selector => container.querySelector(selector);
    if (!session) {
      find('#music-playback-status').textContent = '当前浏览器暂不支持音频播放，可通过平台入口收听。';
      return;
    }
    let query = '', album = '', version = '', rowKey = '';
    let renderedLinks = linksHtml(tracks[0]);
    const normalize = value => String(value || '').toLowerCase().replace(/\s/g, '');
    const handlers = [];
    const on = (name, listener) => { container.addEventListener(name, listener); handlers.push([name, listener]); };

    function renderTracks(snapshot) {
      const visible = tracks.filter(track => (!album || track.album === album) && (!version || track.version === version) && (!query || normalize([track.title,track.artist,track.album,track.version].join(' ')).includes(normalize(query))));
      const available = new Set(snapshot.availableIds);
      find('#music-result-count').textContent = `${visible.length} / ${tracks.length} 首歌曲`;
      find('#music-track-list').innerHTML = visible.length ? visible.map(track => {
        const selected = track.id === snapshot.selectedId, ready = available.has(track.id);
        return `<article class="music-track${selected ? ' selected' : ''}${selected && snapshot.status === 'playing' ? ' playing' : ''}" data-music-track="${esc(track.id)}"><button type="button" class="music-track-select" data-music-action="select" data-id="${esc(track.id)}"${selected ? ' aria-current="true"' : ''}><span class="music-track-number">${String(tracks.indexOf(track)+1).padStart(2,'0')}</span><span class="music-track-text"><strong>${esc(track.title)}</strong><small>${esc(track.album || '')}${track.version ? ` · ${esc(track.version)}` : ''}</small></span><span class="music-track-duration">${formatTime(track.durationSeconds)}</span></button><div class="music-track-actions"><button type="button" class="music-track-play" data-music-action="play-track" data-id="${esc(track.id)}" aria-label="播放：${esc(track.title)}"${ready ? '' : ' disabled'}>${ready ? '播放' : '音频暂未载入'}</button>${linksHtml(track, true)}</div></article>`;
      }).join('') : '<div class="music-empty"><p>没有找到这首歌，试试清除筛选。</p><button type="button" class="text-button" data-music-action="reset-filters">显示全部歌曲</button></div>';
    }

    function update(snapshot) {
      if (!view || view.container !== container) return;
      const track = snapshot.track;
      if (!track) return;
      find('#music-now-title').textContent = track.title;
      find('#music-now-meta').textContent = [track.artist || playlist.artist || '华晨宇',track.album].filter(Boolean).join(' · ');
      find('#music-now-version').textContent = track.version || '';
      const currentLinks = linksHtml(track);
      if (renderedLinks !== currentLinks) {
        find('#music-current-links').innerHTML = currentLinks;
        renderedLinks = currentLinks;
      }
      const playbackStatus = find('#music-playback-status');
      if (playbackStatus.textContent !== snapshot.message) playbackStatus.textContent = snapshot.message;
      const playing = snapshot.status === 'playing';
      const playButton = find('#music-play-toggle');
      playButton.disabled = !snapshot.availableIds.includes(track.id);
      playButton.textContent = playing ? '暂停' : snapshot.status === 'loading' ? '正在打开…' : '播放';
      playButton.setAttribute('aria-label', `${playing ? '暂停：' : '播放：'}${track.title}`);
      playButton.setAttribute('aria-pressed', String(playing));
      container.querySelector('.music-disc').classList.toggle('is-playing', playing);
      for (const button of container.querySelectorAll('[data-music-action="previous"],[data-music-action="next"]')) button.disabled = snapshot.availableCount < 2;
      const seek = find('#music-seek');
      seek.disabled = !snapshot.durationKnown;
      seek.max = snapshot.durationKnown ? String(snapshot.duration) : '1';
      seek.value = String(snapshot.durationKnown ? Math.min(snapshot.currentTime, snapshot.duration) : 0);
      seek.setAttribute('aria-valuetext', `${formatTime(snapshot.currentTime)} / ${formatTime(snapshot.durationKnown ? snapshot.duration : track.durationSeconds)}`);
      find('#music-current-time').textContent = formatTime(snapshot.currentTime);
      find('#music-total-time').textContent = formatTime(snapshot.durationKnown ? snapshot.duration : track.durationSeconds);
      find('#music-volume').value = String(snapshot.volume);
      const muteButton = find('[data-music-action="mute"]');
      muteButton.textContent = snapshot.muted ? '取消静音' : '静音';
      muteButton.setAttribute('aria-label', snapshot.muted ? '取消静音' : '静音');
      muteButton.setAttribute('aria-pressed', String(snapshot.muted));
      const nextRowKey = [snapshot.selectedId,playing,...snapshot.availableIds].join('|');
      if (nextRowKey !== rowKey) { rowKey = nextRowKey; renderTracks(snapshot); }
    }

    on('click', event => {
      if (event.target.closest('[data-music-external]')) session.pause('播放已暂停，可到平台收听。');
      const action = event.target.closest('[data-music-action]');
      if (!action || !container.contains(action)) return;
      const id = action.dataset.id;
      switch (action.dataset.musicAction) {
        case 'select': session.select(id); break;
        case 'play-track': void session.play(id); break;
        case 'toggle': if (['playing','loading'].includes(session.getState().status)) session.pause(); else void session.play(); break;
        case 'previous': void session.next(-1); break;
        case 'next': void session.next(1); break;
        case 'mute': session.toggleMute(); break;
        case 'reset-filters': query='';album='';version='';find('#music-search').value='';find('#music-album').value='';find('#music-version').value='';renderTracks(session.getState());break;
      }
    });
    on('input', event => {
      if (event.target.id === 'music-search') { query = event.target.value; renderTracks(session.getState()); }
      else if (event.target.id === 'music-seek') session.seek(event.target.value);
      else if (event.target.id === 'music-volume') session.setVolume(event.target.value);
    });
    on('change', event => {
      if (event.target.id === 'music-album') { album=event.target.value; renderTracks(session.getState()); }
      else if (event.target.id === 'music-version') { version=event.target.value; renderTracks(session.getState()); }
    });
    let unsubscribe = () => {};
    view = {container, destroy() { unsubscribe(); for (const [name, listener] of handlers) container.removeEventListener(name, listener); }};
    unsubscribe = session.subscribe(update);
    renderTracks(session.getState());
  }

  window.addEventListener('nau:audio-pause', () => session?.pause('已暂停播放。回到音乐栏目后可继续。'));
  window.addEventListener('pagehide', event => {
    session?.pause();
    if (event.persisted) return;
    view?.destroy();
    view = null;
    session?.dispose();
    session = null;
    sessionKey = '';
  });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) session?.pause(); });
  window.NAUMusic = {mount, leave, isMounted:() => Boolean(view), createPlayer, safeAudioUrl, safeListeningUrl, renderMarkup, formatTime};
})();
