(() => {
  "use strict";

  const MEDIA = Object.freeze({
    orientation: "mobile",
    width: 989,
    height: 3000,
    stops: Object.freeze({
      form: "assets/product/cv60s-thinline/front-full-hd.png",
      air: "assets/product/cv60s-thinline/body-angle-hd.png",
      touch: "assets/product/cv60s-thinline/body-detail-hd.png",
      resonate: "assets/product/cv60s-thinline/headstock-front-hd.png"
    })
  });

  const PRODUCT_FRAMING = Object.freeze({
    form: Object.freeze({ scale: 0.96, panX: 0.05, panY: 0.01, rotation: -Math.PI / 2, mobileScale: 0.92, mobilePanX: 0.08, mobilePanY: 0.03 }),
    air: Object.freeze({ scale: 2.12, panX: 0.5, panY: 0.06, mobileScale: 1.92, mobilePanX: 0.54, mobilePanY: 0.18 }),
    touch: Object.freeze({ scale: 1.38, panX: 0.03, panY: 0.05, mobileScale: 1.56, mobilePanX: 0.04, mobilePanY: 0.24 }),
    resonate: Object.freeze({ scale: 1.9, panX: 0.06, panY: 0.08, mobileScale: 1.36, mobilePanX: -0.18, mobilePanY: 0.2 })
  });

  const INSPECTION_TARGETS = Object.freeze([
    Object.freeze({
      at: 0.14,
      desktop: Object.freeze({ cx: 0.55, cy: 0.36, rx: 0.15, ry: 0.09 }),
      mobile: Object.freeze({ cx: 0.52, cy: 0.61, rx: 0.22, ry: 0.09 })
    }),
    Object.freeze({
      at: 0.3,
      desktop: Object.freeze({ cx: 0.61, cy: 0.68, rx: 0.14, ry: 0.11 }),
      mobile: Object.freeze({ cx: 0.58, cy: 0.84, rx: 0.2, ry: 0.1 })
    }),
    Object.freeze({
      at: 0.46,
      desktop: Object.freeze({ cx: 0.9, cy: 0.63, rx: 0.1, ry: 0.13 }),
      mobile: Object.freeze({ cx: 0.96, cy: 0.79, rx: 0.14, ry: 0.12 })
    })
  ]);

  const TRANSITION_DURATIONS = Object.freeze([1450, 1900, 1800, 2100]);
  const COVER_JOURNEY_DELAY = 420;
  const COVER_JOURNEY_DURATION = 5400;

  const STATIONS = Object.freeze([
    {
      id: "form",
      number: "01",
      eyebrow: "半空心琴体",
      title: ["SEMI", "HOLLOW"],
      from: "form",
      hold: "form",
      renderer: "reveal",
      lead: "Telecaster 琴体内部挖出空腔。",
      detail: "这副 Nyatoh 琴体以单 F 孔呈现半空心结构，在减轻重量的同时保留熟悉的琴体轮廓。"
    },
    {
      id: "air",
      number: "02",
      eyebrow: "F 孔",
      title: ["THE", "F-HOLE"],
      from: "form",
      hold: "air",
      renderer: "approach",
      lead: "单 F 孔让半空心腔体与外界相通。",
      detail: "它让未插电的琴声多一层空气感，也直观显露内部空腔；扩声仍主要由拾音器完成。"
    },
    {
      id: "touch",
      number: "03",
      eyebrow: "拾音、琴桥与控制",
      title: ["PICKUPS", "HARDWARE"],
      from: "air",
      hold: "touch",
      renderer: "hardware",
      lead: "两枚 Fender-Designed Alnico 单线圈负责拾音。",
      detail: "颈位金属罩拾音器、桥位 Tele 单线圈、穿体式琴桥、三档开关，以及主音量与主音色构成同一套硬件布局。"
    },
    {
      id: "resonate",
      number: "04",
      eyebrow: "琴头与调音",
      title: ["HEADSTOCK", "TUNING"],
      from: "touch",
      hold: "resonate",
      renderer: "recovery",
      lead: "六枚复古式弦钮分别固定并调节琴弦。",
      detail: "Telecaster 六连式琴头让弦路保持直观；弦树维持上弦枕后的下压力，帮助琴弦稳定贴合。"
    }
  ]);

  const canvas = document.querySelector("#stage");
  const context = canvas.getContext("2d", { alpha: false });
  const chapters = document.querySelector("#chapters");
  const stationNav = document.querySelector("#station-nav");
  const loader = document.querySelector("#loader");
  const loaderStatus = document.querySelector("#loader-status");
  const loaderCount = document.querySelector("#loader-count");
  const loaderBar = document.querySelector("#loader-bar");
  const enterButton = document.querySelector("#enter-button");
  const replayButton = document.querySelector("#replay-button");
  const brandChapter = document.querySelector("#brand-chapter");
  const frameReadout = document.querySelector("#frame-readout");
  const statusLive = document.querySelector("#status-live");
  const pickCursor = document.querySelector("#pick-cursor");
  const pickCursorImage = pickCursor?.querySelector("img");

  const reduceMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const media = new Map();
  let grainPattern = null;
  let featherCanvas = null;
  let featherContext = null;
  let viewport = { width: innerWidth, height: innerHeight, dpr: 1 };
  let resizeFrame = 0;
  let wheelTimer = 0;
  let boundaryTimer = 0;
  let touchStartY = null;

  const runtime = {
    phase: "loading",
    current: -1,
    target: -1,
    entered: false,
    animationFrame: 0,
    coverAnimationFrame: 0,
    coverAnimationStart: 0,
    coverProgress: 0,
    transitionToken: 0,
    wheelLocked: false
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
        <p class="chapter-kicker">${station.number} / ${station.eyebrow}</p>
        <${headingTag}><span>${station.title[0]}</span><span class="outline">${station.title[1]}</span></${headingTag}>
        <div class="chapter-copy">
          <p class="chapter-lead">${station.lead}</p>
          <p class="chapter-detail">${station.detail}</p>
        </div>`;
      chapters.appendChild(section);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "station-button interactive";
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `前往第 ${index + 1} 章：${station.eyebrow}`);
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
    featherCanvas ||= document.createElement("canvas");
    featherContext ||= featherCanvas.getContext("2d");
    featherCanvas.width = canvas.width;
    featherCanvas.height = canvas.height;
    featherContext.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    featherContext.imageSmoothingEnabled = true;
    featherContext.imageSmoothingQuality = "high";
    buildGrain();
    if (media.size) {
      if (!runtime.entered && runtime.phase === "ready") drawCoverJourney(runtime.coverProgress);
      else if (runtime.current < 0) drawSegment(0, 0);
      else drawHold(runtime.current);
    }
  }

  function portraitRect() {
    const aspect = viewport.width / viewport.height;
    if (aspect < 0.72) return { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const height = viewport.height;
    const width = height * (MEDIA.width / MEDIA.height);
    const centerX = viewport.width >= 760 ? viewport.width * 0.61 : viewport.width / 2;
    return { x: centerX - width / 2, y: 0, width, height };
  }

  function drawCover(image, rect, options = {}, targetContext = context) {
    const scale = options.scale ?? 1;
    const rotation = options.rotation ?? 0;
    const quarterTurn = Math.abs(Math.sin(rotation)) > 0.5;
    const visualSourceWidth = quarterTurn ? image.height : image.width;
    const visualSourceHeight = quarterTurn ? image.width : image.height;
    const fitScale = options.fit === "contain"
      ? Math.min(rect.width / visualSourceWidth, rect.height / visualSourceHeight)
      : Math.max(rect.width / visualSourceWidth, rect.height / visualSourceHeight);
    const imageScale = fitScale * scale;
    const sourceWidth = image.width * imageScale;
    const sourceHeight = image.height * imageScale;
    const width = visualSourceWidth * imageScale;
    const height = visualSourceHeight * imageScale;
    const centerX = rect.x + rect.width / 2 + (options.panX ?? 0) * rect.width;
    const centerY = rect.y + rect.height / 2 + (options.panY ?? 0) * rect.height;

    targetContext.save();
    if (options.clip !== false) {
      targetContext.beginPath();
      targetContext.rect(rect.x, rect.y, rect.width, rect.height);
      targetContext.clip();
    }
    targetContext.globalAlpha = options.alpha ?? 1;
    targetContext.filter = `brightness(${options.brightness ?? 1}) saturate(${options.saturation ?? 1}) contrast(${options.contrast ?? 1}) blur(${options.blur ?? 0}px)`;
    targetContext.translate(centerX, centerY);
    targetContext.rotate(rotation);
    targetContext.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    targetContext.restore();
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  }

  function clearScene() {
    context.save();
    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    context.fillStyle = "#070604";
    context.fillRect(0, 0, viewport.width, viewport.height);
    context.restore();
  }

  function drawBackdrop(key, alpha = 1) {
    const rect = portraitRect();
    drawStill(key, {
      alpha: alpha * 0.15,
      scale: 1.5,
      brightness: 0.42,
      saturation: 0.72,
      contrast: 1.08,
      blur: 30
    });
    const glow = context.createRadialGradient(
      rect.x + rect.width * 0.52,
      rect.y + rect.height * 0.62,
      0,
      rect.x + rect.width * 0.52,
      rect.y + rect.height * 0.62,
      rect.width * 0.94
    );
    glow.addColorStop(0, "rgba(120, 69, 31, 0.34)");
    glow.addColorStop(0.44, "rgba(73, 40, 19, 0.18)");
    glow.addColorStop(1, "rgba(7, 6, 4, 0)");

    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = glow;
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
    const frame = PRODUCT_FRAMING[key] || {};
    const mobile = viewport.width < 760;
    const targetContext = options.targetContext || context;
    const baseScale = mobile ? (frame.mobileScale ?? frame.scale ?? 1) : (frame.scale ?? 1);
    const basePanX = mobile ? (frame.mobilePanX ?? frame.panX ?? 0) : (frame.panX ?? 0);
    const basePanY = mobile ? (frame.mobilePanY ?? frame.panY ?? 0) : (frame.panY ?? 0);
    const { targetContext: _targetContext, ...drawOptions } = options;
    return drawCover(image, portraitRect(), {
      ...drawOptions,
      fit: "contain",
      clip: false,
      scale: baseScale * (options.scale ?? 1),
      panX: basePanX + (options.panX ?? 0),
      panY: basePanY + (options.panY ?? 0),
      rotation: frame.rotation ?? 0
    }, targetContext);
  }

  function drawFeatheredStill(key, options = {}) {
    if (!featherCanvas || !featherContext) return drawStill(key, options);
    const alpha = options.alpha ?? 1;
    featherContext.save();
    featherContext.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    featherContext.clearRect(0, 0, viewport.width, viewport.height);
    featherContext.restore();

    const bounds = drawStill(key, { ...options, alpha: 1, targetContext: featherContext });
    if (!bounds) return;

    const horizontal = featherContext.createLinearGradient(bounds.x, 0, bounds.x + bounds.width, 0);
    horizontal.addColorStop(0, "rgba(255,255,255,0)");
    horizontal.addColorStop(0.1, "rgba(255,255,255,1)");
    horizontal.addColorStop(0.9, "rgba(255,255,255,1)");
    horizontal.addColorStop(1, "rgba(255,255,255,0)");
    const vertical = featherContext.createLinearGradient(0, bounds.y, 0, bounds.y + bounds.height);
    vertical.addColorStop(0, "rgba(255,255,255,0)");
    vertical.addColorStop(0.1, "rgba(255,255,255,1)");
    vertical.addColorStop(0.9, "rgba(255,255,255,1)");
    vertical.addColorStop(1, "rgba(255,255,255,0)");

    featherContext.save();
    featherContext.globalCompositeOperation = "destination-in";
    featherContext.fillStyle = horizontal;
    featherContext.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    featherContext.fillStyle = vertical;
    featherContext.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    featherContext.restore();

    context.save();
    context.globalAlpha = alpha;
    context.drawImage(
      featherCanvas,
      0,
      0,
      featherCanvas.width,
      featherCanvas.height,
      0,
      0,
      viewport.width,
      viewport.height
    );
    context.restore();
  }

  function drawPrimary(key, options = {}) {
    return key === "touch" || key === "resonate"
      ? drawFeatheredStill(key, options)
      : drawStill(key, options);
  }

  function drawCoverJourney(progress) {
    const t = clamp(progress);
    const travel = smoothstep(0.04, 1, t);
    clearScene();
    drawBackdrop("form");
    drawStill("form", {
      scale: mix(2.12, 2.55, smoothstep(0.18, 1, travel)),
      panX: mix(0.035, -0.02, travel),
      panY: mix(-0.53, 0.68, travel),
      brightness: mix(0.88, 1.1, smoothstep(0, 0.88, travel)),
      saturation: mix(0.9, 1.04, travel),
      contrast: mix(1.02, 1.08, travel)
    });
    drawLightSweep(smoothstep(0.08, 0.92, travel), 0.22, mix(0.74, 0.3, travel));
    drawPostEffects();
  }

  function startCoverJourney() {
    cancelAnimationFrame(runtime.coverAnimationFrame);
    runtime.coverAnimationStart = 0;
    runtime.coverProgress = 0;
    if (reduceMotionQuery.matches) {
      drawSegment(0, 1);
      return;
    }

    const step = (timestamp) => {
      if (runtime.entered || runtime.phase !== "ready") return;
      runtime.coverAnimationStart ||= timestamp;
      runtime.coverProgress = clamp(
        (timestamp - runtime.coverAnimationStart - COVER_JOURNEY_DELAY) / COVER_JOURNEY_DURATION
      );
      drawCoverJourney(runtime.coverProgress);
      if (runtime.coverProgress < 1) {
        runtime.coverAnimationFrame = requestAnimationFrame(step);
      }
    };

    runtime.coverAnimationFrame = requestAnimationFrame(step);
  }

  function drawInspectionPass(progress, alpha = 1) {
    const rect = portraitRect();
    const mobile = viewport.width < 760;
    for (const target of INSPECTION_TARGETS) {
      const spec = mobile ? target.mobile : target.desktop;
      const strength = clamp(1 - Math.abs(progress - target.at) / 0.14);
      if (!strength) continue;
      const centerX = rect.x + rect.width * spec.cx;
      const centerY = rect.y + rect.height * spec.cy;
      const radius = Math.max(rect.width * spec.rx, rect.height * spec.ry);
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.45);
      glow.addColorStop(0, `rgba(229, 171, 83, ${0.12 * strength * alpha})`);
      glow.addColorStop(0.48, `rgba(199, 149, 70, ${0.045 * strength * alpha})`);
      glow.addColorStop(1, "rgba(199, 149, 70, 0)");

      context.save();
      context.globalCompositeOperation = "screen";
      context.fillStyle = glow;
      context.fillRect(0, 0, viewport.width, viewport.height);
      context.globalAlpha = alpha * strength * 0.54;
      context.strokeStyle = "#c79546";
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(centerX, centerY, rect.width * spec.rx, rect.height * spec.ry, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  function drawReduced(segmentIndex, progress) {
    const station = STATIONS[segmentIndex];
    clearScene();
    drawBackdrop(progress < 0.5 ? station.from : station.hold);
    if (segmentIndex === 0) {
      drawPrimary("form", { brightness: mix(0.18, 1, progress), alpha: mix(0.35, 1, progress) });
    } else {
      drawPrimary(station.from, { alpha: 1 - progress });
      drawPrimary(station.hold, {
        alpha: progress,
        brightness: segmentIndex === 3 ? mix(1, 1.08, progress) : 1,
        saturation: segmentIndex === 3 ? mix(1, 1.08, progress) : 1
      });
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
      drawBackdrop("form");
      drawPrimary("form", {
        scale: mix(1.12, 1, t),
        panY: mix(0.035, 0, t),
        brightness: mix(0.13, 1, t),
        saturation: mix(0.72, 1, t),
        alpha: mix(0.42, 1, t)
      });
      context.save();
      context.globalAlpha = mix(0.72, 0, t);
      context.fillStyle = "#070604";
      context.fillRect(0, 0, viewport.width, viewport.height);
      context.restore();
      drawLightSweep(t, 0.24 * t, 0.62);
    } else if (segmentIndex === 1) {
      const morph = smoothstep(0.12, 0.92, t);
      const outgoing = smoothstep(0.28, 0.86, t);
      drawBackdrop("form", 1 - morph);
      drawBackdrop("air", morph);
      drawPrimary("form", {
        alpha: 1 - outgoing,
        scale: mix(1, 1.48, t),
        panX: mix(0, -0.08, t),
        panY: mix(0, 0.02, t),
        blur: mix(0, 2.4, outgoing),
        brightness: mix(1, 0.76, outgoing)
      });
      drawPrimary("air", {
        alpha: smoothstep(0.18, 0.9, t),
        scale: mix(0.72, 1, morph),
        panX: mix(0.12, 0, morph),
        panY: mix(-0.03, 0, morph),
        brightness: mix(0.72, 1, morph),
        contrast: mix(0.92, 1, morph)
      });
      drawLightSweep(smoothstep(0.16, 0.92, t), 0.26, 0.58);
    } else if (segmentIndex === 2) {
      const morph = smoothstep(0.14, 0.92, t);
      const outgoing = smoothstep(0.3, 0.88, t);
      drawBackdrop("air", 1 - morph);
      drawBackdrop("touch", morph);
      drawPrimary("air", {
        alpha: 1 - outgoing,
        scale: mix(1, 1.32, t),
        panX: mix(0, -0.2, t),
        panY: mix(0, -0.025, t),
        blur: mix(0, 2.2, outgoing),
        brightness: mix(1, 0.78, outgoing)
      });
      drawPrimary("touch", {
        alpha: smoothstep(0.18, 0.92, t),
        scale: mix(0.76, 1, morph),
        panX: mix(-0.1, 0, morph),
        panY: mix(-0.045, 0, morph),
        brightness: mix(0.74, 1, morph),
        contrast: mix(0.94, 1, morph)
      });
      drawLightSweep(smoothstep(0.1, 0.9, t), 0.22 + 0.1 * Math.sin(t * Math.PI), 0.66);
    } else {
      const morph = smoothstep(0.56, 0.94, t);
      drawBackdrop("touch", 1 - morph);
      drawBackdrop("resonate", morph);
      drawPrimary("touch", {
        alpha: 1 - morph,
        scale: mix(1, 1.06, smoothstep(0.06, 0.56, t)),
        panX: mix(0, -0.035, smoothstep(0.06, 0.56, t)),
        panY: mix(0, 0.018, smoothstep(0.06, 0.56, t)),
        brightness: mix(1, 0.84, morph)
      });
      drawInspectionPass(t, 1 - morph);
      drawPrimary("resonate", {
        alpha: morph,
        scale: mix(0.64, 1, morph),
        panX: mix(-0.1, 0, morph),
        panY: mix(0.16, 0, morph),
        brightness: mix(0.72, 1.08, morph),
        saturation: mix(0.84, 1.04, morph)
      });
      drawLightSweep(smoothstep(0.3, 0.95, t), 0.2, 0.5);
    }

    drawPostEffects();
  }

  function drawJump(fromIndex, targetIndex, progress) {
    const fromStation = STATIONS[Math.max(0, fromIndex)];
    const targetStation = STATIONS[targetIndex];
    const morph = smoothstep(0.08, 0.92, progress);
    clearScene();
    drawBackdrop(fromStation.hold, 1 - morph);
    drawBackdrop(targetStation.hold, morph);
    drawPrimary(fromStation.hold, {
      alpha: 1 - morph,
      scale: mix(1, 1.06, morph),
      brightness: mix(1, 0.8, morph)
    });
    drawPrimary(targetStation.hold, {
      alpha: morph,
      scale: mix(1.06, 1, morph),
      brightness: targetIndex === 3 ? mix(0.92, 1.08, morph) : mix(0.92, 1, morph),
      saturation: targetIndex === 3 ? mix(0.94, 1.08, morph) : 1
    });
    drawLightSweep(morph, 0.18, 0.58);
    drawPostEffects();
  }

  function drawHold(index) {
    const station = STATIONS[index];
    if (!station || !media.size) return;
    clearScene();
    drawBackdrop(station.hold);
    drawPrimary(station.hold, index === 3 ? { brightness: 1.08, saturation: 1.08 } : {});
    drawPostEffects();
    frameReadout.textContent = `第 ${station.number} 章 / 共 04 章`;
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
    statusLive.textContent = `第 ${index + 1} 章，共 ${STATIONS.length} 章：${station.eyebrow}`;
  }

  function settleStation(index) {
    runtime.current = index;
    runtime.target = index;
    drawHold(index);
    updateChrome(index);
    setPhase("settled");
    stationNav.setAttribute("aria-busy", "false");
  }

  function navigateTo(target) {
    if (!runtime.entered) return;
    const boundedTarget = clamp(target, 0, STATIONS.length - 1);
    if (runtime.phase === "playing" && boundedTarget === runtime.target) return;
    if (boundedTarget === runtime.current) {
      if (runtime.phase === "playing") {
        runtime.transitionToken += 1;
        cancelAnimationFrame(runtime.animationFrame);
        settleStation(boundedTarget);
      }
      return;
    }

    const fromIndex = runtime.current;
    const token = ++runtime.transitionToken;
    const adjacentSegment = fromIndex < 0 ? 0 : Math.max(fromIndex, boundedTarget);
    const duration = reduceMotionQuery.matches
      ? 220
      : (Math.abs(boundedTarget - fromIndex) <= 1 ? TRANSITION_DURATIONS[adjacentSegment] : 1250);
    cancelAnimationFrame(runtime.animationFrame);
    runtime.target = boundedTarget;
    updateChrome(boundedTarget);
    setPhase("playing");
    stationNav.setAttribute("aria-busy", "true");
    frameReadout.textContent = `第 ${STATIONS[boundedTarget].number} 章 / 000%`;

    const startedAt = performance.now();
    const tick = (now) => {
      if (token !== runtime.transitionToken) return;
      const raw = clamp((now - startedAt) / duration);
      const eased = cinematicEase(raw);
      if (fromIndex < 0 && boundedTarget === 0) {
        drawSegment(0, eased);
      } else if (Math.abs(boundedTarget - fromIndex) === 1) {
        const forward = boundedTarget > fromIndex;
        const segmentIndex = forward ? boundedTarget : fromIndex;
        drawSegment(segmentIndex, forward ? eased : 1 - eased);
      } else {
        drawJump(fromIndex, boundedTarget, eased);
      }
      frameReadout.textContent = `第 ${STATIONS[boundedTarget].number} 章 / ${String(Math.round(raw * 100)).padStart(3, "0")}%`;
      if (raw < 1) runtime.animationFrame = requestAnimationFrame(tick);
      else settleStation(boundedTarget);
    };
    runtime.animationFrame = requestAnimationFrame(tick);
  }

  function signalBoundary(index) {
    clearTimeout(boundaryTimer);
    stationNav.classList.remove("boundary");
    requestAnimationFrame(() => stationNav.classList.add("boundary"));
    boundaryTimer = setTimeout(() => stationNav.classList.remove("boundary"), 420);
    statusLive.textContent = index === 0 ? "已经是第一章。" : "已经是最后一章。";
  }

  function onIntent(direction) {
    if (!runtime.entered) return;
    const base = runtime.phase === "playing" ? runtime.target : runtime.current;
    const target = clamp(base + direction, 0, STATIONS.length - 1);
    if (target === base) {
      signalBoundary(base);
      return;
    }
    navigateTo(target);
  }

  async function loadImageAssets() {
    const entries = Object.entries(MEDIA.stops);
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
  }

  async function setupPickCursor() {
    if (!pickCursor || !pickCursorImage) return;
    try {
      await pickCursorImage.decode();
      document.body.classList.add("pick-cursor-ready");
    } catch (error) {
      console.warn("Pick cursor image unavailable; keeping the native pointer.", error);
    }
  }

  function movePickCursor(event) {
    if (!document.body.classList.contains("pick-cursor-ready") || !pickCursor) return;
    pickCursor.dataset.pointer = event.pointerType || "mouse";
    pickCursor.style.setProperty("--pick-x", `${event.clientX}px`);
    pickCursor.style.setProperty("--pick-y", `${event.clientY}px`);
    pickCursor.style.setProperty("--pick-tilt", `${clamp(event.movementX || 0, -12, 12) * 0.65}deg`);
    if (event.pointerType !== "touch" || event.buttons) pickCursor.classList.add("visible");
  }

  async function beginExperience() {
    if (runtime.phase === "error") {
      location.reload();
      return;
    }
    if (runtime.entered || runtime.phase !== "ready") return;
    runtime.entered = true;
    cancelAnimationFrame(runtime.coverAnimationFrame);
    loader.classList.add("leaving");
    await sleep(180);
    navigateTo(0);
  }

  async function initialize() {
    buildChrome();
    void setupPickCursor();
    resizeCanvas();
    drawSegment(0, 0);
    try {
      await loadImageAssets();
      drawSegment(0, 0);
      loader.style.setProperty("--progress", "100%");
      loaderCount.textContent = "100%";
      loaderStatus.textContent = "画面就绪";
      enterButton.disabled = false;
      enterButton.classList.add("ready");
      setPhase("ready");
      startCoverJourney();
      statusLive.textContent = "素材加载完成，可以进入体验。";
    } catch (error) {
      console.error(error);
      setPhase("error");
      loaderStatus.textContent = "画面加载失败，请重试";
      loaderCount.textContent = "ERR";
      enterButton.textContent = "重试加载 / RETRY";
      enterButton.disabled = false;
      enterButton.classList.add("ready");
      statusLive.textContent = "本地素材加载失败，请重试。";
    }
  }

  enterButton.addEventListener("click", beginExperience);

  replayButton.addEventListener("click", () => {
    navigateTo(0);
  });

  document.querySelector(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo(0);
  });

  document.addEventListener("keydown", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    button.click();
  }, true);

  addEventListener("pointermove", movePickCursor, { passive: true });

  addEventListener("pointerdown", (event) => {
    movePickCursor(event);
    pickCursor?.classList.add("visible", "pressed");
  }, { passive: true });

  addEventListener("pointerup", (event) => {
    pickCursor?.classList.remove("pressed");
    if (event.pointerType === "touch") {
      setTimeout(() => pickCursor?.classList.remove("visible"), 180);
    }
  }, { passive: true });

  addEventListener("blur", () => pickCursor?.classList.remove("visible"));

  document.addEventListener("mouseleave", () => pickCursor?.classList.remove("visible"));

  addEventListener("wheel", (event) => {
    if (!runtime.entered || Math.abs(event.deltaY) < 7) return;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { runtime.wheelLocked = false; }, 380);
    if (runtime.wheelLocked) return;
    runtime.wheelLocked = true;
    onIntent(event.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  addEventListener("keydown", (event) => {
    if (!runtime.entered) return;
    const interactiveTarget = event.target instanceof Element
      && event.target.closest("button, a, input, textarea, select, [contenteditable='true']");
    if (interactiveTarget && ["Enter", " "].includes(event.key)) return;
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
    if (!runtime.entered && runtime.phase === "ready") startCoverJourney();
    else if (runtime.current >= 0) drawHold(runtime.current);
  });

  initialize();
})();
