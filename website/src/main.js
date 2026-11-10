import "./styles.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

/* ------------------------------------------------------------------
   Smooth scroll
   ------------------------------------------------------------------ */

let lenis = null;
if (!prefersReduced) {
  lenis = new Lenis({
    duration: 1.05,
    smoothWheel: true,
    wheelMultiplier: 0.95,
    touchMultiplier: 1.4,
  });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    if (lenis) {
      lenis.scrollTo(target, { offset: -70, duration: 1.2 });
    } else {
      target.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
    }
  });
});

/* ------------------------------------------------------------------
   Header + cursor glow + status bar
   ------------------------------------------------------------------ */

const header = document.getElementById("site-header");
const glow = document.querySelector(".cursor-glow");
const statusChapter = document.getElementById("status-chapter");
const statusFill = document.getElementById("status-progress-fill");
const chapters = [...document.querySelectorAll("[data-chapter]")];

if (finePointer && glow && !prefersReduced) {
  const moveX = gsap.quickTo(glow, "x", { duration: 0.55, ease: "power3.out" });
  const moveY = gsap.quickTo(glow, "y", { duration: 0.55, ease: "power3.out" });
  window.addEventListener(
    "pointermove",
    (event) => {
      document.body.classList.add("has-pointer");
      moveX(event.clientX - 310);
      moveY(event.clientY - 310);
    },
    { passive: true },
  );
}

function updateChrome() {
  const y = window.scrollY;
  if (header) header.classList.toggle("is-scrolled", y > 24);

  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
  if (statusFill) statusFill.style.width = `${(progress * 100).toFixed(2)}%`;

  if (statusChapter) {
    let current = chapters[0];
    for (const section of chapters) {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.45) current = section;
    }
    const label = current?.dataset.chapter;
    if (label && statusChapter.textContent !== label) statusChapter.textContent = label;
  }
}

window.addEventListener("scroll", updateChrome, { passive: true });
window.addEventListener("resize", updateChrome);
updateChrome();

/* ------------------------------------------------------------------
   Preloader + hero entrance
   ------------------------------------------------------------------ */

const preloader = document.getElementById("preloader");
const preloaderPercent = document.getElementById("preloader-percent");
const preloaderFill = document.getElementById("preloader-fill");
const heroLines = document.querySelectorAll(".hero-title .line > span");

function playHero() {
  if (prefersReduced) {
    gsap.set([heroLines, ".hero-sub", ".hero-actions", ".hero-meta", ".hero-live"], {
      opacity: 1,
      y: 0,
    });
    return;
  }

  gsap
    .timeline({ defaults: { ease: "power3.out" } })
    .from(heroLines, { yPercent: 118, duration: 1.15, stagger: 0.1 }, 0.18)
    .from(".hero-sub", { opacity: 0, y: 18, duration: 0.8 }, 0.62)
    .from(".hero-actions", { opacity: 0, y: 18, duration: 0.8 }, 0.74)
    .from(".hero-meta", { opacity: 0, duration: 0.7 }, 0.88)
    .from(".hero-live", { opacity: 0, y: -34, scale: 0.96, duration: 1.35, ease: "power4.out" }, 0.05)
    .from(".hero-screen-edge", { scaleX: 0.4, opacity: 0, duration: 1.2, ease: "power3.inOut" }, 0.05);

  gsap.to(".hero-scene", {
    y: 70,
    scale: 1.04,
    opacity: 0.28,
    ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });

  gsap.to(".hero-copy", {
    y: -46,
    opacity: 0.12,
    ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });
}

function finishPreloader() {
  if (!preloader || preloader.classList.contains("is-done")) {
    playHero();
    return;
  }
  if (preloaderPercent) preloaderPercent.textContent = "100";
  if (preloaderFill) preloaderFill.style.width = "100%";
  preloader.classList.add("is-done");
  document.documentElement.classList.remove("preloading");
  window.setTimeout(() => {
    preloader.remove();
    playHero();
  }, 420);
}

function runPreloader() {
  if (prefersReduced || !preloader) {
    finishPreloader();
    return;
  }

  let start = null;
  const duration = 1250;

  const step = (now) => {
    if (start === null) start = now;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(eased * 97);
    if (preloaderPercent) preloaderPercent.textContent = String(value);
    if (preloaderFill) preloaderFill.style.width = `${value}%`;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
      Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 700))]).then(finishPreloader);
    }
  };

  requestAnimationFrame(step);
}

runPreloader();

/* ------------------------------------------------------------------
   Scroll reveals
   ------------------------------------------------------------------ */

if (!prefersReduced) {
  document.querySelectorAll(".reveal").forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: 26,
      duration: 0.9,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });

  document.querySelectorAll(".reveal-lines").forEach((block) => {
    const lines = block.querySelectorAll(".line > span");
    if (!lines.length) return;
    gsap.from(lines, {
      yPercent: 112,
      duration: 1.05,
      stagger: 0.08,
      ease: "power4.out",
      scrollTrigger: { trigger: block, start: "top 88%", once: true },
    });
  });

  gsap.from(".bento-card", {
    opacity: 0,
    y: 30,
    duration: 0.85,
    stagger: 0.06,
    ease: "power3.out",
    scrollTrigger: { trigger: ".bento", start: "top 82%", once: true },
  });

  gsap.from(".download-card", {
    opacity: 0,
    y: 28,
    duration: 0.8,
    stagger: 0.08,
    ease: "power3.out",
    scrollTrigger: { trigger: ".download-grid", start: "top 85%", once: true },
  });

  gsap.from(".package-panel", {
    opacity: 0,
    y: 24,
    duration: 0.9,
    ease: "power3.out",
    scrollTrigger: { trigger: ".package-panel", start: "top 88%", once: true },
  });

  gsap.from(".manifesto-diagram", {
    opacity: 0,
    y: 30,
    duration: 1,
    ease: "power3.out",
    scrollTrigger: { trigger: ".manifesto-diagram", start: "top 90%", once: true },
  });

  const intro = document.querySelector(".manifesto-intro");
  if (intro) {
    const words = intro.textContent.trim().split(/\s+/);
    intro.innerHTML = words.map((word) => `<span>${word}</span>`).join(" ");
    gsap.to(intro.querySelectorAll("span"), {
      color: "#111114",
      stagger: 0.08,
      ease: "none",
      scrollTrigger: { trigger: intro, start: "top 82%", end: "bottom 52%", scrub: true },
    });
  }
}

/* ------------------------------------------------------------------
   Tour — one sticky stage, four states
   ------------------------------------------------------------------ */

const tour = document.getElementById("tour");
const tourIndex = [...document.querySelectorAll(".tour-index li")];
const tourRenders = [...document.querySelectorAll(".tour-render")];
const tourPanels = [...document.querySelectorAll(".tour-panel")];
const tourProgress = document.querySelector(".tour-progress span");
const tourStates = ["music", "agents", "screenshot", "shelf"];

let activeTour = -1;

function setTour(index) {
  if (!tour || index === activeTour) return;
  activeTour = index;
  const state = tourStates[index];
  tour.dataset.state = state;

  tourIndex.forEach((li, i) => li.classList.toggle("is-active", i === index));
  tourRenders.forEach((render) => render.classList.toggle("is-active", render.dataset.state === state));
  tourPanels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === state));
}

function updateTour() {
  if (!tour) return;
  const rect = tour.getBoundingClientRect();
  const total = tour.offsetHeight - window.innerHeight;
  if (total <= 0) return;
  const progress = Math.min(1, Math.max(0, -rect.top / total));
  const index = Math.min(tourStates.length - 1, Math.floor(progress * tourStates.length));
  setTour(index);
  if (tourProgress) tourProgress.style.width = `${(progress * 100).toFixed(2)}%`;
}

window.addEventListener("scroll", updateTour, { passive: true });
window.addEventListener("resize", updateTour);
updateTour();

tourIndex.forEach((li) => {
  li.addEventListener("click", () => {
    const index = Number(li.dataset.index);
    if (!tour || Number.isNaN(index)) return;
    const top = tour.offsetTop + ((tour.offsetHeight - window.innerHeight) * (index + 0.02)) / tourStates.length;
    if (lenis) lenis.scrollTo(top, { duration: 1.1 });
    else window.scrollTo({ top, behavior: "smooth" });
  });
});

/* ------------------------------------------------------------------
   Live product renders
   ------------------------------------------------------------------ */

const liveElapsed = document.getElementById("live-elapsed");
const liveProgress = document.getElementById("live-progress");
const liveKnob = document.getElementById("live-knob");
const musicFills = [...document.querySelectorAll("[data-music-fill]")];
const musicKnobs = [...document.querySelectorAll("[data-music-knob]")];
const musicElapsed = [...document.querySelectorAll("[data-music-elapsed]")];
const lyricBlocks = [...document.querySelectorAll("[data-lyrics], .live-lyrics")];

const TRACK_TOTAL = 282;
let trackTime = 34;

function two(n) {
  return String(n).padStart(2, "0");
}

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${two(Math.floor(seconds % 60))}`;
}

function paintTrack() {
  const pct = (trackTime / TRACK_TOTAL) * 100;
  if (liveProgress) liveProgress.style.width = `${pct}%`;
  if (liveKnob) liveKnob.style.left = `${pct}%`;
  if (liveElapsed) liveElapsed.textContent = clock(trackTime);
  const remaining = document.getElementById("live-remaining");
  if (remaining) remaining.textContent = `-${clock(Math.max(0, TRACK_TOTAL - trackTime))}`;
  const seek = document.getElementById("live-progress-track");
  if (seek) seek.setAttribute("aria-valuenow", String(Math.round(pct)));
  musicFills.forEach((el) => (el.style.width = `${pct}%`));
  musicKnobs.forEach((el) => (el.style.left = `${pct}%`));
  musicElapsed.forEach((el) => (el.textContent = clock(trackTime)));
}

let trackPlaying = true;

if (!prefersReduced) {
  let last = performance.now();
  const stepTrack = (now) => {
    const delta = Math.min(0.2, (now - last) / 1000);
    last = now;
    if (trackPlaying) trackTime += delta;
    if (trackTime >= TRACK_TOTAL) trackTime = 0;
    paintTrack();
    requestAnimationFrame(stepTrack);
  };
  requestAnimationFrame(stepTrack);
  paintTrack();

  if (lyricBlocks.length) {
    setInterval(() => {
      lyricBlocks.forEach((block) => {
        const spans = [...block.querySelectorAll("span")];
        if (spans.length < 2) return;
        const active = spans.findIndex((span) => span.classList.contains("is-active"));
        spans.forEach((span) => span.classList.remove("is-active"));
        spans[(active + 1) % spans.length].classList.add("is-active");
      });
    }, 3400);
  }
}

/* ------------------------------------------------------------------
   Interactive hero island
   ------------------------------------------------------------------ */

const island = document.getElementById("live-notch");
const islandPanels = [...document.querySelectorAll(".live-panel")];
const islandTabs = [...document.querySelectorAll(".live-mod[data-panel]")];
let islandPanel = "music";

function showIslandPanel(name) {
  islandPanel = name;
  islandPanels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === name));
  islandTabs.forEach((tab) => {
    const active = tab.dataset.panel === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  island?.classList.remove("is-collapsed");
}

islandTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.panel;
    if (name === islandPanel) {
      island?.classList.toggle("is-collapsed");
      return;
    }
    showIslandPanel(name);
  });
});

const playButton = document.getElementById("live-play");
playButton?.addEventListener("click", () => {
  trackPlaying = !trackPlaying;
  playButton.classList.toggle("is-paused", !trackPlaying);
  playButton.setAttribute("aria-pressed", String(trackPlaying));
  playButton.setAttribute("aria-label", trackPlaying ? "Pause" : "Play");
});

const seekTrack = document.getElementById("live-progress-track");
const seekTo = (clientX) => {
  if (!seekTrack) return;
  const rect = seekTrack.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  trackTime = ratio * TRACK_TOTAL;
  paintTrack();
};

seekTrack?.addEventListener("pointerdown", (event) => {
  seekTo(event.clientX);
  seekTrack.setPointerCapture?.(event.pointerId);
});
seekTrack?.addEventListener("pointermove", (event) => {
  if (event.buttons === 1) seekTo(event.clientX);
});
seekTrack?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    trackTime = Math.min(TRACK_TOTAL, trackTime + 5);
    paintTrack();
  } else if (event.key === "ArrowLeft") {
    trackTime = Math.max(0, trackTime - 5);
    paintTrack();
  }
});

const shotTimeEl = document.getElementById("live-shot-time");
let liveShotLeft = 299;
if (shotTimeEl) {
  setInterval(() => {
    liveShotLeft = liveShotLeft <= 0 ? 299 : liveShotLeft - 1;
    shotTimeEl.textContent = clock(liveShotLeft);
  }, 1000);
}

const shotKeep = document.getElementById("live-shot-keep");
const shotDelete = document.getElementById("live-shot-delete");
const shotPanel = document.querySelector('.live-panel[data-panel="screenshot"]');
const shotTitle = shotPanel?.querySelector(".live-shot-copy strong");
const shelfList = document.getElementById("live-shelf");

shotKeep?.addEventListener("click", () => {
  if (!shelfList) return;
  const rows = shelfList.querySelectorAll(".live-shelf-row").length;
  const row = document.createElement("div");
  row.className = "live-shelf-row";
  row.innerHTML = `<span class="live-shelf-thumb"></span><span class="live-shelf-name">Screenshot ${19 + rows}</span><span class="live-shelf-time">5:00</span>`;
  shelfList.appendChild(row);
  liveShotLeft = 299;
  showIslandPanel("shelf");
});

shotDelete?.addEventListener("click", () => {
  if (!shotTitle) return;
  shotTitle.textContent = "Deleted";
  shotPanel?.classList.add("is-done");
  window.setTimeout(() => {
    shotTitle.textContent = "Keep screenshot?";
    shotPanel?.classList.remove("is-done");
    liveShotLeft = 299;
    showIslandPanel("music");
  }, 950);
});

if (!prefersReduced) {
  const shotCount = document.querySelector("[data-shot-count]");
  const shotRing = document.querySelector("[data-shot-ring]");
  const shotTotal = 15;
  let shot = shotTotal;
  const paintShot = () => {
    if (shotCount) shotCount.textContent = String(shot);
    if (shotRing) {
      const circumference = 2 * Math.PI * 18;
      shotRing.style.strokeDashoffset = String(circumference * (1 - shot / shotTotal));
    }
  };
  paintShot();
  setInterval(() => {
    shot = shot <= 0 ? shotTotal : shot - 1;
    paintShot();
  }, 1000);

  const shelfCounts = [...document.querySelectorAll("[data-shelf-count]")];
  let shelfA = 18;
  let shelfB = 26;
  setInterval(() => {
    shelfA = shelfA <= 0 ? 20 : shelfA - 1;
    shelfB = shelfB <= 0 ? 28 : shelfB - 1;
    shelfCounts.forEach((el, i) => {
      const value = i === 0 ? shelfA : shelfB;
      el.textContent = `0:${two(value)}`;
    });
  }, 1000);

  const tokenEls = [...document.querySelectorAll("[data-token]")];
  const requestEls = [...document.querySelectorAll("[data-requests]")];
  let tokens = 128;
  let requests = 12;
  setInterval(() => {
    tokens += 1;
    requests += 1;
    if (tokens > 200) tokens = 128;
    if (requests > 24) requests = 12;
    tokenEls.forEach((el) => (el.textContent = `${tokens}k`));
    requestEls.forEach((el) => (el.textContent = String(requests)));
  }, 4200);

  const swatches = [...document.querySelectorAll(".sr-swatches i")];
  const toggles = [...document.querySelectorAll(".sr-toggle")];
  const styles = [...document.querySelectorAll(".sr-style")];
  if (swatches.length || toggles.length) {
    let tick = 0;
    setInterval(() => {
      tick += 1;
      if (swatches.length) {
        const current = swatches.findIndex((el) => el.classList.contains("is-active"));
        swatches.forEach((el) => el.classList.remove("is-active"));
        swatches[(current + 1) % swatches.length].classList.add("is-active");
      }
      if (styles.length) {
        const current = styles.findIndex((el) => el.classList.contains("is-active"));
        styles.forEach((el) => el.classList.remove("is-active"));
        styles[(current + 1) % styles.length].classList.add("is-active");
      }
      if (toggles.length && tick % 2 === 0) {
        const target = toggles[tick % toggles.length];
        target.classList.toggle("is-on");
      }
    }, 3200);
  }
}

/* ------------------------------------------------------------------
   Bento pointer light
   ------------------------------------------------------------------ */

if (finePointer) {
  document.querySelectorAll(".bento-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });

  const frame = document.getElementById("settings-frame");
  if (frame && !prefersReduced) {
    const wrap = frame.parentElement;
    wrap.addEventListener("pointermove", (event) => {
      const rect = wrap.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      gsap.to(frame, {
        rotateY: px * 7,
        rotateX: -py * 5,
        duration: 0.5,
        ease: "power2.out",
        transformPerspective: 1200,
      });
    });
    wrap.addEventListener("pointerleave", () => {
      gsap.to(frame, { rotateY: 0, rotateX: 0, duration: 0.7, ease: "power3.out" });
    });
  }
}

/* ------------------------------------------------------------------
   Magnetic controls + scene parallax
   ------------------------------------------------------------------ */

if (finePointer && !prefersReduced) {
  document.querySelectorAll(".button, .download-card").forEach((el) => {
    const strength = el.classList.contains("download-card") ? 5 : 9;
    el.addEventListener("pointermove", (event) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      gsap.to(el, { x: x * strength, y: y * strength, duration: 0.35, ease: "power2.out" });
    });
    el.addEventListener("pointerleave", () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" });
    });
  });

  const scene = document.querySelector(".hero-scene");
  const orbA = document.querySelector(".hero-orb-a");
  const orbB = document.querySelector(".hero-orb-b");
  if (scene && orbA && orbB) {
    scene.addEventListener("pointermove", (event) => {
      const rect = scene.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      gsap.to(orbA, { x: px * 54, y: py * 36, duration: 1.2, ease: "power2.out" });
      gsap.to(orbB, { x: px * -42, y: py * -30, duration: 1.4, ease: "power2.out" });
    });
  }
}

if (!prefersReduced) {
  gsap.fromTo(
    ".tour-visual",
    { y: 34 },
    {
      y: -34,
      ease: "none",
      scrollTrigger: { trigger: ".tour", start: "top top", end: "bottom bottom", scrub: true },
    },
  );

  gsap.fromTo(
    ".tour-index",
    { opacity: 0.45, y: 20 },
    {
      opacity: 1,
      y: 0,
      ease: "none",
      scrollTrigger: { trigger: ".tour", start: "top 78%", end: "top 26%", scrub: true },
    },
  );
}

/* ------------------------------------------------------------------
   Screenshot demo
   ------------------------------------------------------------------ */

const demoCard = document.getElementById("demo-card");
const demoCountdown = document.getElementById("demo-countdown");
const demoProgressFill = document.getElementById("demo-progress-fill");
const demoResult = document.getElementById("demo-result");
const demoShelf = document.getElementById("demo-shelf");
const demoShelfRows = document.getElementById("demo-shelf-rows");
const demoKeep = document.getElementById("demo-keep");
const demoDelete = document.getElementById("demo-delete");
const demoReset = document.getElementById("demo-reset");

const TOTAL = 299;
let remaining = TOTAL;
let demoTimer = null;
let demoRunning = true;
const shelfItems = [];

function formatTime(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function renderShelf() {
  if (!demoShelf || !demoShelfRows) return;
  demoShelf.hidden = shelfItems.length === 0;
  demoShelfRows.innerHTML = shelfItems
    .map(
      (item) => `
        <div class="demo-shelf-row">
          <span class="demo-shelf-thumb" aria-hidden="true"></span>
          <div><strong>${item.label}</strong><span>${item.note}</span></div>
          <em>${item.status}</em>
        </div>`,
    )
    .join("");
}

function tickDemo() {
  remaining -= 1;
  if (demoCountdown) demoCountdown.textContent = formatTime(remaining);
  if (demoProgressFill) demoProgressFill.style.width = `${(remaining / TOTAL) * 100}%`;
  if (remaining <= 0) {
    stopDemo();
    shelfItems.unshift({ label: "Screenshot", note: "Folded back into the Shelf", status: "expired" });
    renderShelf();
    if (demoResult) demoResult.textContent = "Timer ended — the screenshot folded back into the Shelf.";
    if (demoCard) demoCard.classList.add("is-hidden");
  }
}

function stopDemo() {
  demoRunning = false;
  if (demoTimer) {
    clearInterval(demoTimer);
    demoTimer = null;
  }
}

function startDemo() {
  stopDemo();
  demoRunning = true;
  remaining = TOTAL;
  if (demoCountdown) demoCountdown.textContent = formatTime(remaining);
  if (demoProgressFill) demoProgressFill.style.width = "100%";
  if (demoResult) demoResult.textContent = "";
  if (demoCard) demoCard.classList.remove("is-hidden");
  demoTimer = setInterval(tickDemo, 1000);
}

if (demoCard) {
  startDemo();

  demoKeep?.addEventListener("click", () => {
    stopDemo();
    shelfItems.unshift({ label: "Screenshot kept", note: "Saved to the Shelf", status: "kept" });
    renderShelf();
    if (demoResult) demoResult.textContent = "Kept. The file stays, and the Shelf remembers it.";
    demoCard.classList.add("is-hidden");
  });

  demoDelete?.addEventListener("click", () => {
    stopDemo();
    if (demoResult) demoResult.textContent = "Deleted. Nothing was written to disk.";
    demoCard.classList.add("is-hidden");
  });

  demoReset?.addEventListener("click", () => {
    shelfItems.length = 0;
    renderShelf();
    startDemo();
  });
}

/* ------------------------------------------------------------------
   Notch lock
   ------------------------------------------------------------------ */

const lockSection = document.getElementById("lock");
const lockNotch = document.getElementById("lock-notch");
const lockToast = document.getElementById("lock-toast");
const lockToggle = document.getElementById("lock-toggle");
let locked = false;
let toastTimer = null;

function showToast(message) {
  if (!lockToast) return;
  lockToast.textContent = message;
  lockToast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => lockToast.classList.remove("is-visible"), 2600);
}

function setLocked(next) {
  locked = next;
  lockSection?.classList.toggle("is-locked", locked);
  lockNotch?.classList.toggle("is-locked", locked);
  if (lockToggle) lockToggle.textContent = locked ? "Unlock the notch" : "Lock the notch";
  showToast(locked ? "Notch locked · Ctrl + Alt + L" : "Notch unlocked");
}

lockToggle?.addEventListener("click", () => setLocked(!locked));

lockNotch?.addEventListener("click", () => {
  if (locked) {
    gsap.fromTo(
      lockNotch,
      { x: -7 },
      { x: 0, duration: 0.55, ease: "elastic.out(1, 0.28)" },
    );
    showToast("Blocked — the notch refuses to open");
  } else {
    showToast("Expanded (demo)");
  }
});

/* ------------------------------------------------------------------
   Package tabs + copy
   ------------------------------------------------------------------ */

const tabButtons = [...document.querySelectorAll(".package-tabs [data-tab]")];
const tabPanels = [...document.querySelectorAll(".package-code pre[data-panel]")];
const copyButton = document.getElementById("copy-command");

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    tabButtons.forEach((b) => b.setAttribute("aria-selected", String(b === button)));
    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
    if (copyButton) copyButton.textContent = "Copy";
  });
});

copyButton?.addEventListener("click", async () => {
  const visible = tabPanels.find((panel) => !panel.hidden);
  if (!visible) return;
  const text = visible.querySelector("code")?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = "Copied";
    setTimeout(() => (copyButton.textContent = "Copy"), 1600);
  } catch {
    copyButton.textContent = "Select & copy";
  }
});

/* ------------------------------------------------------------------
   Resize housekeeping
   ------------------------------------------------------------------ */

window.addEventListener("load", () => {
  ScrollTrigger.refresh();
  updateTour();
  updateChrome();
});
