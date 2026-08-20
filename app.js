(() => {
  "use strict";

  const MEDIA = Object.freeze({
    orientation: "mobile",
    width: 945,
    height: 1680,
    stops: Object.freeze({
      form: "assets/stops/mobile/stop-01-form-in-grain.png",
      air: "assets/stops/mobile/stop-02-air-in-the-body.png",
      touch: "assets/stops/mobile/stop-03-touch-the-signal.png",
      resonate: "assets/stops/mobile/stop-04-let-it-resonate.png"
    })
  });

  const STATIONS = Object.freeze([
    {
      id: "form",
      number: "01",
      label: "FORM IN GRAIN",
      title: ["FORM", "IN GRAIN"],
      duration: 4000,
      from: "form",
      hold: "form",
      renderer: "reveal",
      copy: "木纹先于声音显现。温润表面与轻盈空腔，在一道侧光中建立轮廓。"
    },
    {
      id: "air",
      number: "02",
      label: "AIR IN THE BODY",
      title: ["AIR IN", "THE BODY"],
      duration: 3200,
      from: "form",
      hold: "air",
      renderer: "approach",
      copy: "镜头贴近开孔，空气在木体内部获得空间。"
    },
    {
      id: "touch",
      number: "03",
      label: "TOUCH THE SIGNAL",
      title: ["TOUCH", "THE SIGNAL"],
      duration: 3200,
      from: "air",
      hold: "touch",
      renderer: "hardware",
      copy: "每一个接触点，都以克制的金属反光回应。"
    },
    {
      id: "resonate",
      number: "04",
      label: "LET IT RESONATE",
      title: ["LET IT", "RESONATE"],
      duration: 4600,
      from: "touch",
      hold: "resonate",
      renderer: "recovery",
      copy: "声音尚未响起，共鸣已经发生。"
    }
  ]);

  const canvas = document.querySelector("#stage");
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const chapters = document.querySelector("#chapters");
  const stationNav = document.querySelector("#station-nav");
  const loader = document.querySelector("#loader");
  const loaderStatus = document.querySelector("#loader-status");
  const loaderCount = document.querySelector("#loader-count");
  const loaderBar = document.querySelector("#loader-bar");
  const enterButton = document.querySelector("#enter-button");
  const soundToggle = document.querySelector("#sound-toggle");
  const replayButton = document.querySelector("#replay-button");
  const brandChapter = document.querySelector("#brand-chapter");
  const frameReadout = document.querySelector("#frame-readout");
  const statusLive = document.querySelector("#status-live");

  const reduceMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const media = new Map();
  let grainPattern = null;
  let viewport = { width: innerWidth, height: innerHeight, dpr: 1 };
  let resizeFrame = 0;
  let wheelTimer = 0;
  let touchStartY = null;

  const runtime = {
    phase: "loading",
    current: -1,
    entered: false,
    navTask: null,
    wheelLocked: false,
    soundEnabled: false,
    audioContext: null
  };

  function setPhase(phase) {
    runtime.phase = phase;
    document.body.dataset.phase = phase;
  }

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function mix(from, to, amount) {
    return from + (to - from) * amount;
  }

  function smoothstep(edge0, edge1, value) {
    const x = clamp((value - edge0) / (edge1 - edge0));
    return x * x * (3 - 2 * x);
  }

  function cinematicEase(value) {
    const out = 1 - Math.pow(1 - value, 3);
    const strong = value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
    return out * 0.55 + strong * 0.3 + value * 0.15;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function buildChrome() {
    STATIONS.forEach((station, index) => {
      const section = document.createElement("section");
      section.className = "chapter";
      section.dataset.station = String(index);
      section.setAttribute("aria-hidden", "true");
      const headingTag = index === 0 ? "h1" : "h2";
      section.innerHTML = `
        <p class="chapter-kicker">${station.number} / ${station.label}</p>
        <${headingTag}><span>${station.title[0]}</span><span class="outline">${station.title[1]}</span></${headingTag}>
        <p class="chapter-copy">${station.copy}</p>
        <span class="chapter-count">${station.number} — 04</span>`;
      chapters.appendChild(section);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "station-button interactive";
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `前往第 ${index + 1} 章：${station.label}`);
      button.innerHTML = `<span>${station.number}</span>`;
      button.addEventListener("click", () => navigateTo(index));
      stationNav.appendChild(button);
    });
  }

  function buildGrain() {
    const grain = document.createElement("canvas");
    grain.width = 96;
    grain.height = 96;
    const grainContext = grain.getContext("2d");
    const data = grainContext.createImageData(96, 96);
    for (let index = 0; index < data.data.length; index += 4) {
      const value = 90 + Math.floor(Math.random() * 120);
      data.data[index] = value;
      data.data[index + 1] = value;
      data.data[index + 2] = value;
      data.data[index + 3] = 28 + Math.floor(Math.random() * 38);
    }
    grainContext.putImageData(data, 0, 0);
    grainPattern = context.createPattern(grain, "repeat");
  }

  function resizeCanvas() {
    viewport.width = Math.max(1, innerWidth);
    viewport.height = Math.max(1, innerHeight);
    viewport.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewport.width * viewport.dpr);
    canvas.height = Math.round(viewport.height * viewport.dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    buildGrain();
    if (media.size) {
      if (runtime.current < 0) drawSegment(0, 0);
      else drawHold(runtime.current);
    }
  }

  function portraitRect() {
    const aspect = viewport.width / viewport.height;
    if (aspect < 0.72) return { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const height = viewport.height;
    const width = height * (MEDIA.width / MEDIA.height);
    return { x: (viewport.width - width) / 2, y: 0, width, height };
  }

  function drawCover(image, rect, options = {}) {
    const scale = options.scale ?? 1;
    const imageScale = Math.max(rect.width / image.width, rect.height / image.height) * scale;
    const width = image.width * imageScale;
    const height = image.height * imageScale;
    const x = rect.x + (rect.width - width) / 2 + (options.panX ?? 0) * rect.width;
    const y = rect.y + (rect.height - height) / 2 + (options.panY ?? 0) * rect.height;

    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    context.globalAlpha = options.alpha ?? 1;
    context.filter = `brightness(${options.brightness ?? 1}) saturate(${options.saturation ?? 1}) contrast(${options.contrast ?? 1}) blur(${options.blur ?? 0}px)`;
    context.drawImage(image, x, y, width, height);
    context.restore();
  }

  function clearScene() {
    context.save();
    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    context.fillStyle = "#070604";
    context.fillRect(0, 0, viewport.width, viewport.height);
    context.restore();
  }

  function drawBackdrop(image, alpha = 1) {
    drawCover(image, { x: -34, y: -34, width: viewport.width + 68, height: viewport.height + 68 }, {
      alpha: alpha * 0.58,
      brightness: 0.34,
      saturation: 0.72,
      contrast: 1.08,
      blur: 24,
      scale: 1.08
    });
    context.save();
    context.globalAlpha = 0.34 * alpha;
    context.fillStyle = "#070604";
    context.fillRect(0, 0, viewport.width, viewport.height);
    context.restore();
  }

  function drawLightSweep(progress, intensity = 0.28, vertical = 0.58) {
    const rect = portraitRect();
    const x = rect.x + rect.width * mix(-0.15, 1.15, progress);
    const y = rect.y + rect.height * vertical;
    const radius = rect.width * 0.72;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(229, 171, 83, ${intensity})`);
    gradient.addColorStop(0.22, `rgba(199, 149, 70, ${intensity * 0.42})`);
    gradient.addColorStop(1, "rgba(199, 149, 70, 0)");
    context.save();
    context.globalCompositeOperation = "screen";
    context.fillStyle = gradient;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.restore();
  }

  function drawExposureDip(progress) {
    const pulse = clamp(1 - Math.abs(progress - 0.52) / 0.035);
    if (!pulse) return;
    context.save();
    context.globalAlpha = pulse * 0.16;
    context.fillStyle = "#070604";
    context.fillRect(0, 0, viewport.width, viewport.height);
    context.restore();
  }

  function drawPostEffects() {
    const vignette = context.createRadialGradient(
      viewport.width * 0.5,
      viewport.height * 0.48,
      Math.min(viewport.width, viewport.height) * 0.18,
      viewport.width * 0.5,
      viewport.height * 0.5,
      Math.max(viewport.width, viewport.height) * 0.72
    );
    vignette.addColorStop(0, "rgba(7, 6, 4, 0)");
    vignette.addColorStop(0.72, "rgba(7, 6, 4, 0.12)");
    vignette.addColorStop(1, "rgba(7, 6, 4, 0.58)");
    context.save();
    context.fillStyle = vignette;
    context.fillRect(0, 0, viewport.width, viewport.height);
    if (grainPattern) {
      context.globalCompositeOperation = "soft-light";
      context.globalAlpha = 0.12;
      context.translate(-Math.floor(Math.random() * 96), -Math.floor(Math.random() * 96));
      context.fillStyle = grainPattern;
      context.fillRect(0, 0, viewport.width + 96, viewport.height + 96);
    }
    context.restore();
  }

  function drawStill(key, options = {}) {
    const image = media.get(key);
    if (!image) return;
    drawCover(image, portraitRect(), options);
  }

  function drawReduced(segmentIndex, progress) {
    const station = STATIONS[segmentIndex];
    const from = media.get(station.from);
    const to = media.get(station.hold);
    clearScene();
    drawBackdrop(progress < 0.5 ? from : to);
    if (segmentIndex === 0) {
      drawStill("form", { brightness: mix(0.18, 1, progress), alpha: mix(0.35, 1, progress) });
    } else {
      drawStill(station.from, { alpha: 1 - progress });
      drawStill(station.hold, { alpha: progress });
    }
    drawPostEffects();
  }

  function drawSegment(segmentIndex, progress) {
    const t = clamp(progress);
    if (!media.size) {
      clearScene();
      return;
    }
    if (reduceMotionQuery.matches) {
      drawReduced(segmentIndex, t);
      return;
    }

    clearScene();
    const rect = portraitRect();

    if (segmentIndex === 0) {
      const image = media.get("form");
      drawBackdrop(image);
      drawStill("form", {
        scale: mix(1.12, 1, t),
        panY: mix(0.035, 0, t),
        brightness: mix(0.13, 1, t),
        saturation: mix(0.72, 1, t),
        alpha: mix(0.42, 1, t)
      });
      context.save();
      context.globalAlpha = mix(0.72, 0, t);
      context.fillStyle = "#070604";
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
      drawLightSweep(t, 0.24 * t, 0.62);
    } else if (segmentIndex === 1) {
      const morph = smoothstep(0.2, 0.92, t);
      drawBackdrop(media.get("form"), 1 - morph);
      drawBackdrop(media.get("air"), morph);
      drawStill("form", {
        alpha: 1 - morph,
        scale: mix(1, 1.38, t),
        panX: mix(0, -0.055, t),
        panY: mix(0, 0.035, t)
      });
      drawStill("air", {
        alpha: morph,
        scale: mix(1.14, 1, morph),
        panX: mix(0.03, 0, morph),
        panY: mix(-0.02, 0, morph)
      });
      drawLightSweep(t, 0.34, 0.59);
      drawExposureDip(t);
    } else if (segmentIndex === 2) {
      const morph = smoothstep(0.18, 0.88, t);
      drawBackdrop(media.get("air"), 1 - morph);
      drawBackdrop(media.get("touch"), morph);
      drawStill("air", {
        alpha: 1 - morph,
        scale: mix(1, 1.2, t),
        panX: mix(0, -0.045, t),
        panY: mix(0, -0.02, t)
      });
      drawStill("touch", {
        alpha: morph,
        scale: mix(1.13, 1, morph),
        panX: mix(0.035, 0, morph),
        panY: mix(0.02, 0, morph)
      });
      drawLightSweep(t, 0.25 + 0.12 * Math.sin(t * Math.PI), 0.67);
      drawExposureDip(t);
    } else {
      const morph = smoothstep(0.24, 0.88, t);
      drawBackdrop(media.get("touch"), 1 - morph);
      drawBackdrop(media.get("resonate"), morph);
      drawStill("touch", {
        alpha: 1 - morph,
        scale: mix(1, 1.2, t),
        panY: mix(0, 0.075, t)
      });
      drawStill("resonate", {
        alpha: morph,
        scale: mix(1.72, 1, morph),
        panX: mix(0.04, 0, morph),
        panY: mix(0.2, 0, morph)
      });
      drawLightSweep(clamp((t - 0.2) / 0.8), 0.2, 0.48);
      drawExposureDip(t);
    }

    drawPostEffects();
  }

  function drawHold(index) {
    const station = STATIONS[index];
    if (!station || !media.size) return;
    clearScene();
    const image = media.get(station.hold);
    drawBackdrop(image);
    drawStill(station.hold);
    drawPostEffects();
    frameReadout.textContent = `STILL / ${station.number}`;
  }

  function updateChrome(index) {
    document.body.dataset.station = String(index);
    const station = STATIONS[index];
    brandChapter.textContent = station.number;
    [...chapters.children].forEach((chapter, chapterIndex) => {
      const active = chapterIndex === index;
      chapter.classList.toggle("active", active);
      chapter.setAttribute("aria-hidden", String(!active));
    });
    [...stationNav.children].forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
    });
    statusLive.textContent = `第 ${index + 1} 章，共 ${STATIONS.length} 章：${station.label}`;
  }

  function hideCaptions() {
    [...chapters.children].forEach((chapter) => {
      chapter.classList.remove("active");
      chapter.setAttribute("aria-hidden", "true");
    });
  }

  function settleStation(index) {
    runtime.current = index;
    drawHold(index);
    updateChrome(index);
    setPhase("settled");
    playTone(index);
  }

  function playAdjacent(target) {
    if (runtime.phase === "playing") return Promise.resolve();
    const forward = target > runtime.current;
    const segmentIndex = forward ? target : runtime.current;
    const station = STATIONS[segmentIndex];
    const duration = reduceMotionQuery.matches ? 320 : station.duration;
    hideCaptions();
    setPhase("playing");
    frameReadout.textContent = `${station.number} / 000%`;

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now) => {
        const raw = clamp((now - startedAt) / duration);
        const eased = cinematicEase(raw);
        const timeline = forward ? eased : 1 - eased;
        drawSegment(segmentIndex, timeline);
        frameReadout.textContent = `${station.number} / ${String(Math.round(raw * 100)).padStart(3, "0")}%`;
        if (raw < 1) requestAnimationFrame(tick);
        else {
          settleStation(target);
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  function navigateTo(target) {
    if (!runtime.entered || runtime.navTask || target === runtime.current) return;
    const boundedTarget = clamp(target, 0, STATIONS.length - 1);
    runtime.navTask = (async () => {
      while (runtime.current !== boundedTarget) {
        const next = runtime.current < boundedTarget ? runtime.current + 1 : runtime.current - 1;
        await playAdjacent(next);
      }
    })().finally(() => {
      runtime.navTask = null;
    });
  }

  function onIntent(direction) {
    if (!runtime.entered || runtime.navTask || runtime.phase === "playing") return;
    const target = clamp(runtime.current + direction, 0, STATIONS.length - 1);
    if (target === runtime.current) {
      playTone(runtime.current, true);
      return;
    }
    navigateTo(target);
  }

  function ensureAudioContext() {
    if (!runtime.audioContext) runtime.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    return runtime.audioContext;
  }

  function playTone(index, boundary = false) {
    if (!runtime.soundEnabled) return;
    const audioContext = ensureAudioContext();
    const now = audioContext.currentTime;
    const frequencies = [164.8, 220, 277.2, 329.6];
    const oscillator = audioContext.createOscillator();
    const overtone = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "triangle";
    overtone.type = "sine";
    const frequency = boundary ? 110 : frequencies[index] || 220;
    oscillator.frequency.setValueAtTime(frequency, now);
    overtone.frequency.setValueAtTime(frequency * 2.01, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(boundary ? 0.008 : 0.018, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    oscillator.connect(gain);
    overtone.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    overtone.start(now);
    oscillator.stop(now + 0.45);
    overtone.stop(now + 0.45);
  }

  async function loadImageAssets() {
    const entries = Object.entries(MEDIA.stops).filter(([key]) => key !== "resonate");
    let completed = 0;

    const updateProgress = () => {
      const progress = Math.round(clamp(completed / entries.length) * 100);
      loader.style.setProperty("--progress", `${progress}%`);
      loaderBar.style.width = `${progress}%`;
      loaderCount.textContent = `${String(progress).padStart(3, "0")}%`;
    };

    await Promise.all(entries.map(([key, source], index) => new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = index === 0 ? "high" : "auto";
      image.onload = () => {
        media.set(key, image);
        completed += 1;
        updateProgress();
        resolve();
      };
      image.onerror = () => reject(new Error(`Unable to load ${source}`));
      image.src = source;
    })));
    media.set("resonate", media.get("form"));
  }

  async function beginExperience() {
    if (runtime.phase === "error") {
      location.reload();
      return;
    }
    if (runtime.entered || runtime.phase !== "ready") return;
    runtime.entered = true;
    loader.classList.add("leaving");
    await sleep(480);
    await playAdjacent(0);
  }

  async function initialize() {
    buildChrome();
    resizeCanvas();
    drawSegment(0, 0);
    try {
      await loadImageAssets();
      drawSegment(0, 0);
      loader.style.setProperty("--progress", "100%");
      loaderCount.textContent = "100%";
      loaderStatus.textContent = "LOCAL KEYFRAMES READY";
      enterButton.disabled = false;
      enterButton.classList.add("ready");
      setPhase("ready");
      statusLive.textContent = "素材加载完成，可以进入体验。";
    } catch (error) {
      console.error(error);
      setPhase("error");
      loaderStatus.textContent = "LOCAL ASSET ERROR — RETRY";
      loaderCount.textContent = "ERR";
      enterButton.textContent = "RETRY LOADING";
      enterButton.disabled = false;
      enterButton.classList.add("ready");
      statusLive.textContent = "本地素材加载失败，请重试。";
    }
  }

  enterButton.addEventListener("click", beginExperience);

  soundToggle.addEventListener("click", async () => {
    const audioContext = ensureAudioContext();
    await audioContext.resume().catch(() => {});
    runtime.soundEnabled = !runtime.soundEnabled;
    soundToggle.setAttribute("aria-pressed", String(runtime.soundEnabled));
    soundToggle.lastChild.textContent = ` SOUND — ${runtime.soundEnabled ? "ON" : "OFF"}`;
    if (runtime.soundEnabled) playTone(Math.max(runtime.current, 0));
  });

  replayButton.addEventListener("click", async () => {
    if (runtime.navTask || runtime.phase === "playing") return;
    hideCaptions();
    runtime.current = -1;
    document.body.dataset.station = "-1";
    drawSegment(0, 0);
    await playAdjacent(0);
  });

  document.querySelector(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo(0);
  });

  addEventListener("wheel", (event) => {
    if (!runtime.entered || Math.abs(event.deltaY) < 7) return;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { runtime.wheelLocked = false; }, 380);
    if (runtime.wheelLocked || runtime.phase === "playing" || runtime.navTask) return;
    runtime.wheelLocked = true;
    onIntent(event.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  addEventListener("keydown", (event) => {
    if (!runtime.entered) return;
    const forward = ["Enter", "ArrowDown", "ArrowRight", "PageDown", " "];
    const backward = ["ArrowUp", "ArrowLeft", "PageUp"];
    if (forward.includes(event.key)) {
      event.preventDefault();
      onIntent(1);
    } else if (backward.includes(event.key)) {
      event.preventDefault();
      onIntent(-1);
    }
  });

  addEventListener("touchstart", (event) => {
    touchStartY = event.touches[0]?.clientY ?? null;
  }, { passive: true });

  addEventListener("touchend", (event) => {
    if (touchStartY === null) return;
    const endY = event.changedTouches[0]?.clientY ?? touchStartY;
    const distance = touchStartY - endY;
    touchStartY = null;
    if (Math.abs(distance) > 44) onIntent(distance > 0 ? 1 : -1);
  }, { passive: true });

  addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resizeCanvas);
  });

  reduceMotionQuery.addEventListener?.("change", () => {
    if (runtime.current >= 0) drawHold(runtime.current);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && runtime.audioContext?.state === "running") runtime.audioContext.suspend().catch(() => {});
    if (!document.hidden && runtime.soundEnabled && runtime.audioContext?.state === "suspended") runtime.audioContext.resume().catch(() => {});
  });

  initialize();
})();
