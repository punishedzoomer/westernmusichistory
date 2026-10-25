// Western Music History Midterm Revision App Logic (Urtext Editorial Edition)
(function () {
  const TRACKS = window.LISTENING_TRACKS || [];
  const TRAPS = window.TRAP_GROUPS || [];
  const SLIDES = window.FULL_SLIDE_DECKS || window.SLIDE_DECKS || { ppt1: [], ppt2: [] };
  const THEORY_QS = window.THEORY_QUESTIONS || [];

  // Tracks pre-cached or known to have record-label iframe embed restrictions
  const LOCAL_AUDIO_IDS = new Set([
    "4pwfNap4DFM",  // #3 Italian Madrigal
    "_V7oujd9djk",  // #12 Bach Brandenburg Concerto No. 5
    "vNN_Kbuf7_U",  // #26 Haydn String Quartet 'The Lark'
    "wqkXqpQMk2k"   // #31 Mozart Symphony No. 40
  ]);

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatRichText(str) {
    if (!str) return "";
    return escHtml(str)
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code style='font-family:var(--font-mono);font-size:12px;background:var(--bg-elevated);padding:1px 4px;border-radius:2px;'>$1</code>");
  }

  // Persistent Mastery State in localStorage
  const STORAGE_KEY = "wmh_midterm_2026_state_v1";
  let state = {
    trackStatus: {}, // id -> 'mastered' | 'confused' | 'review'
    listeningCorrect: 0,
    listeningTotal: 0,
    theoryCorrect: 0,
    theoryTotal: 0,
    missedTheoryIds: []
  };

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        state = Object.assign(state, parsed);
      }
    } catch (e) {}
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    updateHeaderStats();
  }

  // YouTube IFrame Player API + Local HTML5 <audio> Bypass Engine
  let ytPlayer = null;
  let ytReady = false;
  let currentTrack = TRACKS[0] || null;
  let currentStartSec = 0;
  let currentDropMode = "cue";
  let isBlindMode = true;
  let isPlaying = false;
  let hasLoadedVideoOnce = false;
  let pendingPlayRequest = null;
  let usingLocalAudio = false;

  // Continuous Category-Scoped Playlist & Looping State
  let activePlaylistCategory = "all";
  let isLoopPlaylist = true;
  let activePlaylistQueue = TRACKS.slice();

  const CATEGORY_MAP = {
    "all": { label: "All 49 Works", getTracks: () => TRACKS.slice() },
    "era:Early": { label: "Medieval & Renaissance", getTracks: () => TRACKS.filter((t) => t.id >= 1 && t.id <= 3) },
    "era:Baroque": { label: "Baroque Period", getTracks: () => TRACKS.filter((t) => t.id >= 4 && t.id <= 21) },
    "era:Classical": { label: "Classical Period", getTracks: () => TRACKS.filter((t) => t.id >= 22 && t.id <= 49) },
    "comp:Bach": { label: "J. S. Bach", getTracks: () => TRACKS.filter((t) => t.id >= 12 && t.id <= 20) },
    "comp:Mozart": { label: "W. A. Mozart", getTracks: () => TRACKS.filter((t) => t.id >= 30 && t.id <= 43) },
    "comp:Haydn": { label: "F. J. Haydn", getTracks: () => TRACKS.filter((t) => t.id >= 24 && t.id <= 29) },
    "comp:Beethoven": { label: "L. van Beethoven", getTracks: () => TRACKS.filter((t) => t.id >= 44 && t.id <= 49) },
    "comp:Vivaldi": { label: "A. Vivaldi", getTracks: () => TRACKS.filter((t) => t.id >= 5 && t.id <= 7) },
    "comp:Handel": { label: "G. F. Handel", getTracks: () => TRACKS.filter((t) => t.id >= 8 && t.id <= 10) },
    "genre:Symphony": { label: "Symphonies", getTracks: () => TRACKS.filter((t) => [24, 25, 31, 32, 44, 49].includes(t.id)) },
    "genre:Sonata": { label: "Piano Sonatas", getTracks: () => TRACKS.filter((t) => [11, 22, 23, 40, 41, 42, 46, 47].includes(t.id)) },
    "genre:Concerto": { label: "Concertos", getTracks: () => TRACKS.filter((t) => [5, 6, 7, 12, 17, 21, 28, 29, 36, 39, 43, 48].includes(t.id)) },
    "genre:Chamber": { label: "Chamber & Solo Strings", getTracks: () => TRACKS.filter((t) => [15, 16, 18, 19, 20, 26, 27, 30, 33, 45].includes(t.id)) },
    "genre:Vocal": { label: "Sacred Choral & Vocal", getTracks: () => TRACKS.filter((t) => [1, 2, 3, 4, 8, 9, 10, 13, 14, 34, 35].includes(t.id)) },
    "genre:Opera": { label: "Operas & Singspiel", getTracks: () => TRACKS.filter((t) => [4, 9, 10, 37, 38].includes(t.id)) },
    "traps": { label: "Confusable Traps", getTracks: () => TRACKS.filter((t) => !!t.trapGroup) },
    "timestamps": { label: "Timestamp-Cued", getTracks: () => TRACKS.filter((t) => t.cueStart > 0) },
    "unmastered": { label: "Unmastered", getTracks: () => {
      const p = TRACKS.filter((t) => state.trackStatus[t.id] !== "mastered");
      return p.length ? p : TRACKS.slice();
    }},
    "flagged": { label: "Flagged for Review", getTracks: () => {
      const p = TRACKS.filter((t) => state.trackStatus[t.id] === "confused" || state.trackStatus[t.id] === "review");
      return p.length ? p : TRACKS.slice();
    }}
  };

  function updatePlaylistCounter() {
    const counterEl = document.getElementById("deck-playlist-counter");
    if (!counterEl || !currentTrack) return;
    const total = activePlaylistQueue.length;
    const idx = activePlaylistQueue.findIndex((t) => t.id === currentTrack.id);
    const catObj = CATEGORY_MAP[activePlaylistCategory] || { label: "Category Selection" };
    const posLabel = idx >= 0 ? `${idx + 1} of ${total}` : `– of ${total}`;
    counterEl.textContent = `Track ${posLabel} · ${catObj.label}${isLoopPlaylist ? " ↻" : ""}`;
  }

  function setDeckCategory(categoryKey, andPlay = false) {
    activePlaylistCategory = categoryKey;
    const catObj = CATEGORY_MAP[categoryKey] || CATEGORY_MAP["all"];
    activePlaylistQueue = catObj.getTracks();
    if (!activePlaylistQueue.length) activePlaylistQueue = TRACKS.slice();

    const deckCatSelect = document.getElementById("deck-category-select");
    if (deckCatSelect && deckCatSelect.value !== categoryKey) {
      deckCatSelect.value = categoryKey;
    }

    const quizPoolSelect = document.getElementById("quiz-pool-filter");
    if (quizPoolSelect && Array.from(quizPoolSelect.options).some((o) => o.value === categoryKey)) {
      quizPoolSelect.value = categoryKey;
    }

    const inCategory = currentTrack && activePlaylistQueue.some((t) => t.id === currentTrack.id);
    if (!inCategory) {
      const target = activePlaylistQueue[0];
      currentTrack = target;
      if (andPlay || isPlaying) {
        playTrack(target, currentDropMode, isBlindMode);
      } else {
        updateDeckLabels(currentDropMode, target.cueStart || 0);
      }
    }

    updatePlaylistCounter();
    syncPlayPauseButtons();
  }

  function toggleLoopPlaylist() {
    isLoopPlaylist = !isLoopPlaylist;
    const loopBtn = document.getElementById("btn-toggle-loop");
    if (loopBtn) {
      loopBtn.textContent = isLoopPlaylist ? "↻ Loop: ON" : "↻ Loop: OFF";
      loopBtn.classList.toggle("btn-gold", isLoopPlaylist);
    }
    updatePlaylistCounter();
  }

  function advanceToNextTrack({ delta = 1, autoPlay = true, manual = false } = {}) {
    if (!activePlaylistQueue || !activePlaylistQueue.length) {
      activePlaylistQueue = TRACKS.slice();
    }

    const curIdx = currentTrack ? activePlaylistQueue.findIndex((t) => t.id === currentTrack.id) : -1;
    let nextIdx = 0;

    if (curIdx === -1) {
      nextIdx = delta >= 0 ? 0 : activePlaylistQueue.length - 1;
    } else {
      if (!isLoopPlaylist && !manual && curIdx + delta >= activePlaylistQueue.length) {
        isPlaying = false;
        syncPlayPauseButtons();
        return;
      }
      nextIdx = (curIdx + delta + activePlaylistQueue.length) % activePlaylistQueue.length;
    }

    const nextTrack = activePlaylistQueue[nextIdx];
    if (!nextTrack) return;

    currentTrack = nextTrack;
    updatePlaylistCounter();

    const activeSection = document.querySelector(".view-section.active");
    const activeId = activeSection ? activeSection.id : "";
    if (activeId === "view-blind-quiz" && typeof setupListeningQuestionForTrack === "function") {
      setupListeningQuestionForTrack(nextTrack, false);
    }

    if (autoPlay) {
      playTrack(nextTrack, currentDropMode, isBlindMode);
    } else {
      updateDeckLabels(currentDropMode, nextTrack.cueStart || 0);
      syncPlayPauseButtons();
    }

    if (activeId === "view-library") {
      const activeCard = document.querySelector(`.track-card[data-id="${nextTrack.id}"]`);
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  function handleTrackPlaybackEnded() {
    if (!isLoopPlaylist) return;
    advanceToNextTrack({ delta: 1, autoPlay: true, manual: false });
  }

  const localAudio = new Audio();
  localAudio.preload = "auto";
  localAudio.addEventListener("play", function () {
    if (usingLocalAudio) {
      isPlaying = true;
      syncPlayPauseButtons();
      updateLiveTimers();
    }
  });
  localAudio.addEventListener("pause", function () {
    if (usingLocalAudio) {
      isPlaying = false;
      syncPlayPauseButtons();
      updateLiveTimers();
    }
  });
  localAudio.addEventListener("ended", function () {
    if (usingLocalAudio) {
      isPlaying = false;
      syncPlayPauseButtons();
      updateLiveTimers();
      handleTrackPlaybackEnded();
    }
  });
  localAudio.addEventListener("error", function () {
    if (usingLocalAudio && currentTrack) {
      const fallbackSrc = `audio_cache/${encodeURIComponent(currentTrack.ytId)}.m4a`;
      if (localAudio.src && !localAudio.src.endsWith(fallbackSrc)) {
        localAudio.src = fallbackSrc;
        localAudio.load();
        localAudio.play().catch(function () {});
      }
    }
  });

  function playViaLocalAudio(ytId, startSec) {
    usingLocalAudio = true;
    hasLoadedVideoOnce = true;
    if (ytReady && ytPlayer && typeof ytPlayer.pauseVideo === "function") {
      try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    const isStaticHosting = window.location.protocol === "file:" || window.location.hostname.endsWith("github.io");
    const targetSrc = isStaticHosting
      ? `audio_cache/${encodeURIComponent(ytId)}.m4a`
      : `/api/audio?id=${encodeURIComponent(ytId)}`;

    const subEl = document.getElementById("deck-sub");
    if (subEl && !isBlindMode && currentTrack) {
      subEl.textContent = `${currentTrack.period} · ${currentTrack.genre} · Direct Audio Stream (${formatTime(startSec)})`;
    }
    if (!localAudio.src || !localAudio.src.endsWith(targetSrc)) {
      localAudio.src = targetSrc;
      localAudio.load();
      const onLoaded = function () {
        localAudio.removeEventListener("loadedmetadata", onLoaded);
        try { localAudio.currentTime = startSec || 0; } catch (e) {}
        localAudio.play().catch(function () {});
      };
      localAudio.addEventListener("loadedmetadata", onLoaded);
    } else {
      try { localAudio.currentTime = startSec || 0; } catch (e) {}
      localAudio.play().catch(function () {});
    }
    syncPlayPauseButtons();
  }

  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player("yt-player", {
      height: "158",
      width: "280",
      videoId: currentTrack ? currentTrack.ytId : "Vj7R9LeiJPE",
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onReady: function () {
          ytReady = true;
          if (pendingPlayRequest) {
            const req = pendingPlayRequest;
            pendingPlayRequest = null;
            playTrack(req.track, req.mode, req.blind);
          }
        },
        onStateChange: function (event) {
          if (usingLocalAudio) return;
          // YT.PlayerState.PLAYING === 1, PAUSED === 2, BUFFERING === 3, ENDED === 0
          if (event.data === 0) {
            isPlaying = false;
            syncPlayPauseButtons();
            updateLiveTimers();
            handleTrackPlaybackEnded();
            return;
          }
          isPlaying = event.data === 1;
          syncPlayPauseButtons();
          updateLiveTimers();
        },
        onError: function (event) {
          // Error 101 or 150 = owner blocked embedded playback -> switch to local yt-dlp audio bypass
          if ((event.data === 101 || event.data === 150 || event.data === 2) && currentTrack) {
            LOCAL_AUDIO_IDS.add(currentTrack.ytId);
            playViaLocalAudio(currentTrack.ytId, currentStartSec);
          }
        }
      }
    });
  };

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  function playTrack(track, mode, blind) {
    if (!track) return;
    currentTrack = track;
    currentDropMode = mode || "cue";
    isBlindMode = !!blind;

    if (!activePlaylistQueue.some((t) => t.id === track.id)) {
      activePlaylistCategory = "all";
      activePlaylistQueue = TRACKS.slice();
      const deckCatSelect = document.getElementById("deck-category-select");
      if (deckCatSelect) deckCatSelect.value = "all";
      const quizPoolSelect = document.getElementById("quiz-pool-filter");
      if (quizPoolSelect) quizPoolSelect.value = "all";
    }

    let startSec = track.cueStart || 0;
    if (mode === "theme") {
      startSec = track.themeStart || track.cueStart || 0;
    } else if (mode === "random") {
      const [minS, maxS] = track.dropRange || [startSec + 5, startSec + 90];
      startSec = Math.floor(minS + Math.random() * Math.max(10, maxS - minS));
    }
    currentStartSec = startSec;

    updateBlindCurtain();
    updateDeckLabels(currentDropMode, startSec);
    updatePlaylistCounter();

    // If this track is known/cached for embed restriction bypass, play directly via local <audio>
    if (LOCAL_AUDIO_IDS.has(track.ytId)) {
      playViaLocalAudio(track.ytId, startSec);
      return;
    }

    // Otherwise stop localAudio and use YouTube IFrame Player
    usingLocalAudio = false;
    try { localAudio.pause(); } catch (e) {}

    if (!ytReady || !ytPlayer || typeof ytPlayer.loadVideoById !== "function") {
      pendingPlayRequest = { track, mode: currentDropMode, blind: isBlindMode };
      return;
    }

    hasLoadedVideoOnce = true;
    ytPlayer.loadVideoById({
      videoId: track.ytId,
      startSeconds: startSec
    });

    syncPlayPauseButtons();
  }

  window.toggleTrackPlay = function (trackId, mode, blind) {
    const track = TRACKS.find((t) => t.id === trackId);
    if (!track) return;

    // If this exact track is already active and loaded, toggle Play/Pause!
    if (currentTrack && currentTrack.id === trackId && hasLoadedVideoOnce) {
      if (usingLocalAudio) {
        if (localAudio.paused) {
          localAudio.play().catch(function () {});
        } else {
          localAudio.pause();
        }
        return;
      }
      if (ytReady && ytPlayer) {
        const st = ytPlayer.getPlayerState();
        if (st === 1) {
          ytPlayer.pauseVideo();
        } else {
          ytPlayer.playVideo();
        }
        return;
      }
    }

    playTrack(track, mode || "cue", !!blind);
  };

  window.seekRelative = function (deltaSec) {
    if (usingLocalAudio) {
      const cur = localAudio.currentTime || currentStartSec;
      localAudio.currentTime = Math.max(0, cur + deltaSec);
      updateLiveTimers();
      return;
    }
    if (!ytReady || !ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
    const cur = ytPlayer.getCurrentTime() || currentStartSec;
    ytPlayer.seekTo(Math.max(0, cur + deltaSec), true);
    updateLiveTimers();
  };

  function toggleDeckPlayPause() {
    if (!currentTrack) {
      currentTrack = currentListeningQ ? currentListeningQ.target : TRACKS[0];
    }
    if (usingLocalAudio && hasLoadedVideoOnce) {
      if (localAudio.paused) {
        localAudio.play().catch(function () {});
      } else {
        localAudio.pause();
      }
      return;
    }
    if (!ytReady || !ytPlayer) {
      pendingPlayRequest = { track: currentTrack, mode: currentDropMode, blind: isBlindMode };
      return;
    }
    const st = typeof ytPlayer.getPlayerState === "function" ? ytPlayer.getPlayerState() : -1;
    // If unstarted (-1) or cued (5) or never loaded via loadVideoById, load & play immediately
    if (!hasLoadedVideoOnce || st === -1 || st === 5) {
      playTrack(currentTrack, currentDropMode, isBlindMode);
    } else if (st === 1) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  }

  function syncPlayPauseButtons() {
    const mainBtn = document.getElementById("btn-play-pause");
    if (mainBtn) {
      mainBtn.innerHTML = isPlaying
        ? `❚❚ Pause <span class="kbd">Space</span>`
        : `▸ Play <span class="kbd">Space</span>`;
    }

    document.querySelectorAll(".track-card").forEach((el) => {
      const tid = Number(el.dataset.id);
      const isCurrent = currentTrack && currentTrack.id === tid && hasLoadedVideoOnce;
      el.classList.toggle("playing", Boolean(isCurrent));
      const toggleBtn = el.querySelector(".card-play-toggle");
      if (toggleBtn) {
        if (isCurrent && isPlaying) {
          toggleBtn.textContent = "❚❚ Pause";
          toggleBtn.classList.add("btn-gold");
        } else if (isCurrent && !isPlaying) {
          toggleBtn.textContent = "▸ Resume";
          toggleBtn.classList.remove("btn-gold");
        } else {
          toggleBtn.textContent = `▸ Play (${formatTime(el.dataset.cue || 0)})`;
          toggleBtn.classList.remove("btn-gold");
        }
      }
    });

    document.querySelectorAll(".trap-play-toggle").forEach((btn) => {
      const tid = Number(btn.dataset.id);
      const isCurrent = currentTrack && currentTrack.id === tid && hasLoadedVideoOnce;
      if (isCurrent && isPlaying) {
        btn.textContent = "❚❚ Pause";
      } else if (isCurrent && !isPlaying) {
        btn.textContent = "▸ Resume";
      } else {
        btn.textContent = "▸ Play Cue";
      }
    });
  }

  function updateLiveTimers() {
    if (!hasLoadedVideoOnce) return;
    let cur = 0;
    let dur = 0;
    if (usingLocalAudio) {
      cur = Math.floor(localAudio.currentTime || 0);
      dur = Math.floor(Number.isFinite(localAudio.duration) ? localAudio.duration : 0);
    } else {
      if (!ytReady || !ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
      cur = Math.floor(ytPlayer.getCurrentTime() || 0);
      dur = Math.floor(ytPlayer.getDuration() || 0);
    }
    const timeStr = dur > 0 ? `${formatTime(cur)} / ${formatTime(dur)}` : `${formatTime(cur)}`;
    const stateLabel = isPlaying ? "▸ Playing" : "❚❚ Paused";

    // Update active card live badge
    document.querySelectorAll("[data-live-badge]").forEach((badge) => {
      const tid = Number(badge.dataset.liveBadge);
      const tObj = TRACKS.find((x) => x.id === tid);
      if (currentTrack && currentTrack.id === tid && hasLoadedVideoOnce) {
        badge.textContent = `${stateLabel} · ${timeStr}`;
        badge.style.background = isPlaying ? "#e3efe7" : "#f5ebd6";
        badge.style.color = isPlaying ? "var(--green)" : "#6e4811";
        badge.style.display = "inline-block";
      } else if (tObj && tObj.cueStart > 0) {
        badge.textContent = `† Exam Start Cue: ${tObj.cueNote}`;
        badge.style.background = "#f5ebd6";
        badge.style.color = "#6e4811";
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    });

    // Update deck timer if playing
    const deckTimerEl = document.getElementById("deck-live-time");
    if (deckTimerEl) {
      deckTimerEl.textContent = `${stateLabel} · ${timeStr}`;
    }
  }

  setInterval(updateLiveTimers, 500);

  function formatTime(sec) {
    const n = Number(sec) || 0;
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function updateBlindCurtain() {
    const curtain = document.getElementById("blind-curtain");
    const ytBox = document.querySelector(".yt-box");
    if (!curtain || !ytBox) return;
    if (isBlindMode) {
      curtain.classList.remove("hidden");
      ytBox.classList.add("blind-active");
    } else {
      curtain.classList.add("hidden");
      ytBox.classList.remove("blind-active");
    }
  }

  function updateDeckLabels(mode, startSec) {
    const titleEl = document.getElementById("deck-title");
    const subEl = document.getElementById("deck-sub");
    const ytLink = document.getElementById("deck-yt-link");

    if (!currentTrack) return;

    if (isBlindMode) {
      titleEl.innerHTML = `♪ Blind Examination Audio Active <span id="deck-live-time" class="cue-badge" style="margin-left:8px;">Starting at ${formatTime(startSec)}</span>`;
      subEl.textContent = `Needle position: ${formatTime(startSec)} (${mode === "random" ? "Random Mid-Movement Drop" : "Professor's Cue / Opening"}) — Identify the work below`;
      ytLink.style.display = "none";
    } else {
      titleEl.innerHTML = `No. ${currentTrack.id}. ${escHtml(currentTrack.composer)} — ${escHtml(currentTrack.title)} <span id="deck-live-time" class="cue-badge" style="margin-left:8px;">${formatTime(startSec)}</span>`;
      subEl.textContent = `${currentTrack.era} · ${currentTrack.forces}${currentTrack.cueStart > 0 ? ` · Exam Cue: ${currentTrack.cueNote}` : ""}`;
      ytLink.href = `https://www.youtube.com/watch?v=${currentTrack.origYtId || currentTrack.ytId}&t=${startSec}s`;
      ytLink.style.display = "inline-flex";
    }
  }

  function bindDeckControls() {
    document.getElementById("btn-play-pause").addEventListener("click", toggleDeckPlayPause);
    document.getElementById("blind-curtain").addEventListener("click", toggleDeckPlayPause);

    const prevBtn = document.getElementById("btn-prev-track");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        advanceToNextTrack({ delta: -1, autoPlay: true, manual: true });
      });
    }

    const nextBtn = document.getElementById("btn-next-track");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        advanceToNextTrack({ delta: 1, autoPlay: true, manual: true });
      });
    }

    const loopBtn = document.getElementById("btn-toggle-loop");
    if (loopBtn) {
      loopBtn.addEventListener("click", toggleLoopPlaylist);
    }

    const catSelect = document.getElementById("deck-category-select");
    if (catSelect) {
      catSelect.addEventListener("change", (e) => {
        setDeckCategory(e.target.value, false);
      });
    }

    document.getElementById("btn-replay-cue").addEventListener("click", () => {
      if (!currentTrack) currentTrack = TRACKS[0];
      playTrack(currentTrack, "cue", isBlindMode);
    });

    document.getElementById("btn-jump-theme").addEventListener("click", () => {
      if (!currentTrack) currentTrack = TRACKS[0];
      playTrack(currentTrack, "theme", isBlindMode);
    });

    document.getElementById("btn-random-drop").addEventListener("click", () => {
      if (!currentTrack) currentTrack = TRACKS[0];
      playTrack(currentTrack, "random", isBlindMode);
    });

    document.getElementById("btn-plus-15").addEventListener("click", () => {
      window.seekRelative(15);
    });

    document.getElementById("btn-toggle-curtain").addEventListener("click", () => {
      isBlindMode = !isBlindMode;
      updateBlindCurtain();
      updateDeckLabels(currentDropMode, currentStartSec);
    });
  }

  function updateHeaderStats() {
    let mastered = 0, confused = 0, review = 0;
    TRACKS.forEach((t) => {
      const st = state.trackStatus[t.id];
      if (st === "mastered") mastered++;
      else if (st === "confused") confused++;
      else if (st === "review") review++;
    });
    document.getElementById("stat-mastered").textContent = `${mastered} / 49 Mastered`;
    document.getElementById("stat-flagged").textContent = `${confused + review} Flagged`;
    const lPct = state.listeningTotal ? Math.round((state.listeningCorrect / state.listeningTotal) * 100) : 0;
    document.getElementById("stat-listen-score").textContent = `Listening: ${state.listeningCorrect}/${state.listeningTotal} (${lPct}%)`;
    const tPct = state.theoryTotal ? Math.round((state.theoryCorrect / state.theoryTotal) * 100) : 0;
    document.getElementById("stat-theory-score").textContent = `Theory: ${state.theoryCorrect}/${state.theoryTotal} (${tPct}%)`;
  }

  // =========================================================================
  // TAB 1: BLIND DROP-THE-NEEDLE LISTENING QUIZ
  // =========================================================================
  let currentListeningQ = null;
  let listeningAnswered = false;

  function getFilteredQuizPool() {
    const filterVal = document.getElementById("quiz-pool-filter").value;
    if (filterVal === "all") return TRACKS;
    if (filterVal === "unmastered") {
      const pool = TRACKS.filter((t) => state.trackStatus[t.id] !== "mastered");
      return pool.length >= 4 ? pool : TRACKS;
    }
    if (filterVal === "flagged") {
      const pool = TRACKS.filter((t) => state.trackStatus[t.id] === "confused" || state.trackStatus[t.id] === "review");
      return pool.length >= 1 ? pool : TRACKS;
    }
    if (filterVal === "traps") return TRACKS.filter((t) => !!t.trapGroup);
    if (filterVal === "timestamps") return TRACKS.filter((t) => t.cueStart > 0);
    if (filterVal.startsWith("era:")) {
      const era = filterVal.split(":")[1];
      if (era === "Early") return TRACKS.filter((t) => t.era === "Medieval" || t.era === "Renaissance");
      return TRACKS.filter((t) => t.era === era);
    }
    if (filterVal.startsWith("comp:")) {
      const comp = filterVal.split(":")[1];
      return TRACKS.filter((t) => t.composer.includes(comp));
    }
    return TRACKS;
  }

  function pickSmartDistractors(targetTrack, count = 3) {
    const others = TRACKS.filter((t) => t.id !== targetTrack.id);
    const sameTrap = others.filter((t) => targetTrack.trapGroup && t.trapGroup === targetTrack.trapGroup);
    const sameComposerOrGenre = others.filter(
      (t) =>
        (!targetTrack.trapGroup || t.trapGroup !== targetTrack.trapGroup) &&
        (t.composer === targetTrack.composer || t.era === targetTrack.era)
    );
    const rest = others.filter((t) => !sameTrap.includes(t) && !sameComposerOrGenre.includes(t));

    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const combined = [...shuffle(sameTrap), ...shuffle(sameComposerOrGenre), ...shuffle(rest)];
    return combined.slice(0, count);
  }

  function setupListeningQuestionForTrack(target, autoPlay = true) {
    if (!target) return;
    const distractors = pickSmartDistractors(target, 3);
    const options = [target, ...distractors];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    currentListeningQ = {
      target,
      options,
      correctIndex: options.findIndex((o) => o.id === target.id)
    };
    listeningAnswered = false;

    if (autoPlay) {
      const dropModeEl = document.getElementById("quiz-drop-mode");
      const dropMode = dropModeEl ? dropModeEl.value : "cue";
      playTrack(target, dropMode, true);
    }
    renderListeningQuizCard();
  }

  function startNextListeningQuestion() {
    const pool = getFilteredQuizPool();
    const target = pool[Math.floor(Math.random() * pool.length)];
    setupListeningQuestionForTrack(target, true);
  }

  function renderListeningQuizCard() {
    const container = document.getElementById("listening-quiz-options");
    const feedback = document.getElementById("listening-quiz-feedback");
    feedback.classList.remove("visible");
    container.innerHTML = "";

    if (!currentListeningQ) return;

    currentListeningQ.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.innerHTML = `
        <span class="option-num">${idx + 1}</span>
        <div>
          <strong style="font-family:var(--font-serif);font-size:15px;">${escHtml(opt.composer)}</strong> — ${escHtml(opt.title)}
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;font-family:var(--font-mono);">No. ${opt.id} · ${escHtml(opt.era)} (${escHtml(opt.genre)})</div>
        </div>
      `;
      btn.addEventListener("click", () => handleListeningAnswer(idx));
      container.appendChild(btn);
    });
  }

  function handleListeningAnswer(selectedIdx) {
    if (listeningAnswered || !currentListeningQ) return;
    listeningAnswered = true;

    const isCorrect = selectedIdx === currentListeningQ.correctIndex;
    state.listeningTotal++;
    if (isCorrect) state.listeningCorrect++;
    saveState();

    isBlindMode = false;
    updateBlindCurtain();
    updateDeckLabels(currentDropMode, currentStartSec);

    const buttons = document.querySelectorAll("#listening-quiz-options .option-btn");
    buttons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === currentListeningQ.correctIndex) btn.classList.add("correct");
      else if (idx === selectedIdx && !isCorrect) btn.classList.add("wrong");
    });

    const t = currentListeningQ.target;
    const curStatus = state.trackStatus[t.id] || "unseen";
    const feedback = document.getElementById("listening-quiz-feedback");
    feedback.innerHTML = `
      <div class="feedback-title" style="color:${isCorrect ? "var(--green)" : "var(--red)"}">
        ${isCorrect ? "✓ Correct Identification" : `× Incorrect — Work Playing: No. ${t.id}. ${escHtml(t.composer)} — ${escHtml(t.title)}`}
      </div>
      <div class="info-block" style="margin-bottom:8px;">
        <strong>♪ Sonic Signature:</strong> ${formatRichText(t.hook)}
      </div>
      <div class="info-block" style="margin-bottom:8px;">
        <strong>§ Historical Context:</strong> ${formatRichText(t.history || t.mnemonic)}
      </div>
      ${t.musicalAnalysis ? `<div class="info-block" style="margin-bottom:8px;"><strong>𝄞 Form & Texture:</strong> ${formatRichText(t.musicalAnalysis)}</div>` : ""}
      <div class="trap-alert" style="margin-bottom:12px;">
        <strong>† Examination Distinction:</strong> ${formatRichText(t.trapTip)}
      </div>
      <div class="btn-row">
        <span style="font-size:12px;color:var(--text-muted);margin-right:4px;font-family:var(--font-mono);">Record Status (No. ${t.id}):</span>
        <button class="btn btn-sm ${curStatus === "mastered" ? "btn-green" : ""}" onclick="window.setTrackMastery(${t.id}, 'mastered')">✓ Mastered</button>
        <button class="btn btn-sm ${curStatus === "confused" ? "btn-red" : ""}" onclick="window.setTrackMastery(${t.id}, 'confused')">! Confused</button>
        <button class="btn btn-sm ${curStatus === "review" ? "btn-gold" : ""}" onclick="window.setTrackMastery(${t.id}, 'review')">* Review</button>
      </div>
    `;
    feedback.classList.add("visible");
  }

  window.setTrackMastery = function (trackId, status) {
    if (state.trackStatus[trackId] === status) {
      delete state.trackStatus[trackId];
    } else {
      state.trackStatus[trackId] = status;
    }
    saveState();
    renderTrackLibrary();
    if (listeningAnswered && currentListeningQ && currentListeningQ.target.id === trackId) {
      const t = currentListeningQ.target;
      const curStatus = state.trackStatus[t.id] || "unseen";
      const feedback = document.getElementById("listening-quiz-feedback");
      if (feedback) {
        const btns = feedback.querySelectorAll(".btn-row button");
        if (btns.length === 3) {
          btns[0].className = `btn btn-sm ${curStatus === "mastered" ? "btn-green" : ""}`;
          btns[1].className = `btn btn-sm ${curStatus === "confused" ? "btn-red" : ""}`;
          btns[2].className = `btn btn-sm ${curStatus === "review" ? "btn-gold" : ""}`;
        }
      }
    }
  };

  // =========================================================================
  // TAB 2: SOUND-ALIKE TRAPS (A/B COMPARATOR)
  // =========================================================================
  function renderTrapGroups() {
    const container = document.getElementById("traps-container");
    container.innerHTML = "";

    TRAPS.forEach((group) => {
      const card = document.createElement("div");
      card.className = "trap-group-card";

      const bulletsHtml = group.howToTell.map((b) => `<li>${formatRichText(b)}</li>`).join("");

      const groupTracks = group.trackIds.map((id) => TRACKS.find((t) => t.id === id)).filter(Boolean);
      const trackButtonsHtml = groupTracks
        .map(
          (t) => `
          <div style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:2px;padding:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="track-num">No. ${t.id}</span>
              <span class="cue-badge" data-live-badge="${t.id}" style="${t.cueStart > 0 ? "" : "display:none;"}">${t.cueStart > 0 ? `† Exam Start: ${escHtml(t.cueNote)}` : ""}</span>
            </div>
            <div style="font-family:var(--font-serif);font-weight:700;font-size:14.5px;">${escHtml(t.composer)} — ${escHtml(t.title)}</div>
            <div style="font-size:12px;color:var(--text-muted);">${escHtml(t.forces)}</div>
            <div class="btn-row" style="margin-top:auto;">
              <button class="btn btn-sm btn-primary trap-play-toggle" data-id="${t.id}" onclick="window.toggleTrackPlay(${t.id}, 'cue', false)">▸ Play Cue</button>
              <button class="btn btn-sm" onclick="window.playTrackById(${t.id}, 'random', false)">⤮ Mid-Track Drop</button>
            </div>
          </div>
        `
        )
        .join("");

      card.innerHTML = `
        <div class="trap-group-title">${escHtml(group.title)}</div>
        <div class="trap-group-sub">${escHtml(group.subtitle)}</div>
        <ul class="trap-list">${bulletsHtml}</ul>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;">
          ${trackButtonsHtml}
        </div>
      `;
      container.appendChild(card);
    });
  }

  window.playTrackById = function (id, mode, blind) {
    const track = TRACKS.find((t) => t.id === id);
    if (track) playTrack(track, mode, blind);
  };

  // =========================================================================
  // TAB 3: 49-TRACK LISTENING LIBRARY & SONIC ID CARDS
  // =========================================================================
  function renderTrackLibrary() {
    const grid = document.getElementById("library-grid");
    if (!grid) return;

    const searchVal = (document.getElementById("lib-search").value || "").toLowerCase();
    const eraVal = document.getElementById("lib-era-filter").value;
    const statusVal = document.getElementById("lib-status-filter").value;

    const filtered = TRACKS.filter((t) => {
      if (eraVal !== "all" && t.era !== eraVal) return false;
      const st = state.trackStatus[t.id] || "unseen";
      if (statusVal === "mastered" && st !== "mastered") return false;
      if (statusVal === "flagged" && st !== "confused" && st !== "review") return false;
      if (statusVal === "unmastered" && st === "mastered") return false;
      if (searchVal) {
        const hay = `${t.id} ${t.composer} ${t.title} ${t.genre} ${t.forces} ${t.hook} ${t.history || ""} ${t.musicalAnalysis || ""}`.toLowerCase();
        if (!hay.includes(searchVal)) return false;
      }
      return true;
    });

    document.getElementById("lib-count-label").textContent = `Showing ${filtered.length} of 49 works`;

    grid.innerHTML = filtered
      .map((t) => {
        const st = state.trackStatus[t.id] || "unseen";
        const isCurrent = currentTrack && currentTrack.id === t.id && hasLoadedVideoOnce;
        return `
        <div class="track-card ${isCurrent ? "playing" : ""}" data-id="${t.id}" data-cue="${t.cueStart}">
          <div class="track-top">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <span class="track-num">No. ${t.id}</span>
              <span class="era-badge era-${t.era}">${escHtml(t.era)}</span>
              <span class="cue-badge" data-live-badge="${t.id}" style="${t.cueStart > 0 || isCurrent ? "" : "display:none;"}">
                ${t.cueStart > 0 ? `† Exam Start Cue: ${escHtml(t.cueNote)}` : ""}
              </span>
            </div>
            <div class="btn-row">
              <button class="btn btn-sm ${st === "mastered" ? "btn-green" : ""}" title="Mark Mastered" onclick="window.setTrackMastery(${t.id}, 'mastered')">✓</button>
              <button class="btn btn-sm ${st === "confused" ? "btn-red" : ""}" title="Mark Confused" onclick="window.setTrackMastery(${t.id}, 'confused')">!</button>
              <button class="btn btn-sm ${st === "review" ? "btn-gold" : ""}" title="Mark Review" onclick="window.setTrackMastery(${t.id}, 'review')">*</button>
            </div>
          </div>
          <div>
            <div class="track-composer">${escHtml(t.composer)} · <span style="color:var(--brass)">${escHtml(t.forces)}</span></div>
            <div class="track-title">${escHtml(t.title)}</div>
          </div>
          <div class="info-block">
            <strong>♪ Sonic Signature:</strong> ${formatRichText(t.hook)}
          </div>
          <div class="info-block">
            <strong>§ Historical Background & Lecture Context:</strong> ${formatRichText(t.history || t.mnemonic)}
          </div>
          ${t.musicalAnalysis ? `<div class="info-block"><strong>𝄞 Musical Form & Texture:</strong> ${formatRichText(t.musicalAnalysis)}</div>` : ""}
          <div class="trap-alert">
            <strong>† Examination Distinction:</strong> ${formatRichText(t.trapTip)}
          </div>
          <div class="btn-row" style="margin-top:auto;padding-top:4px;">
            <button class="btn btn-sm btn-primary card-play-toggle" onclick="window.toggleTrackPlay(${t.id}, 'cue', false)">
              ${isCurrent && isPlaying ? "❚❚ Pause" : `▸ Play (${formatTime(t.cueStart)})`}
            </button>
            <button class="btn btn-sm" title="Restart from Cue" onclick="window.playTrackById(${t.id}, 'cue', false)">↻ Restart</button>
            ${t.themeStart !== t.cueStart ? `<button class="btn btn-sm" onclick="window.playTrackById(${t.id}, 'theme', false)">⇥ Theme (${formatTime(t.themeStart)})</button>` : ""}
            <button class="btn btn-sm" onclick="window.playTrackById(${t.id}, 'random', false)">⤮ Drop</button>
            <button class="btn btn-sm" onclick="window.seekRelative(-15)">-15s</button>
            <button class="btn btn-sm" onclick="window.seekRelative(15)">+15s</button>
            <a class="btn btn-sm" href="https://www.youtube.com/watch?v=${t.origYtId || t.ytId}&t=${t.cueStart}s" target="_blank" rel="noopener">Source ↗</a>
          </div>
        </div>
      `;
      })
      .join("");
  }

  window.playCustomClip = function (ytId, label, era) {
    const tempTrack = {
      id: -1,
      ytId: ytId,
      composer: "Lecture Video Clip",
      title: label || "Class Demonstration Video",
      period: era || "Course Lecture",
      genre: "PPT Slide Clip",
      cueStart: 0,
      themeStart: 0,
      dropRange: [10, 60]
    };
    playTrack(tempTrack, "cue", false);
  };

  window.scrollToSlideCard = function (domId) {
    const el = document.getElementById(domId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.boxShadow = "0 0 0 2px var(--accent)";
      setTimeout(() => {
        el.style.boxShadow = "";
      }, 1600);
    }
  };

  // =========================================================================
  // TAB 4: RECONSTRUCTED LECTURE NOTES (ALL 67 SLIDES — 58 DETAILED MODULES)
  // =========================================================================
  function renderSlidesNotes() {
    const deckSelect = document.getElementById("notes-deck-filter").value;
    const eraSelectEl = document.getElementById("notes-era-filter");
    const eraSelect = eraSelectEl ? eraSelectEl.value : "all";
    const searchVal = (document.getElementById("notes-search").value || "").toLowerCase();
    const container = document.getElementById("slides-notes-container");
    const jumpBar = document.getElementById("slides-jump-bar");
    const countLabel = document.getElementById("notes-count-label");

    let items = [];
    if (deckSelect === "all" || deckSelect === "ppt1") {
      items = items.concat(
        (SLIDES.ppt1 || []).map((s, idx) =>
          Object.assign({ deckKey: "ppt1", deckName: "PPT I", domId: `slide-card-ppt1-${idx}` }, s)
        )
      );
    }
    if (deckSelect === "all" || deckSelect === "ppt2") {
      items = items.concat(
        (SLIDES.ppt2 || []).map((s, idx) =>
          Object.assign({ deckKey: "ppt2", deckName: "PPT II", domId: `slide-card-ppt2-${idx}` }, s)
        )
      );
    }

    if (eraSelect !== "all") {
      items = items.filter((s) => {
        const e = (s.era || "").toLowerCase();
        if (eraSelect === "Greece") return e.includes("greece") || e.includes("overview") || e.includes("chronology") || e.includes("panorama");
        if (eraSelect === "Medieval") return e.includes("medieval");
        if (eraSelect === "Renaissance") return e.includes("renaissance");
        if (eraSelect === "Baroque") return e.includes("baroque") || e.includes("score");
        if (eraSelect === "Classical") return e.includes("classical") && !e.includes("romantic");
        if (eraSelect === "Romantic") return e.includes("romantic");
        return true;
      });
    }

    if (searchVal) {
      items = items.filter((s) => {
        const nar = (s.narrative || s.lectureNotes || []).join(" ");
        const conc = (s.concepts || []).map((c) => `${c.term} ${c.detail}`).join(" ");
        const vids = (s.videos || []).map((v) => `${v.label} ${v.why}`).join(" ");
        const exam = (s.examTakeaways || []).join(" ");
        const hay = `${s.slideNum || s.slides} ${s.era} ${s.title} ${s.rawCues} ${nar} ${conc} ${vids} ${exam}`.toLowerCase();
        return hay.includes(searchVal);
      });
    }

    if (countLabel) {
      countLabel.textContent = `Showing ${items.length} slide lecture module${items.length === 1 ? "" : "s"}`;
    }

    if (jumpBar) {
      jumpBar.innerHTML = items
        .map((s) => {
          const shortSlide = String(s.slideNum || s.slides || "").replace(/\s*\(p\.\s*\d+[^)]*\)/i, "");
          return `<button class="btn btn-sm" title="${escHtml(s.title)}" style="font-family:var(--font-mono);font-size:11px;padding:3px 8px;" onclick="window.scrollToSlideCard('${s.domId}')">${escHtml(s.deckName)} · ${escHtml(shortSlide)}</button>`;
        })
        .join("");
    }

    container.innerHTML = items
      .map((s) => {
        const slideLabel = s.slideNum || s.slides || "";
        const paragraphsHtml = (s.narrative || s.lectureNotes || [])
          .map(
            (p) =>
              `<p style="font-size:14.5px;line-height:1.74;color:var(--text-main);margin-bottom:11px;">${formatRichText(p)}</p>`
          )
          .join("");

        const imagesHtml =
          s.images && s.images.length > 0
            ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;padding:10px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:2px;">
                ${s.images
                  .map(
                    (imgSrc) =>
                      `<img src="${escHtml(imgSrc)}" alt="Slide visual" style="max-height:190px;max-width:100%;object-fit:contain;border:1px solid var(--border);border-radius:2px;background:#fff;padding:3px;" />`
                  )
                  .join("")}
               </div>`
            : "";

        const conceptsHtml =
          s.concepts && s.concepts.length > 0
            ? `<div style="margin-top:14px;">
                <div style="font-family:var(--font-serif);font-size:14px;font-weight:700;color:var(--accent);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px;">§ Key Concepts, Terms & Contrasts</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:10px;">
                  ${s.concepts
                    .map(
                      (c) => `
                      <div style="background:var(--bg-subtle);border:1px solid var(--border);border-left:3px solid var(--brass);padding:10px 12px;border-radius:2px;">
                        <div style="font-family:var(--font-serif);font-weight:700;font-size:13.5px;color:var(--text-main);margin-bottom:4px;">${formatRichText(c.term)}</div>
                        <div style="font-size:13px;line-height:1.58;color:var(--text-body);">${formatRichText(c.detail)}</div>
                      </div>`
                    )
                    .join("")}
                </div>
               </div>`
            : "";

        const videosHtml =
          s.videos && s.videos.length > 0
            ? `<div style="margin-top:14px;">
                <div style="font-family:var(--font-serif);font-size:14px;font-weight:700;color:var(--accent);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px;">♪ Embedded Slide Video Clips & Listening Examples (${s.videos.length})</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${s.videos
                    .map((v) => {
                      const isExamTrack = Boolean(v.trackId);
                      const playCall = isExamTrack
                        ? `window.toggleTrackPlay(${v.trackId}, 'cue', false)`
                        : `window.playCustomClip('${escHtml(v.ytId)}', '${escHtml(v.label).replace(/'/g, "\\'")}', '${escHtml(s.era).replace(/'/g, "\\'")}')`;
                      return `
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;background:${isExamTrack ? "#f5ebd6" : "var(--bg-subtle)"};border:1px solid ${isExamTrack ? "var(--brass)" : "var(--border)"};padding:9px 12px;border-radius:2px;">
                          <div style="flex:1;min-width:220px;">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
                              ${isExamTrack ? `<span class="track-num" style="background:var(--accent);color:#fff;border-color:var(--accent);">Exam Track No. ${v.trackId}</span>` : `<span class="track-num">Class Clip</span>`}
                              <strong style="font-family:var(--font-serif);font-size:13.5px;color:var(--text-main);">${escHtml(v.label)}</strong>
                            </div>
                            <div style="font-size:12.5px;color:var(--text-body);line-height:1.5;">${formatRichText(v.why)}</div>
                          </div>
                          <div class="btn-row" style="flex-shrink:0;">
                            <button class="btn btn-sm ${isExamTrack ? "btn-primary" : ""}" onclick="${playCall}">▸ Play in Deck</button>
                            <a class="btn btn-sm" href="https://www.youtube.com/watch?v=${escHtml(v.ytId)}" target="_blank" rel="noopener">YouTube ↗</a>
                          </div>
                        </div>`;
                    })
                    .join("")}
                </div>
               </div>`
            : "";

        const takeawaysHtml =
          s.examTakeaways && s.examTakeaways.length > 0
            ? `<div class="slide-trivia" style="margin-top:14px;">
                <div style="font-family:var(--font-serif);font-weight:700;font-size:13.5px;margin-bottom:4px;">† Midterm Exam Takeaways & Traps from ${escHtml(slideLabel)}:</div>
                <ul style="margin-left:18px;display:flex;flex-direction:column;gap:4px;">
                  ${s.examTakeaways.map((t) => `<li style="font-size:13px;line-height:1.55;">${formatRichText(t)}</li>`).join("")}
                </ul>
               </div>`
            : "";

        return `
        <div class="slide-card" id="${s.domId}" style="transition:box-shadow 0.3s ease;">
          <div class="slide-header">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="track-num" style="font-size:12.5px;">${escHtml(s.deckName)} · ${escHtml(slideLabel)}</span>
              <span class="era-badge" style="background:var(--bg-elevated);color:var(--accent);border-color:var(--border);">${escHtml(s.era)}</span>
            </div>
          </div>
          <h3 style="font-family:var(--font-serif);font-size:19.5px;color:var(--text-main);margin:6px 0 10px 0;">${escHtml(s.title)}</h3>
          <div class="slide-raw"><strong>Exact Text on Prof. Chae's Slide:</strong> ${escHtml(s.rawCues)}</div>
          ${imagesHtml}
          <div style="margin-top:12px;">
            <div style="font-family:var(--font-serif);font-size:14px;font-weight:700;color:var(--accent);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px;">𝄞 Full Reconstructed Lecture Explanation</div>
            ${paragraphsHtml}
          </div>
          ${conceptsHtml}
          ${videosHtml}
          ${takeawaysHtml}
        </div>
      `;
      })
      .join("");
  }

  // =========================================================================
  // TAB 5: 40-QUESTION MOCK MIDTERM & THEORY DRILL
  // =========================================================================
  let examSession = null;

  function buildExamSession(mode) {
    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    if (mode === "theory25" || mode === "theoryAll" || mode === "theoryMissed") {
      let pool = THEORY_QS.slice();
      if (mode === "theoryMissed" && state.missedTheoryIds.length > 0) {
        pool = THEORY_QS.filter((q) => state.missedTheoryIds.includes(q.id));
      }
      const selected = mode === "theory25" ? shuffle(pool).slice(0, 25) : shuffle(pool);
      examSession = {
        mode,
        questions: selected.map((q) => ({ type: "theory", data: q })),
        currentIdx: 0,
        score: 0,
        answered: false
      };
    } else if (mode === "mock40") {
      const theory25 = shuffle(THEORY_QS)
        .slice(0, 25)
        .map((q) => ({ type: "theory", data: q }));
      const listen15Tracks = shuffle(TRACKS).slice(0, 15);
      const listen15 = listen15Tracks.map((target) => {
        const distractors = pickSmartDistractors(target, 3);
        const opts = shuffle([target, ...distractors]);
        return {
          type: "listening",
          data: {
            target,
            options: opts,
            answer: opts.findIndex((o) => o.id === target.id)
          }
        };
      });
      examSession = {
        mode: "mock40",
        questions: [...theory25, ...listen15],
        currentIdx: 0,
        score: 0,
        answered: false
      };
    }

    renderExamQuestion();
  }

  function renderExamQuestion() {
    const container = document.getElementById("exam-stage");
    if (!examSession || examSession.questions.length === 0) return;

    if (examSession.currentIdx >= examSession.questions.length) {
      const pct = Math.round((examSession.score / examSession.questions.length) * 100);
      container.innerHTML = `
        <div class="quiz-card" style="text-align:center;padding:36px;">
          <h2 style="font-family:var(--font-serif);font-size:24px;margin-bottom:8px;">Examination Complete</h2>
          <p style="font-family:var(--font-mono);font-size:18px;color:var(--accent);font-weight:700;margin-bottom:16px;">
            Final Score: ${examSession.score} / ${examSession.questions.length} (${pct}%)
          </p>
          <p style="color:var(--text-muted);max-width:520px;margin:0 auto 20px;">
            ${pct >= 90 ? "Excellent mastery across both written theory and listening identification." : "Review any missed items below or use Section II to drill confusable repertoire pairs."}
          </p>
          <div class="btn-row" style="justify-content:center;">
            <button class="btn btn-primary" onclick="window.startExamMode('mock40')">I. New 40-Q Mock Midterm (25 Theory + 15 Listening)</button>
            <button class="btn" onclick="window.startExamMode('theory25')">II. New 25-Q Theory Examination</button>
            ${state.missedTheoryIds.length > 0 ? `<button class="btn btn-red" onclick="window.startExamMode('theoryMissed')">! Retry Missed Theory Questions (${state.missedTheoryIds.length})</button>` : ""}
          </div>
        </div>
      `;
      return;
    }

    const item = examSession.questions[examSession.currentIdx];
    examSession.answered = false;

    if (item.type === "theory") {
      const q = item.data;
      const optsHtml = q.options
        .map(
          (opt, idx) => `
          <button class="option-btn" onclick="window.submitExamAnswer(${idx})">
            <span class="option-num">${idx + 1}</span>
            <span>${escHtml(opt)}</span>
          </button>
        `
        )
        .join("");

      container.innerHTML = `
        <div class="quiz-card">
          <div class="quiz-header">
            <span class="track-num">Question ${examSession.currentIdx + 1} of ${examSession.questions.length} · Written Theory (${escHtml(q.era)})</span>
            <span class="cue-badge">Score: ${examSession.score} / ${examSession.currentIdx}</span>
          </div>
          <div class="quiz-prompt">${escHtml(q.q)}</div>
          <div class="options-grid" id="exam-options-grid">${optsHtml}</div>
          <div class="feedback-box" id="exam-feedback-box"></div>
          <div class="btn-row" style="margin-top:14px;justify-content:flex-end;">
            <button class="btn btn-primary" id="btn-exam-next" style="display:none;" onclick="window.nextExamQuestion()">Next Question →</button>
          </div>
        </div>
      `;
    } else {
      const lq = item.data;
      playTrack(lq.target, "cue", true);

      const optsHtml = lq.options
        .map(
          (opt, idx) => `
          <button class="option-btn" onclick="window.submitExamAnswer(${idx})">
            <span class="option-num">${idx + 1}</span>
            <div>
              <strong style="font-family:var(--font-serif);font-size:15px;">${escHtml(opt.composer)}</strong> — ${escHtml(opt.title)}
              <div style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono);">No. ${opt.id} · ${escHtml(opt.era)} (${escHtml(opt.genre)})</div>
            </div>
          </button>
        `
        )
        .join("");

      container.innerHTML = `
        <div class="quiz-card">
          <div class="quiz-header">
            <span class="track-num">Question ${examSession.currentIdx + 1} of ${examSession.questions.length} · ♪ Blind Listening Identification</span>
            <span class="cue-badge">Score: ${examSession.score} / ${examSession.currentIdx}</span>
          </div>
          <div class="quiz-prompt">♪ Listen to the excerpt currently playing. Identify the composer and work:</div>
          <div class="btn-row" style="margin-bottom:14px;">
            <button class="btn btn-sm btn-primary" onclick="window.playTrackById(${lq.target.id}, 'cue', true)">↻ Replay from Professor's Cue</button>
            <button class="btn btn-sm" onclick="window.playTrackById(${lq.target.id}, 'random', true)">⤮ Drop Needle Mid-Movement</button>
          </div>
          <div class="options-grid" id="exam-options-grid">${optsHtml}</div>
          <div class="feedback-box" id="exam-feedback-box"></div>
          <div class="btn-row" style="margin-top:14px;justify-content:flex-end;">
            <button class="btn btn-primary" id="btn-exam-next" style="display:none;" onclick="window.nextExamQuestion()">Next Question →</button>
          </div>
        </div>
      `;
    }
  }

  window.submitExamAnswer = function (selectedIdx) {
    if (!examSession || examSession.answered) return;
    examSession.answered = true;

    const item = examSession.questions[examSession.currentIdx];
    const correctIdx = item.data.answer;
    const isCorrect = selectedIdx === correctIdx;

    if (isCorrect) examSession.score++;

    const buttons = document.querySelectorAll("#exam-options-grid .option-btn");
    buttons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === correctIdx) btn.classList.add("correct");
      else if (idx === selectedIdx && !isCorrect) btn.classList.add("wrong");
    });

    const fb = document.getElementById("exam-feedback-box");
    if (item.type === "theory") {
      state.theoryTotal++;
      if (isCorrect) {
        state.theoryCorrect++;
        state.missedTheoryIds = state.missedTheoryIds.filter((id) => id !== item.data.id);
      } else {
        if (!state.missedTheoryIds.includes(item.data.id)) state.missedTheoryIds.push(item.data.id);
      }
      saveState();

      fb.innerHTML = `
        <div class="feedback-title" style="color:${isCorrect ? "var(--green)" : "var(--red)"}">
          ${isCorrect ? "✓ Correct" : `× Incorrect — Correct Answer: (${correctIdx + 1}) ${escHtml(item.data.options[correctIdx])}`}
        </div>
        <div style="font-size:13.5px;">${formatRichText(item.data.exp)}</div>
      `;
    } else {
      state.listeningTotal++;
      if (isCorrect) state.listeningCorrect++;
      saveState();

      isBlindMode = false;
      updateBlindCurtain();
      updateDeckLabels(currentDropMode, currentStartSec);

      const t = item.data.target;
      fb.innerHTML = `
        <div class="feedback-title" style="color:${isCorrect ? "var(--green)" : "var(--red)"}">
          ${isCorrect ? "✓ Correct" : `× Incorrect — Work Playing: No. ${t.id}. ${escHtml(t.composer)} — ${escHtml(t.title)}`}
        </div>
        <div class="info-block" style="margin-bottom:6px;"><strong>♪ Sonic Signature:</strong> ${formatRichText(t.hook)}</div>
        <div class="info-block" style="margin-bottom:6px;"><strong>§ Historical Context:</strong> ${formatRichText(t.history || t.mnemonic)}</div>
        <div class="trap-alert"><strong>† Distinction:</strong> ${formatRichText(t.trapTip)}</div>
      `;
    }

    fb.classList.add("visible");
    document.getElementById("btn-exam-next").style.display = "inline-flex";
  };

  window.nextExamQuestion = function () {
    if (!examSession) return;
    examSession.currentIdx++;
    renderExamQuestion();
  };

  window.startExamMode = function (mode) {
    buildExamSession(mode);
  };

  function bindNavigation() {
    const tabs = document.querySelectorAll(".nav-tab");
    const sections = document.querySelectorAll(".view-section");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetId = tab.dataset.target;
        tabs.forEach((t) => t.classList.toggle("active", t === tab));
        sections.forEach((s) => s.classList.toggle("active", s.id === targetId));
      });
    });
  }

  function bindKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

      const activeSection = document.querySelector(".view-section.active");
      const activeId = activeSection ? activeSection.id : "";

      if (e.code === "Space" && !e.shiftKey) {
        e.preventDefault();
        toggleDeckPlayPause();
      } else if (e.key === "p" || e.key === "P" || e.key === "[") {
        advanceToNextTrack({ delta: -1, autoPlay: true, manual: true });
      } else if (e.key === "]" || (e.shiftKey && e.code === "Space")) {
        advanceToNextTrack({ delta: 1, autoPlay: true, manual: true });
      } else if (e.key === "l" || e.key === "L") {
        toggleLoopPlaylist();
      } else if (e.key === "r" || e.key === "R") {
        document.getElementById("btn-replay-cue").click();
      } else if (e.key === "j" || e.key === "J") {
        document.getElementById("btn-random-drop").click();
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (activeId === "view-blind-quiz" && !listeningAnswered) {
          handleListeningAnswer(idx);
        } else if (activeId === "view-mock-exam" && examSession && !examSession.answered) {
          window.submitExamAnswer(idx);
        }
      } else if (e.key === "n" || e.key === "N" || e.key === "Enter") {
        if (activeId === "view-blind-quiz") {
          startNextListeningQuestion();
        } else if (activeId === "view-mock-exam" && examSession && examSession.answered) {
          window.nextExamQuestion();
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadState();
    updateHeaderStats();
    bindNavigation();
    bindDeckControls();
    bindKeyboardShortcuts();

    document.getElementById("btn-next-listen-q").addEventListener("click", startNextListeningQuestion);
    document.getElementById("quiz-pool-filter").addEventListener("change", (e) => {
      const val = e.target.value;
      if (CATEGORY_MAP[val]) {
        setDeckCategory(val, false);
      }
      startNextListeningQuestion();
    });
    document.getElementById("quiz-drop-mode").addEventListener("change", () => {
      if (currentListeningQ) {
        playTrack(currentListeningQ.target, document.getElementById("quiz-drop-mode").value, isBlindMode);
      }
    });

    renderTrapGroups();

    renderTrackLibrary();
    document.getElementById("lib-search").addEventListener("input", renderTrackLibrary);
    document.getElementById("lib-era-filter").addEventListener("change", renderTrackLibrary);
    document.getElementById("lib-status-filter").addEventListener("change", renderTrackLibrary);

    renderSlidesNotes();
    document.getElementById("notes-deck-filter").addEventListener("change", renderSlidesNotes);
    const eraFilterEl = document.getElementById("notes-era-filter");
    if (eraFilterEl) eraFilterEl.addEventListener("change", renderSlidesNotes);
    document.getElementById("notes-search").addEventListener("input", renderSlidesNotes);

    buildExamSession("theory25");

    const initialTarget = TRACKS[0];
    currentTrack = initialTarget;
    setDeckCategory("all", false);
    setupListeningQuestionForTrack(initialTarget, false);
    updateBlindCurtain();
    updateDeckLabels("cue", 0);
  });
})();
