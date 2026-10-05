(() => {
  'use strict';

  /* ===================== Analytics =====================
     Vercel Web Analytics. Chosen because the script and the beacon are both
     same-origin (/_vercel/...), so the strict CSP needs no relaxing, and because
     it is cookieless: no identifier is stored on the device and nothing is sent
     to a third party. Until it is switched on in the Vercel dashboard the script
     404s, the queue below simply never drains, and nothing on the page notices. */
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  (function () {
    // the endpoint only exists on Vercel, so asking for it anywhere else is a
    // guaranteed 404 in the console for no benefit
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
    if (local) return;
    const tag = document.createElement('script');
    tag.defer = true;
    tag.src = '/_vercel/insights/script.js';   // same origin: allowed by script-src 'self'
    document.head.appendChild(tag);
  })();

  /* One helper for every conversion event. Never send a name, a phone number,
     an address or a cart total: only what was clicked, and which dish. */
  function track(name, data) {
    try { window.va('event', data ? { name: name, data: data } : { name: name }); }
    catch (e) { /* analytics must never break the page */ }
  }

  addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('tel:')) track('phone_click');
      else if (href.includes('wa.me')) track('whatsapp_click');
      else if (href.includes('waze.com') || href.includes('google.com/maps')) track('directions_click');
      else if (href.includes('plweb.online')) track('order_site_click');
      return;
    }
    const add = e.target.closest('.add-btn');
    if (add) track('add_to_cart', { dish: add.dataset.add });
  }, { passive: true });

  /* ===================== Installable app, and honest offline =====================
     The worker keeps the shell so the page opens without a connection. HTML is
     always fetched network-first, so nobody reads a stale price while online;
     when a cached copy is served offline the bar below says so out loud. */
  if ('serviceWorker' in navigator && window.isSecureContext) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        // a new version installs in the background; take it on the next visit
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage('skip-waiting');
            }
          });
        });
      }).catch(() => { /* no worker is not a failure the visitor should see */ });
    });
  }

  const offlineBar = document.getElementById('offlineBar');
  function paintOnline() {
    const off = !navigator.onLine;
    if (offlineBar) offlineBar.hidden = !off;
    document.body.classList.toggle('is-offline', off);
  }
  addEventListener('online', paintOnline);
  addEventListener('offline', paintOnline);
  paintOnline();

  /* ===================== Hero scrub ===================== */
  const hero = document.getElementById('hero');
  const stage = document.querySelector('.hero-stage');
  const video = document.getElementById('heroVideo');
  const ring = document.querySelector('.ring');
  const bandsEls = [...document.querySelectorAll('.band')];

  // h264 gets hardware-decoded almost everywhere, which is what keeps seeking smooth;
  // the webm is for builds that ship without it
  const canH264 = video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '';
  const VIDEO_URL = canH264 ? 'assets/hero-scrub.mp4' : 'assets/hero-scrub.webm';
  const VIDEO_TYPE = canH264 ? 'video/mp4' : 'video/webm';
  const VIDEO_BYTES = canH264 ? 4542753 : 2858657; // the fallback when Content-Length is missing
  const posterLayer = document.querySelector('.poster');

  /* split visual copy into word spans once, so entrances have something to drive */
  function splitWords(root) {
    if (root.querySelector('.w')) return;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          if (!parts.some(p => p.trim())) return;
          const frag = document.createDocumentFragment();
          parts.forEach(part => {
            if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
            const span = document.createElement('span');
            span.className = 'w';
            span.textContent = part;
            frag.appendChild(span);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(root);
  }
  document.querySelectorAll('.band .visual').forEach(splitWords);

  const bands = bandsEls.map(el => {
    const [a, b] = el.dataset.range.split(',').map(Number);
    return { el, a, b, op: -1, k: -1, words: [...el.querySelectorAll('.w')] };
  });

  // seed word thresholds so "random" stagger is identical every load
  function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }
  bands.forEach((band, bi) => {
    const r = rng(bi + 7);
    band.words.forEach((w, i) => {
      const th = (i / Math.max(1, band.words.length)) * 0.34 + r() * 0.05;
      w.style.setProperty('--th', th.toFixed(3));
    });
  });

  function heroProgress() {
    const rect = hero.getBoundingClientRect();
    const total = hero.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const p = -rect.top / total;
    return Math.min(1, Math.max(0, p));
  }

  const smoothstep = (p, e0, e1) => {
    if (e0 === e1) return p >= e1 ? 1 : 0;
    const t = Math.min(1, Math.max(0, (p - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  let loadK = 0;
  const loadStart = performance.now();

  function updateCaptions(p) {
    bands.forEach((band, i) => {
      const { a, b } = band;
      const f = Math.min(0.02, (b - a) / 3);
      let opacity;
      if (i === 0) opacity = 1 - smoothstep(p, b - f, b);
      else if (i === bands.length - 1) opacity = smoothstep(p, a, a + f);
      else opacity = smoothstep(p, a, a + f) * (1 - smoothstep(p, b - f, b));

      const ramp = Math.min(0.05, (b - a) * 0.55);   // longer assembly, so words settle smoothly
      let k = Math.min(1, Math.max(0, (p - a) / ramp));
      if (i === 0) k = Math.max(k, loadK); // band one opens settled, then hands over to scroll

      if (Math.abs(opacity - band.op) > 0.004) {
        band.op = opacity;
        band.el.style.opacity = opacity.toFixed(3);
      }
      if (Math.abs(k - band.k) > 0.008) {
        band.k = k;
        band.el.style.setProperty('--k', k.toFixed(3));
      }
    });
    const settled = p > 0.98;
    if (settled !== stage.classList.contains('at-end')) {
      stage.classList.toggle('at-end', settled);
      const settleBand = bands[bands.length - 1];
      if (settleBand) settleBand.el.inert = !settled; // keep hidden CTAs out of the tab order
    }
  }

  function driveLoadRamp(now) {
    loadK = Math.min(1, (now - loadStart) / 1500);
    if (scrubOn) updateCaptions(heroProgress());
    if (loadK < 1) requestAnimationFrame(driveLoadRamp);
  }
  requestAnimationFrame(driveLoadRamp);

  /* seek gating */
  let seekBusy = false;
  let pendingTime = null;
  function requestSeek(t) {
    if (!video.duration || !isFinite(video.duration)) return;
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true;
    try { video.currentTime = t; } catch (e) { seekBusy = false; }
  }
  video.addEventListener('seeked', () => {
    seekBusy = false;
    if (pendingTime !== null) {
      const t = pendingTime;
      pendingTime = null;
      requestSeek(t);
    }
  });
  video.addEventListener('error', () => {
    seekBusy = false; pendingTime = null;
    failVideo();
  });

  /* rAF lerp loop, rests when converged and off-screen */
  let target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true;
  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    const k = 0.11;   // gentler catch-up: the footage glides instead of snapping
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) {
      shown = target; rafId = null; lastTick = 0;
    } else {
      rafId = requestAnimationFrame(tick);
    }
    if (video.duration) requestSeek(shown * video.duration);
    updateCaptions(shown);
  }
  function onScroll() {
    target = heroProgress();
    updateCaptions(target); // keeps static-hero-less paths responsive even pre-video
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }
  new IntersectionObserver(([entry]) => { heroOnScreen = entry.isIntersecting; }, { threshold: 0 }).observe(hero);

  /* streamed blob fetch with loading ring; the poster wins the bandwidth race by design */
  let blobStarted = false;
  function startBlobFetch() {
    if (blobStarted) return;
    blobStarted = true;
    loadHeroBlob().catch(failVideo);
  }
  let heroInited = false;
  function initHeroOnce() {
    if (heroInited) return;
    heroInited = true;
    posterLayer.style.backgroundImage = "url('assets/hero-poster.jpg')";
    const posterImg = new Image();
    posterImg.onload = startBlobFetch;
    posterImg.onerror = startBlobFetch;
    posterImg.src = 'assets/hero-poster.jpg';
    setTimeout(startBlobFetch, 4000);
  }

  function attachVideo(src) {
    video.src = src;
    video.load();
    video.addEventListener('canplay', () => {
      requestSeek(heroProgress() * video.duration);
      stage.classList.add('video-ready');
    }, { once: true });
  }

  async function loadHeroBlob() {
    if (VIDEO_URL.startsWith('data:')) {   // single-file build: the video already ships with the page
      if (ring) ring.style.setProperty('--ld', 0);
      attachVideo(VIDEO_URL);
      return;
    }
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error('video missing');
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value);
      got += value.length;
      const frac = Math.min(1, got / total);
      const now = performance.now();
      if (now - lastRing > 100 || frac === 1) {
        lastRing = now;
        if (ring) ring.style.setProperty('--ld', Math.round(126 * (1 - frac)));
      }
    }
    clearTimeout(watchdog);
    if (ring) ring.style.setProperty('--ld', 0);
    attachVideo(URL.createObjectURL(new Blob(chunks, { type: VIDEO_TYPE })));
  }

  function failVideo() {
    stage.classList.add('video-failed');
  }

  /* ===================== Static-hero gates (must match CSS exactly) ===================== */
  const GATES = ['(prefers-reduced-motion: reduce)'];

  /* The hero is a 4.4MB download. That is a fair trade on wifi and an unfair one
     on a metered or 2G connection, so those visitors get the static hero — the
     same page, the same words, no video fetched at all. */
  function meteredConnection() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return false;
    if (c.saveData === true) return true;
    return c.effectiveType === '2g' || c.effectiveType === 'slow-2g';
  }

  let scrubOn = false;
  let motionOff = false;   // set by the accessibility panel
  function pinToFinalStates() {
    bands.forEach(b => {
      b.el.style.opacity = '1';
      b.el.style.setProperty('--k', '1');
    });
    const settleBand = bands[bands.length - 1];
    if (settleBand) settleBand.el.inert = false;
    stage.classList.add('at-end');
  }
  function unpinFinalStates() {
    bands.forEach(b => { b.op = -1; b.k = -1; });
  }
  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    unpinFinalStates();
    updateCaptions(heroProgress());
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    pinToFinalStates();
  }
  function applyHeroMode() {
    const metered = meteredConnection();
    // the media query already styles the reduced-motion case; this covers the rest
    hero.classList.toggle('hero-static', metered);
    if (motionOff || metered || GATES.some(q => matchMedia(q).matches)) {
      disableScrub();
      pinToFinalStates();   // also on a first load that never armed the scrub
    } else {
      enableScrub();
    }
  }
  const MQLS = GATES.map(q => matchMedia(q));
  MQLS.forEach(m => m.addEventListener('change', applyHeroMode));
  // if the connection improves, the hero can come alive without a reload
  const conn = navigator.connection;
  if (conn && conn.addEventListener) conn.addEventListener('change', applyHeroMode);
  applyHeroMode();

  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
    if (e.matches) { disableScrub(); pinToFinalStates(); }
    else applyHeroMode();
  });

  /* pause offscreen/hidden-tab loops */
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('paused', document.hidden);
  });

  /* ===================== Scroll reveal entrances ===================== */
  const revealEls = [...document.querySelectorAll('.reveal')];
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => revealObserver.observe(el));


  /* ===================== Open / closed, on Israel time ===================== */
  const HOURS = [
    { label: 'יום ראשון', open: 9 * 60, close: 20 * 60, text: '9:00–20:00' },
    { label: 'יום שני', open: 9 * 60, close: 20 * 60, text: '9:00–20:00' },
    { label: 'יום שלישי', open: 9 * 60, close: 20 * 60, text: '9:00–20:00' },
    { label: 'יום רביעי', open: 9 * 60, close: 20 * 60, text: '9:00–20:00' },
    { label: 'יום חמישי', open: 9 * 60, close: 20 * 60, text: '9:00–20:00' },
    { label: 'יום שישי', open: 8 * 60 + 30, close: 15 * 60 + 30, text: '8:30–15:30' },
    { label: 'יום שבת', closed: true, text: 'סגור' }
  ];
  const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // the kitchen is in Holon, so the clock that matters is Israel's, not the visitor's
  function israelNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      const get = type => parts.find(p => p.type === type).value;
      const day = DAY_INDEX[get('weekday')];
      const hour = Number(get('hour')) % 24;
      return { day, minutes: hour * 60 + Number(get('minute')) };
    } catch (e) {
      const d = new Date();
      return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
    }
  }

  function fmt(minutes) {
    const h = Math.floor(minutes / 60);
    const m = String(minutes % 60).padStart(2, '0');
    return h + ':' + m;
  }

  function openState() {
    const { day, minutes } = israelNow();
    const today = HOURS[day];
    if (!today.closed && minutes >= today.open && minutes < today.close) {
      return { day, open: true, label: 'פתוח עכשיו', detail: 'היום ' + today.text };
    }
    if (!today.closed && minutes < today.open) {
      return { day, open: false, label: 'סגור עכשיו', detail: 'נפתח היום ב־' + fmt(today.open) };
    }
    for (let step = 1; step <= 7; step++) {
      const next = HOURS[(day + step) % 7];
      if (next.closed) continue;
      const when = step === 1 ? 'מחר' : 'ב' + next.label;
      return { day, open: false, label: 'סגור עכשיו', detail: 'נפתח ' + when + ' ב־' + fmt(next.open) };
    }
    return { day, open: false, label: 'סגור עכשיו', detail: '' };
  }

  const statusPills = [...document.querySelectorAll('.status-pill')];
  const hoursRows = [...document.querySelectorAll('#hoursList li')];

  function paintStatus() {
    const state = openState();
    statusPills.forEach(pill => {
      pill.classList.toggle('status-open', state.open);
      pill.classList.toggle('status-closed', !state.open);
      pill.textContent = '';
      const label = document.createElement('span');
      label.textContent = state.label;
      pill.appendChild(label);
      if (state.detail) {
        const detail = document.createElement('span');
        detail.className = 'status-hours';
        detail.textContent = '· ' + state.detail;
        pill.appendChild(detail);
      }
      pill.hidden = false;
    });
    hoursRows.forEach(row => {
      row.classList.toggle('today', Number(row.dataset.day) === state.day);
    });
  }
  paintStatus();
  setInterval(paintStatus, 60000);   // a page left open stays honest



  /* the footer year never goes stale */
  const yearOut = document.getElementById('year');
  if (yearOut) yearOut.textContent = new Date().getFullYear();


  /* ===================== A light that follows the pointer ===================== */
  const glowLayer = document.querySelector('.cursor-glow');
  if (glowLayer) {   // CSS decides whether the light shows; the listener just tracks the pointer
    let px = 0, py = 0, glowQueued = false, currentCard = null;
    const paintGlow = () => {
      glowQueued = false;
      document.body.style.setProperty('--mx', px + 'px');
      document.body.style.setProperty('--my', py + 'px');
      if (currentCard) {
        const r = currentCard.getBoundingClientRect();
        currentCard.style.setProperty('--cx', (px - r.left) + 'px');
        currentCard.style.setProperty('--cy', (py - r.top) + 'px');
      }
    };
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
      px = e.clientX; py = e.clientY;
      const card = e.target.closest ? e.target.closest('.glow-card') : null;
      if (card !== currentCard) currentCard = card;
      document.body.classList.add('pointer-light');
      if (!glowQueued) { glowQueued = true; requestAnimationFrame(paintGlow); }
    }, { passive: true });
    addEventListener('pointerleave', () => document.body.classList.remove('pointer-light'));
    document.addEventListener('mouseleave', () => document.body.classList.remove('pointer-light'));
  }


  /* ===================== One turn per review, per pointer entry ===================== */
  const fineHover = () => matchMedia('(hover:hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.review').forEach(card => {
    card.addEventListener('pointerenter', e => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
      if (motionOff || !fineHover()) return;
      if (card.classList.contains('turning')) return;
      card.classList.add('turning');
    });
    card.addEventListener('animationend', e => {
      if (e.animationName === 'reviewTurn') card.classList.remove('turning');
    });
  });

  /* ===================== Menu search and filters ===================== */
  const menuSearch = document.getElementById('menuSearch');
  const searchClear = document.getElementById('searchClear');
  const menuChips = document.getElementById('menuChips');
  const menuCount = document.getElementById('menuCount');
  // re-read on every pass: the admin panel can replace the whole menu at runtime
  let menuCats = [...document.querySelectorAll('.menu-cat')];
  let dishRows = [...document.querySelectorAll('.dish-row')];
  document.addEventListener('sisi:menu-replaced', () => {
    menuCats = [...document.querySelectorAll('.menu-cat')];
    dishRows = [...document.querySelectorAll('.dish-row')];
    applyMenuFilter();
  });
  let activeFilter = 'all';

  const emptyNote = document.createElement('p');
  emptyNote.className = 'menu-empty';
  emptyNote.hidden = true;
  emptyNote.textContent = 'לא מצאנו מנה כזו. אפשר לנקות את החיפוש, או פשוט להתקשר ולשאול.';
  document.querySelector('.menu-cats').after(emptyNote);

  function matchesFilter(row) {
    if (activeFilter === 'all') return true;
    const [kind, value] = activeFilter.split(/:(.+)/);
    if (kind === 'cat') return row.dataset.cat === value;
    if (kind === 'tag') {
      const tags = row.dataset.tags.split('|');
      // "חריף" also covers "חריף מאוד"
      return tags.some(t => t === value || t.startsWith(value + ' '));
    }
    return true;
  }

  function applyMenuFilter() {
    const q = menuSearch.value.trim().toLowerCase();
    let shown = 0;
    dishRows.forEach(row => {
      const hit = (!q || row.dataset.search.toLowerCase().includes(q)) && matchesFilter(row);
      row.hidden = !hit;
      if (hit) shown++;
    });
    menuCats.forEach(cat => {
      cat.hidden = ![...cat.querySelectorAll('.dish-row')].some(row => !row.hidden);
    });
    emptyNote.hidden = shown > 0;
    searchClear.hidden = q === '';
    if (!q && activeFilter === 'all') menuCount.textContent = '';
    else menuCount.textContent = shown === 1 ? 'מנה אחת' : shown + ' מנות';
  }

  menuSearch.addEventListener('input', applyMenuFilter);
  searchClear.addEventListener('click', () => {
    menuSearch.value = '';
    applyMenuFilter();
    menuSearch.focus();
  });
  menuChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    menuChips.querySelectorAll('.chip').forEach(c => {
      const on = c === chip;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    applyMenuFilter();
  });
  applyMenuFilter();

  /* ===================== Floating rails, back to top, accessibility ===================== */
  const railTop = document.getElementById('railTop');
  const railBottom = document.getElementById('railBottom');
  const toTop = document.getElementById('toTop');
  const a11yBtn = document.getElementById('a11yBtn');
  const a11yPanel = document.getElementById('a11yPanel');

  let railsShown = null, railTick = false;
  var onRailsToggle = null;   // the basket hooks in here once it is set up
  function updateRails() {
    railTick = false;
    const show = window.scrollY > hero.offsetHeight * 0.88;   // once the opening journey has played
    if (show === railsShown) return;
    railsShown = show;
    if (show) {
      railTop.hidden = false;
      requestAnimationFrame(() => railTop.classList.add('visible'));
    } else {
      railTop.classList.remove('visible');
      setTimeout(() => { if (!railsShown) railTop.hidden = true; }, 500);
    }
    // back to top only earns its place once there is something to go back from
    toTop.hidden = !show;
    if (onRailsToggle) onRailsToggle();
  }
  addEventListener('scroll', () => {
    if (!railTick) { railTick = true; requestAnimationFrame(updateRails); }
  }, { passive: true });
  railBottom.hidden = false;
  requestAnimationFrame(() => railBottom.classList.add('visible'));
  updateRails();

  const stillPrefersMotion = () => !motionOff && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  toTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: stillPrefersMotion() ? 'smooth' : 'auto' });
  });

  /* the accessibility panel */
  const SCALES = [100, 112, 125, 140, 160];
  const PREFS_KEY = 'sisi-a11y';
  const DEFAULTS = {
    scale: 100, spacing: false, readable: false, contrast: false, mono: false,
    links: false, headings: false, focus: false, cursor: false, nomotion: false
  };
  const LABELS = {
    spacing: 'ריווח טקסט מוגדל', readable: 'גופן קריא', contrast: 'ניגודיות גבוהה',
    mono: 'גווני אפור', links: 'הדגשת קישורים', headings: 'הדגשת כותרות',
    focus: 'סימון מיקוד מודגש', cursor: 'סמן עכבר גדול', nomotion: 'עצירת אנימציות'
  };
  let prefs = Object.assign({}, DEFAULTS);

  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (saved && typeof saved === 'object') prefs = Object.assign(prefs, saved);
  } catch (e) { /* private mode, or storage blocked: defaults are fine */ }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* nothing to do */ }
  }

  const a11yStatus = document.getElementById('a11yStatus');
  function announce(msg) { if (a11yStatus) a11yStatus.textContent = msg; }

  function applyPrefs() {
    document.documentElement.style.fontSize = prefs.scale + '%';
    Object.keys(LABELS).forEach(key => {
      document.body.classList.toggle('a11y-' + key, !!prefs[key]);
    });
    document.documentElement.classList.toggle('no-smooth', prefs.nomotion);
    const scaleOut = document.getElementById('a11yScale');
    if (scaleOut) scaleOut.textContent = prefs.scale + '%';
    a11yPanel.querySelectorAll('.a11y-toggle').forEach(btn => {
      btn.setAttribute('aria-pressed', String(!!prefs[btn.dataset.a11y]));
    });
    // the size buttons stop responding at the ends, so say so rather than going quiet
    const lo = prefs.scale === SCALES[0], hi = prefs.scale === SCALES[SCALES.length - 1];
    const down = a11yPanel.querySelector('[data-a11y="text-down"]');
    const up = a11yPanel.querySelector('[data-a11y="text-up"]');
    if (down) down.disabled = lo;
    if (up) up.disabled = hi;
    if (prefs.nomotion !== motionOff) {
      motionOff = prefs.nomotion;
      applyHeroMode();
      if (motionOff) pinToFinalStates();
    }
  }

  const focusablesIn = el => [...el.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(n => n.offsetParent !== null || n === document.activeElement);

  function openA11y() {
    a11yPanel.hidden = false;
    // sit just above the button itself, which moves depending on whether
    // back-to-top is in the rail yet
    const r = a11yBtn.getBoundingClientRect();
    a11yPanel.style.bottom = Math.round(window.innerHeight - r.top + 10) + 'px';
    // the room above the button, but never so much of the screen that the page
    // disappears behind the panel
    const room = r.top - 22;
    const cap = window.innerHeight * (window.innerWidth <= 640 ? 0.55 : 0.7);
    a11yPanel.style.maxHeight = Math.round(Math.max(260, Math.min(room, cap))) + 'px';
    a11yBtn.setAttribute('aria-expanded', 'true');
    // the first control can be disabled (text-down at 100%), so take the first live one
    const first = focusablesIn(a11yPanel)[0];
    if (first) first.focus();
    markScrollEnd();
  }
  function closeA11y() {
    if (a11yPanel.hidden) return;
    a11yPanel.hidden = true;
    a11yBtn.setAttribute('aria-expanded', 'false');
  }
  a11yBtn.addEventListener('click', () => {
    a11yPanel.hidden ? openA11y() : closeA11y();
  });
  document.getElementById('a11yClose').addEventListener('click', () => { closeA11y(); a11yBtn.focus(); });

  // reachable on the first Tab, without walking the whole page first
  // drop the fade once the list is scrolled to its end
  const a11yScroll = a11yPanel.querySelector('.a11y-scroll');
  const markScrollEnd = () => {
    if (!a11yScroll) return;
    const done = a11yScroll.scrollTop + a11yScroll.clientHeight >= a11yScroll.scrollHeight - 2;
    a11yScroll.classList.toggle('at-end', done);
  };
  if (a11yScroll) a11yScroll.addEventListener('scroll', markScrollEnd, { passive: true });

  const skipA11y = document.getElementById('skipA11y');
  if (skipA11y) skipA11y.addEventListener('click', () => { if (a11yPanel.hidden) openA11y(); else a11yPanel.querySelector('.a11y-btn').focus(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !a11yPanel.hidden) { closeA11y(); a11yBtn.focus(); return; }
    // while it is open, Tab stays inside it
    if (e.key === 'Tab' && !a11yPanel.hidden) {
      const items = focusablesIn(a11yPanel);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!a11yPanel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('pointerdown', e => {
    if (a11yPanel.hidden) return;
    if (!a11yPanel.contains(e.target) && !a11yBtn.contains(e.target)) closeA11y();
  });

  a11yPanel.addEventListener('click', e => {
    const action = e.target.closest('[data-a11y]');
    if (!action) return;
    const kind = action.dataset.a11y;
    if (kind === 'text-up' || kind === 'text-down') {
      const i = SCALES.indexOf(prefs.scale);
      const next = kind === 'text-up' ? Math.min(SCALES.length - 1, i + 1) : Math.max(0, i - 1);
      prefs.scale = SCALES[next];
      applyPrefs(); savePrefs();
      announce('גודל טקסט ' + prefs.scale + ' אחוז');
      return;
    }
    if (kind === 'reset') {
      prefs = Object.assign({}, DEFAULTS);
      applyPrefs(); savePrefs();
      announce('כל הגדרות הנגישות אופסו');
      return;
    }
    if (kind in prefs) {
      prefs[kind] = !prefs[kind];
      applyPrefs(); savePrefs();
      announce(LABELS[kind] + (prefs[kind] ? ' פועל' : ' כבוי'));
    }
  });

  applyPrefs();


  /* ===================== The order basket ===================== */
  const ORDER_URL = 'https://order.plweb.online/wl/629438';
  const CART_KEY = 'sisi-cart';
  const cartFab = document.getElementById('cartFab');
  const cartPanel = document.getElementById('cartPanel');
  const cartList = document.getElementById('cartList');
  const cartBadge = document.getElementById('cartBadge');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartTotal = document.getElementById('cartTotal');
  const cartNote = document.getElementById('cartNote');

  const MAX_QTY = 99;
  // stored state is not to be trusted: a string qty turned "5" + 1 into "51",
  // and nothing stopped a fractional or nine-digit quantity
  const cleanQty = v => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_QTY) : 0;
  };

  let cart = [];
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (Array.isArray(saved)) {
      cart = saved
        .filter(i => i && typeof i.name === 'string' && i.name)
        .map(i => ({ name: i.name, price: typeof i.price === 'string' ? i.price : '', qty: cleanQty(i.qty) }))
        .filter(i => i.qty > 0);
    }
  } catch (e) { /* storage blocked: start empty */ }

  const saveCart = () => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* nothing to do */ }
  };
  const priceOf = item => {
    const raw = String(item.price);
    if (/-/.test(raw)) return null;            // a negative price is not a price
    const n = parseFloat(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const countItems = () => cart.reduce((sum, i) => sum + i.qty, 0);

  function renderCart() {
    const count = countItems();
    cartBadge.textContent = count;
    cartFab.hidden = !railsShown;   // appears with the rest, once the opening has played
    cartEmpty.hidden = count > 0;
    cartList.textContent = '';

    cart.forEach(item => {
      const li = document.createElement('li');
      li.className = 'cart-item';

      const qty = document.createElement('div');
      qty.className = 'qty';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'הפחתת כמות של ' + item.name);
      minus.addEventListener('click', () => changeQty(item.name, -1));
      const out = document.createElement('output');
      out.textContent = item.qty;
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'הוספת כמות של ' + item.name);
      plus.disabled = item.qty >= MAX_QTY;
      plus.addEventListener('click', () => changeQty(item.name, 1));
      qty.append(minus, out, plus);

      const name = document.createElement('span');
      name.className = 'cart-item-name';
      name.textContent = item.name;

      const price = document.createElement('span');
      price.className = 'cart-item-price';
      const unit = priceOf(item);
      price.textContent = unit === null ? 'בטלפון' : (unit * item.qty) + ' ₪';

      li.append(qty, name, price);
      cartList.appendChild(li);
    });

    const known = cart.filter(i => priceOf(i) !== null);
    const sum = known.reduce((acc, i) => acc + priceOf(i) * i.qty, 0);
    const missing = cart.length - known.length;
    cartTotal.hidden = count === 0;
    if (count > 0) {
      cartTotal.textContent = '';
      const label = document.createElement('span');
      label.textContent = missing ? 'סכום ביניים' : 'סה״כ';
      const value = document.createElement('span');
      value.className = 'sum';
      value.textContent = sum + ' ₪';
      cartTotal.append(label, value);
    }
    cartNote.textContent = missing
      ? 'מחיר של ' + missing + ' פריטים נמסר בטלפון. הרשימה מועתקת אליכם, ואז נפתח אתר ההזמנות של המסעדה.'
      : 'הרשימה מועתקת אליכם, ואז נפתח אתר ההזמנות של המסעדה כדי להשלים שם את ההזמנה.';
  }

  function changeQty(name, delta) {
    const item = cart.find(i => i.name === name);
    if (!item) return;
    item.qty = cleanQty(cleanQty(item.qty) + delta);
    if (item.qty <= 0) cart = cart.filter(i => i.name !== name);
    saveCart();
    renderCart();
  }

  function addToCart(name, price, btn) {
    const item = cart.find(i => i.name === name);
    if (item) item.qty = cleanQty(cleanQty(item.qty) + 1);
    else cart.push({ name, price, qty: 1 });
    saveCart();
    renderCart();
    cartFab.classList.remove('bump');
    void cartFab.offsetWidth;          // restart the bump animation
    cartFab.classList.add('bump');
    if (btn) {
      btn.classList.add('added');
      btn.firstElementChild.textContent = '✓';
      setTimeout(() => {
        btn.classList.remove('added');
        btn.firstElementChild.textContent = '+';
      }, 1100);
    }
  }

  // delegated, so buttons rendered later by the live menu work without rebinding
  document.addEventListener('click', e => {
    const btn = e.target.closest('.add-btn');
    if (btn) addToCart(btn.dataset.add, btn.dataset.price, btn);
  });

  function orderText() {
    const lines = ['הזמנה מהתנור של סבתא סיסי', ''];
    cart.forEach(i => {
      const unit = priceOf(i);
      lines.push(i.qty + ' × ' + i.name + (unit === null ? ' (מחיר בטלפון)' : ' (' + unit * i.qty + ' ₪)'));
    });
    const sum = cart.filter(i => priceOf(i) !== null).reduce((a, i) => a + priceOf(i) * i.qty, 0);
    lines.push('', 'סה״כ למנות עם מחיר: ' + sum + ' ₪');
    return lines.join('\n');
  }

  // the copy has to run inside the click itself, or Safari and Firefox drop the gesture
  function copyOrderSync(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function openCart() {
    cartPanel.hidden = false;
    cartFab.setAttribute('aria-expanded', 'true');
    document.getElementById('cartClose').focus();
  }
  function closeCart() {
    if (cartPanel.hidden) return;
    cartPanel.hidden = true;
    cartFab.setAttribute('aria-expanded', 'false');
  }
  cartFab.addEventListener('click', () => {
    if (cartPanel.hidden) track('begin_checkout', { items: countItems() });
    cartPanel.hidden ? openCart() : closeCart();
  });
  document.getElementById('cartClose').addEventListener('click', () => { closeCart(); cartFab.focus(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !cartPanel.hidden) { closeCart(); cartFab.focus(); }
  });
  document.addEventListener('pointerdown', e => {
    if (cartPanel.hidden) return;
    if (!cartPanel.contains(e.target) && !cartFab.contains(e.target)) closeCart();
  });

  document.getElementById('cartOrder').addEventListener('click', () => {
    if (!cart.length) { cartNote.textContent = 'קודם מוסיפים מנות מהתפריט, ואז אפשר להזמין.'; return; }
    const text = orderText();
    let copied = copyOrderSync(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        copied = true;
        cartNote.textContent = 'ההזמנה הועתקה ללוח. אתר ההזמנות נפתח בלשונית חדשה, ושם משלימים את ההזמנה.';
      }).catch(() => { /* the sync path already reported what happened */ });
    }
    track('order_handoff', { items: countItems() });
    window.open(ORDER_URL, '_blank', 'noopener');   // still inside the click
    cartNote.textContent = copied
      ? 'ההזמנה הועתקה ללוח. אתר ההזמנות נפתח בלשונית חדשה, ושם משלימים את ההזמנה.'
      : 'אתר ההזמנות נפתח. אם ההעתקה לא נתפסה, אפשר לשלוח את ההזמנה בוואטסאפ.';
  });

  document.getElementById('cartWhatsapp').addEventListener('click', () => {
    if (!cart.length) { cartNote.textContent = 'קודם מוסיפים מנות מהתפריט, ואז אפשר לשלוח.'; return; }
    track('whatsapp_order', { items: countItems() });
    window.open('https://wa.me/972526299357?text=' + encodeURIComponent(orderText()), '_blank', 'noopener');
  });

  document.getElementById('cartClear').addEventListener('click', () => {
    cart = [];
    saveCart();
    renderCart();
    cartNote.textContent = 'ההזמנה נוקתה.';
  });

  onRailsToggle = renderCart;
  renderCart();

})();
