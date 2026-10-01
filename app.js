(function () {
  "use strict";

  const STORAGE_KEY = "videobox.custom";
  const HISTORY_LIMIT = 20;
  const MAX_CONSECUTIVE_ERRORS = 10;

  const $ = (id) => document.getElementById(id);
  const els = {
    splash: $("splash"),
    start: $("start"),
    prev: $("prev"),
    toggle: $("toggle"),
    next: $("next"),
    genre: $("genre-filter"),
    status: $("status"),
    title: $("np-title"),
    artist: $("np-artist"),
    chip: $("np-genre"),
    history: $("history"),
    addForm: $("add-form"),
    addInput: $("add-input"),
    customList: $("custom-list"),
  };

  let player = null;
  let playerReady = false;
  let started = false;
  let bag = [];          // shuffled queue of upcoming videos
  let history = [];      // videos played, most recent last
  let historyIndex = -1; // position in history when stepping back
  let current = null;
  let consecutiveErrors = 0;
  const broken = new Set();

  // ---------- custom videos (localStorage) ----------

  function loadCustom() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((v) => v && typeof v.id === "string") : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustom(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  let custom = loadCustom();

  function parseVideoId(input) {
    const s = input.trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const url = new URL(s);
      if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1, 12) || null;
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[1];
    } catch (e) { /* not a URL */ }
    return null;
  }

  // ---------- pool / shuffle ----------

  function allVideos() {
    return window.VIDEO_POOL.concat(custom.map((v) => ({ genre: "custom", ...v })));
  }

  function filteredPool() {
    const g = els.genre.value;
    return allVideos().filter((v) => !broken.has(v.id) && (g === "all" || v.genre === g));
  }

  function refillBag() {
    const pool = filteredPool();
    // Fisher–Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Avoid an immediate repeat across bag boundaries
    if (current && pool.length > 1 && pool[0].id === current.id) pool.push(pool.shift());
    bag = pool;
  }

  function drawNext() {
    if (!bag.length) refillBag();
    return bag.shift() || null;
  }

  function populateGenres() {
    const genres = [...new Set(allVideos().map((v) => v.genre).filter(Boolean))].sort();
    const selected = els.genre.value;
    els.genre.innerHTML = '<option value="all">All</option>' +
      genres.map((g) => `<option value="${g}">${g[0].toUpperCase() + g.slice(1)}</option>`).join("");
    els.genre.value = genres.includes(selected) ? selected : "all";
  }

  // ---------- playback ----------

  function setStatus(msg) { els.status.textContent = msg || ""; }

  function play(video, { record = true } = {}) {
    if (!video) {
      setStatus("No playable videos for this genre. Try another filter.");
      return;
    }
    current = video;
    if (record) {
      history = history.slice(0, historyIndex + 1);
      history.push(video);
      if (history.length > HISTORY_LIMIT) history.shift();
      historyIndex = history.length - 1;
    }
    renderNowPlaying();
    renderHistory();
    els.prev.disabled = historyIndex <= 0;
    if (playerReady) player.loadVideoById(video.id);
  }

  function next() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      play(history[historyIndex], { record: false });
    } else {
      play(drawNext());
    }
  }

  function prev() {
    if (historyIndex > 0) {
      historyIndex--;
      play(history[historyIndex], { record: false });
    }
  }

  function togglePlay() {
    if (!playerReady || !started) return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  function start() {
    if (started) return;
    started = true;
    els.splash.hidden = true;
    next();
  }

  // ---------- rendering ----------

  function renderNowPlaying() {
    if (!current) return;
    els.title.textContent = current.title || "Loading title…";
    els.artist.textContent = current.artist || "";
    els.chip.hidden = !current.genre;
    els.chip.textContent = current.genre || "";
    document.title = current.title ? `${current.title} · The Video Box` : "The Video Box";
  }

  function renderHistory() {
    els.history.innerHTML = "";
    history.slice().reverse().forEach((v, revIdx) => {
      const idx = history.length - 1 - revIdx;
      const li = document.createElement("li");
      li.title = "Play again";
      const img = document.createElement("img");
      img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
      img.alt = "";
      img.loading = "lazy";
      const meta = document.createElement("div");
      meta.className = "meta";
      const t = document.createElement("div");
      t.textContent = (idx === historyIndex ? "▶ " : "") + (v.title || v.id);
      const a = document.createElement("div");
      a.className = "a";
      a.textContent = v.artist || "";
      meta.append(t, a);
      li.append(img, meta);
      li.addEventListener("click", () => {
        if (!started) start();
        historyIndex = idx;
        play(history[idx], { record: false });
      });
      els.history.appendChild(li);
    });
  }

  function renderCustom() {
    els.customList.innerHTML = "";
    custom.forEach((v) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = v.title || v.id;
      label.title = "Play now";
      label.addEventListener("click", () => { if (!started) start(); play(v); });
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "✕";
      rm.title = "Remove";
      rm.addEventListener("click", () => {
        custom = custom.filter((c) => c.id !== v.id);
        saveCustom(custom);
        bag = bag.filter((b) => b.id !== v.id);
        renderCustom();
        populateGenres();
      });
      li.append(label, rm);
      els.customList.appendChild(li);
    });
  }

  // ---------- YouTube IFrame API ----------

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player("player", {
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          playerReady = true;
          if (current) player.loadVideoById(current.id);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            consecutiveErrors = 0;
            setStatus("");
            els.toggle.textContent = "⏸ Pause";
            // Fill in titles for custom videos added without metadata
            if (current && !current.title) {
              const data = player.getVideoData();
              if (data && data.title) {
                current.title = data.title;
                current.artist = data.author || "";
                const c = custom.find((x) => x.id === current.id);
                if (c) { c.title = current.title; c.artist = current.artist; saveCustom(custom); renderCustom(); }
                renderNowPlaying();
                renderHistory();
              }
            }
          } else if (e.data === YT.PlayerState.PAUSED) {
            els.toggle.textContent = "▶ Play";
          } else if (e.data === YT.PlayerState.ENDED) {
            next();
          }
        },
        onError: (e) => {
          // 100 = removed/private, 101/150 = embedding disabled, 2/5 = bad id / HTML5 error
          if (current) broken.add(current.id);
          history = history.filter((h) => h !== current);
          historyIndex = history.length - 1;
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            setStatus("Several videos in a row failed to load. Check your connection and press Next.");
            consecutiveErrors = 0;
            return;
          }
          setStatus(`Skipped a video that can't be embedded (error ${e.data}).`);
          play(drawNext());
        },
      },
    });
  };

  // ---------- wire up UI ----------

  els.start.addEventListener("click", start);
  els.next.addEventListener("click", () => { if (!started) start(); else next(); });
  els.prev.addEventListener("click", prev);
  els.toggle.addEventListener("click", togglePlay);
  els.genre.addEventListener("change", () => {
    bag = [];
    if (started) { historyIndex = history.length - 1; play(drawNext()); }
  });

  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = parseVideoId(els.addInput.value);
    if (!id) { setStatus("That doesn't look like a YouTube link or video ID."); return; }
    if (allVideos().some((v) => v.id === id)) { setStatus("That video is already in the box."); return; }
    const entry = { id, genre: "custom" };
    custom.push(entry);
    saveCustom(custom);
    bag.push(entry);
    els.addInput.value = "";
    setStatus("Added! It'll come up in the shuffle.");
    renderCustom();
    populateGenres();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea")) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); els.next.click(); }
    else if (e.key === "p" || e.key === "P") { e.preventDefault(); prev(); }
    else if (e.key === " ") { e.preventDefault(); if (!started) start(); else togglePlay(); }
  });

  populateGenres();
  renderCustom();
  renderHistory();
  els.prev.disabled = true;
})();
