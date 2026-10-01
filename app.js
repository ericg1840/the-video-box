(function () {
  "use strict";

  const STORAGE_KEY = "videobox.custom";
  const CODE_LEN = 4;               // digits in a request code
  const CUSTOM_FIRST = 9900;        // viewer-added videos use 9900-9999
  const QUEUE_TARGET = 3;           // keep this many videos in "Coming up"
  const LOWER_THIRD_MS = 9000;      // how long the code/title graphic stays up
  const STATIC_MS = 650;            // static burst between videos
  const MAX_CONSECUTIVE_ERRORS = 10;

  // Phantom callers who "order" videos when you haven't.
  const CITIES = [
    "Miami, FL", "Tulsa, OK", "Cleveland, OH", "Fresno, CA", "Boise, ID", "Omaha, NE",
    "Memphis, TN", "Spokane, WA", "Albany, NY", "Duluth, MN", "El Paso, TX", "Mobile, AL",
    "Tucson, AZ", "Dayton, OH", "Reno, NV", "Akron, OH", "Toledo, OH", "Wichita, KS",
    "Peoria, IL", "Macon, GA", "Flint, MI", "Erie, PA", "Shreveport, LA", "Provo, UT",
  ];

  const GENRE_LABELS = {
    pop: "Pop",
    rock: "Rock",
    "70s": "70s",
    "80s": "80s",
    "90s": "90s",
    "90s-rock": "90s Rock",
    "2000s": "2000s",
    "hip-hop": "Hip-Hop",
    latin: "Latin",
    funk: "Funk",
    indie: "Indie",
    electronic: "Electronic",
    country: "Country",
    custom: "Viewer Picks",
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    powerScreen: $("power-screen"),
    power: $("power"),
    toggle: $("toggle"),
    skip: $("skip"),
    led: $("led"),
    staticEl: $("static"),
    lowerThird: $("lower-third"),
    ltCode: $("lt-code"),
    ltArtist: $("lt-artist"),
    ltTitle: $("lt-title"),
    ltFrom: $("lt-from"),
    bugCode: $("bug-code"),
    lcd: document.querySelector(".lcd"),
    lcdDigits: $("lcd-digits"),
    lcdMsg: $("lcd-msg"),
    keypad: $("keypad"),
    queue: $("queue"),
    menuTabs: $("menu-tabs"),
    menuList: $("menu-list"),
    addForm: $("add-form"),
    addInput: $("add-input"),
    addStatus: $("add-status"),
    tickerText: $("ticker-text"),
  };

  let player = null;
  let playerReady = false;
  let poweredOn = false;
  let current = null;        // { video, from, mine }
  let queue = [];            // upcoming { video, from, mine }
  let bag = [];              // shuffle bag for phantom requests
  let dialed = "";
  let menuGenre = "all";
  let consecutiveErrors = 0;
  let lowerThirdTimer = 0;
  let lcdResetTimer = 0;
  const broken = new Set();

  // ---------- catalog ----------

  function loadCustom() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((v) => v && typeof v.id === "string") : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustom() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(custom)); } catch (e) { /* ignore */ }
  }

  let custom = loadCustom();

  // Viewer-added videos live in 9900-9999; re-code any saved under an older code scheme.
  custom.forEach((v) => { if (String(v.code).length !== CODE_LEN || Number(v.code) < CUSTOM_FIRST) v.code = null; });
  custom.forEach((v) => { if (!v.code) v.code = nextCustomCode(); });
  custom = custom.filter((v) => v.code);
  saveCustom();

  function catalog() {
    return window.VIDEO_POOL.concat(custom.map((v) => ({ ...v, genre: "custom" })));
  }

  function byCode(code) {
    return catalog().find((v) => v.code === code) || null;
  }

  function nextCustomCode() {
    for (let n = CUSTOM_FIRST; n <= CUSTOM_FIRST + 99; n++) {
      const code = String(n);
      if (!custom.some((v) => v.code === code)) return code;
    }
    return null;
  }

  function parseVideoId(input) {
    const s = input.trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const url = new URL(s);
      if (url.hostname.endsWith("youtu.be")) {
        const id = url.pathname.slice(1, 12);
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[1];
    } catch (e) { /* not a URL */ }
    return null;
  }

  // ---------- queue ----------

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function drawRandom() {
    const busy = new Set(queue.map((q) => q.video.id));
    if (current) busy.add(current.video.id);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!bag.length) {
        bag = catalog().filter((v) => !broken.has(v.id));
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      while (bag.length) {
        const v = bag.shift();
        if (!busy.has(v.id) && !broken.has(v.id)) return v;
      }
    }
    return null;
  }

  function topUpQueue() {
    while (queue.length < QUEUE_TARGET) {
      const v = drawRandom();
      if (!v) break;
      queue.push({ video: v, from: pick(CITIES), mine: false });
    }
  }

  // Your orders go ahead of phantom callers, behind your earlier orders.
  function order(video) {
    if (current && current.video.id === video.id) return { ok: false, msg: "ON THE AIR NOW!" };
    const existing = queue.findIndex((q) => q.video.id === video.id);
    if (existing !== -1 && queue[existing].mine) return { ok: false, msg: "ALREADY ORDERED" };
    if (existing !== -1) queue.splice(existing, 1);
    let pos = queue.findIndex((q) => !q.mine);
    if (pos === -1) pos = queue.length;
    queue.splice(pos, 0, { video, from: "YOU", mine: true });
    renderQueue();
    if (!poweredOn) powerOn();
    return { ok: true, msg: pos === 0 ? "ORDER OK · UP NEXT" : `ORDER OK · #${pos + 1} IN LINE` };
  }

  // ---------- playback ----------

  function playNext() {
    topUpQueue();
    const item = queue.shift();
    topUpQueue();
    if (!item) {
      setLcd(null, "NO VIDEOS AVAILABLE");
      return;
    }
    current = item;
    burstStatic();
    if (playerReady) player.loadVideoById(item.video.id);
    renderNowPlaying();
    renderQueue();
    renderMenu();
  }

  function powerOn() {
    if (poweredOn) return;
    poweredOn = true;
    els.powerScreen.hidden = true;
    els.led.classList.add("on");
    playNext();
  }

  function togglePlay() {
    if (!poweredOn || !playerReady) return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  function skip() {
    if (!poweredOn) powerOn();
    else playNext();
  }

  // ---------- on-screen graphics ----------

  function burstStatic() {
    els.staticEl.classList.add("on");
    hissSound();
    setTimeout(() => els.staticEl.classList.remove("on"), STATIC_MS);
  }

  function showLowerThird() {
    if (!current) return;
    const v = current.video;
    els.ltCode.textContent = v.code;
    els.ltArtist.textContent = v.artist || "";
    els.ltTitle.textContent = v.title ? `"${v.title}"` : "";
    els.ltFrom.textContent = current.mine ? "★ REQUESTED BY YOU ★" : `REQUESTED FROM ${current.from.toUpperCase()}`;
    els.lowerThird.classList.add("show");
    clearTimeout(lowerThirdTimer);
    lowerThirdTimer = setTimeout(() => els.lowerThird.classList.remove("show"), LOWER_THIRD_MS);
  }

  function renderNowPlaying() {
    if (!current) return;
    const v = current.video;
    els.bugCode.textContent = v.code;
    document.title = v.title ? `#${v.code} ${v.title} · The Video Box` : "The Video Box";
  }

  function renderQueue() {
    els.queue.innerHTML = "";
    queue.forEach((q) => {
      const li = document.createElement("li");
      if (q.mine) li.className = "mine";
      const code = document.createElement("span");
      code.className = "q-code";
      code.textContent = q.video.code;
      const meta = document.createElement("div");
      meta.className = "q-meta";
      const t = document.createElement("div");
      t.textContent = [q.video.artist, q.video.title].filter(Boolean).join(" – ") || `Video ${q.video.id}`;
      const f = document.createElement("div");
      f.className = "q-from";
      f.textContent = q.mine ? "★ your order" : `ordered from ${q.from}`;
      meta.append(t, f);
      li.append(code, meta);
      els.queue.appendChild(li);
    });
  }

  function renderMenuTabs() {
    const genres = [...new Set(catalog().map((v) => v.genre))];
    const order = Object.keys(GENRE_LABELS);
    genres.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (menuGenre !== "all" && !genres.includes(menuGenre)) menuGenre = "all";
    els.menuTabs.innerHTML = "";
    ["all", ...genres].forEach((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(g === menuGenre));
      b.textContent = g === "all" ? "All" : GENRE_LABELS[g] || g;
      b.addEventListener("click", () => { menuGenre = g; renderMenuTabs(); renderMenu(); });
      els.menuTabs.appendChild(b);
    });
  }

  function renderMenu() {
    els.menuList.innerHTML = "";
    catalog()
      .filter((v) => menuGenre === "all" || v.genre === menuGenre)
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((v) => {
        const li = document.createElement("li");
        if (current && current.video.id === v.id) li.className = "playing";
        const b = document.createElement("button");
        b.type = "button";
        b.title = `Dial ${v.code}`;
        const code = document.createElement("span");
        code.className = "m-code";
        code.textContent = v.code;
        const meta = document.createElement("div");
        meta.className = "m-meta";
        const a = document.createElement("div");
        a.className = "m-artist";
        a.textContent = v.artist || (v.genre === "custom" ? "Viewer pick" : "");
        const t = document.createElement("div");
        t.textContent = v.title || v.id;
        meta.append(a, t);
        b.append(code, meta);
        b.addEventListener("click", () => dialCode(v.code));
        li.appendChild(b);
        els.menuList.appendChild(li);
      });
  }

  function renderTicker() {
    const items = catalog()
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((v) => `<b>${v.code}</b> ${escapeHtml((v.artist || "VIEWER PICK").toUpperCase())} · ${escapeHtml(v.title || v.id)}`);
    els.tickerText.innerHTML = items.join("&nbsp;&nbsp;★&nbsp;&nbsp;");
    els.tickerText.style.setProperty("--ticker-duration", `${Math.max(40, items.length * 4)}s`);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- keypad ----------

  function setLcd(digits, msg, flash) {
    els.lcdDigits.textContent = digits == null ? formatDialed() : digits;
    els.lcdMsg.textContent = msg;
    if (flash) {
      els.lcd.classList.remove("flash");
      void els.lcd.offsetWidth; // restart animation
      els.lcd.classList.add("flash");
    }
  }

  function formatDialed() {
    return (dialed + "-".repeat(CODE_LEN)).slice(0, CODE_LEN).split("").join(" ");
  }

  function resetLcdSoon() {
    clearTimeout(lcdResetTimer);
    lcdResetTimer = setTimeout(() => { dialed = ""; setLcd(null, "ENTER VIDEO CODE"); }, 2600);
  }

  function pressKey(key) {
    const btn = els.keypad.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (btn) {
      btn.classList.add("pressed");
      setTimeout(() => btn.classList.remove("pressed"), 120);
    }
    dtmf(key);
    clearTimeout(lcdResetTimer);

    if (key === "*") {
      dialed = "";
      setLcd(null, "ENTER VIDEO CODE");
      return;
    }
    if (key === "#") {
      const pool = catalog().filter((v) => !broken.has(v.id));
      if (pool.length) submitCode(pick(pool).code);
      return;
    }
    if (dialed.length >= CODE_LEN) dialed = "";
    dialed += key;
    setLcd(null, dialed.length < CODE_LEN ? "KEEP DIALING…" : "CONNECTING…");
    if (dialed.length === CODE_LEN) setTimeout(() => submitCode(dialed), 250);
  }

  function dialCode(code) {
    dialed = "";
    code.split("").forEach((d, i) => setTimeout(() => pressKey(d), i * 140));
  }

  function submitCode(code) {
    dialed = code;
    const video = byCode(code);
    if (!video) {
      setLcd(null, "INVALID CODE", true);
      busyTone();
    } else if (broken.has(video.id)) {
      setLcd(null, "VIDEO UNAVAILABLE", true);
      busyTone();
    } else {
      const res = order(video);
      setLcd(null, res.msg, true);
      if (res.ok) confirmTone(); else busyTone();
    }
    resetLcdSoon();
  }

  // ---------- sounds (Web Audio, no files) ----------

  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freqs, start, dur, gain = 0.06) {
    const ac = ctx();
    if (!ac) return;
    const t0 = ac.currentTime + start;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.setValueAtTime(gain, t0 + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    g.connect(ac.destination);
    freqs.forEach((f) => {
      const o = ac.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur);
    });
  }

  const DTMF = {
    1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
    4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
    7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
    "*": [941, 1209], 0: [941, 1336], "#": [941, 1477],
  };
  function dtmf(key) { if (DTMF[key]) tone(DTMF[key], 0, 0.12); }
  function confirmTone() { tone([880], 0.05, 0.1); tone([1320], 0.18, 0.16); }
  function busyTone() { tone([480, 620], 0.05, 0.25); tone([480, 620], 0.45, 0.25); }

  function hissSound() {
    const ac = ctx();
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * (STATIC_MS / 1000));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = 0.035;
    src.connect(g).connect(ac.destination);
    src.start();
  }

  // ---------- YouTube IFrame API ----------

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player("player", {
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady: () => {
          playerReady = true;
          if (current) player.loadVideoById(current.video.id);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            consecutiveErrors = 0;
            els.toggle.textContent = "❚❚";
            fillMissingMetadata();
            if (!els.lowerThird.dataset.shownFor || els.lowerThird.dataset.shownFor !== current.video.id + current.from) {
              els.lowerThird.dataset.shownFor = current.video.id + current.from;
              showLowerThird();
            }
          } else if (e.data === YT.PlayerState.PAUSED) {
            els.toggle.textContent = "▶";
          } else if (e.data === YT.PlayerState.ENDED) {
            playNext();
          }
        },
        onError: () => {
          // 100 = removed/private, 101/150 = embedding disabled, 2/5 = bad id / HTML5 error
          if (current) broken.add(current.video.id);
          queue = queue.filter((q) => !broken.has(q.video.id));
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            consecutiveErrors = 0;
            setLcd("- - - -", "SIGNAL LOST · PRESS SKIP");
            return;
          }
          playNext();
        },
      },
    });
  };

  // Custom videos are added by ID only; borrow the title from YouTube once playing.
  function fillMissingMetadata() {
    if (!current || current.video.title) return;
    const data = player.getVideoData && player.getVideoData();
    if (!data || !data.title) return;
    const c = custom.find((x) => x.id === current.video.id);
    current.video.title = data.title;
    current.video.artist = data.author || "";
    if (c) { c.title = current.video.title; c.artist = current.video.artist; saveCustom(); }
    renderMenu();
    renderTicker();
    renderNowPlaying();
  }

  // ---------- wire up ----------

  els.power.addEventListener("click", powerOn);
  els.toggle.addEventListener("click", togglePlay);
  els.skip.addEventListener("click", skip);
  els.keypad.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-key]");
    if (b) pressKey(b.dataset.key);
  });

  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = parseVideoId(els.addInput.value);
    if (!id) { els.addStatus.textContent = "That doesn't look like a YouTube link or video ID."; return; }
    const existing = catalog().find((v) => v.id === id);
    if (existing) { els.addStatus.textContent = `Already on the menu: dial ${existing.code}.`; return; }
    const code = nextCustomCode();
    if (!code) { els.addStatus.textContent = "All 100 viewer slots are full!"; return; }
    custom.push({ code, id });
    saveCustom();
    els.addInput.value = "";
    els.addStatus.textContent = `Programmed! Dial ${code} to order it.`;
    renderMenuTabs();
    renderMenu();
    renderTicker();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key) || e.key === "#" || e.key === "*") { e.preventDefault(); pressKey(e.key); }
    else if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); pressKey("*"); }
    else if (e.key === " " && !e.target.matches("button")) { e.preventDefault(); if (!poweredOn) powerOn(); else togglePlay(); }
    else if (e.key === "s" || e.key === "S") { e.preventDefault(); skip(); }
  });

  topUpQueue();
  renderQueue();
  renderMenuTabs();
  renderMenu();
  renderTicker();
})();
