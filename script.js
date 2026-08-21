const root = document.documentElement;
root.classList.replace('no-js', 'js');

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (edge0, edge1, value) => {
  const x = clamp((value - edge0) / Math.max(edge1 - edge0, .0001));
  return x * x * (3 - 2 * x);
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = matchMedia('(pointer: coarse)');
const canvas = $('[data-cinema-canvas]');
const heroTrack = $('[data-hero-track]');
const heroStage = $('[data-hero-stage]');
const heroLines = $$('[data-hero-line]');
const heroTruth = $('[data-hero-truth]');
const heroIdentity = $('[data-hero-identity]');
const pageProgress = $('[data-page-progress]');
const terrainPath = $('[data-terrain-path]');
const outsidePath = $('[data-outside-path]');
const outsideExplorer = $('[data-route-explorer]');
const sceneElements = $$('[data-render-scene]');
const navLinks = $$('[data-nav-link]');
const mainContent = $('main');
const siteHeader = $('[data-site-header]');
const actIndicator = $('.act-indicator');

let renderer = null;
let rafId = 0;
let lastDraw = 0;
let targetScroll = scrollY;
let easedScroll = scrollY;
let documentMax = 1;
let heroTop = 0;
let heroRange = 1;
let sceneMetrics = [];
let outsideMetric = { top: 0, range: 1 };
let terrainLength = 0;
let outsideLength = 0;
let activeScene = -1;
let selectedObjective = 0;
let needsDraw = true;

const absoluteTop = (element) => element.getBoundingClientRect().top + scrollY;

const measure = () => {
  documentMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  if (heroTrack) {
    heroTop = absoluteTop(heroTrack);
    heroRange = Math.max(1, heroTrack.offsetHeight - innerHeight);
  }
  sceneMetrics = sceneElements.map((element) => ({
    element,
    scene: Number(element.dataset.renderScene || 0),
    id: element.id || element.closest('[id]')?.id || 'within',
    top: absoluteTop(element),
    height: Math.max(element.offsetHeight, innerHeight),
  })).sort((a, b) => a.top - b.top || a.height - b.height);
  if (outsideExplorer) outsideMetric = { top: absoluteTop(outsideExplorer), range: Math.max(1, outsideExplorer.offsetHeight + innerHeight * .35) };
  if (terrainPath) {
    terrainLength = terrainPath.getTotalLength();
    terrainPath.style.strokeDasharray = String(terrainLength);
  }
  if (outsidePath) {
    outsideLength = outsidePath.getTotalLength();
    outsidePath.style.strokeDasharray = String(outsideLength);
  }
  renderer?.resize();
  targetScroll = scrollY;
  easedScroll = scrollY;
  needsDraw = true;
  schedule();
};

const selectScene = (position) => {
  const probe = position + innerHeight * .52;
  let selected = sceneMetrics[0] || { scene: 0, id: 'within', top: 0, height: innerHeight };
  sceneMetrics.forEach((metric) => { if (probe >= metric.top) selected = metric; });
  const progress = clamp((probe - selected.top) / Math.max(1, selected.height));
  return { ...selected, progress };
};

const setCurrentNavigation = (id, scene) => {
  const currentId = scene === 4 ? 'connect' : (['within', 'terrain', 'practice', 'questions'][scene] || id);
  navLinks.forEach((link) => {
    const targetId = scene === 4 && link.closest('.act-indicator') ? 'questions' : currentId;
    const current = link.hash === `#${targetId}`;
    link.classList.toggle('is-current', current);
    if (current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
};

const paintHero = (progress) => {
  if (!heroStage) return;
  heroStage.style.setProperty('--hero-progress', progress.toFixed(4));
  heroLines.forEach((line) => {
    const start = Number(line.dataset.start || 0);
    const end = Number(line.dataset.end || 1);
    const active = progress >= start && progress < end;
    line.classList.toggle('is-active', active);
  });
  const truthIn = smoothstep(.52, .585, progress);
  const truthOpacity = truthIn;
  const eyeScale = 1 - smoothstep(.64, .9, progress) * .39;
  heroTruth?.style.setProperty('--truth-opacity', truthOpacity.toFixed(3));
  heroTruth?.style.setProperty('--truth-scale', eyeScale.toFixed(3));
  heroTruth?.style.setProperty('--truth-y', `${(1 - truthIn) * 18}px`);
  const identityIn = smoothstep(.82, .92, progress);
  heroIdentity?.style.setProperty('--identity-opacity', identityIn.toFixed(3));
  heroIdentity?.style.setProperty('--identity-y', `${(1 - identityIn) * 22}px`);
  heroStage.style.setProperty('--scroll-opacity', String(1 - smoothstep(.08, .24, progress)));
  root.classList.toggle('intro-complete', progress > .93 || scrollY > heroTop + heroRange * .93);
};

const paintPaths = (terrainProgress) => {
  if (terrainPath && terrainLength) terrainPath.style.strokeDashoffset = String(terrainLength * (1 - clamp(terrainProgress * 1.22)));
  if (outsidePath && outsideLength) {
    const progress = clamp((easedScroll + innerHeight * .72 - outsideMetric.top) / outsideMetric.range);
    outsidePath.style.strokeDashoffset = String(outsideLength * (1 - progress));
  }
};

const frame = (time) => {
  rafId = 0;
  if (document.hidden) return;
  const delta = targetScroll - easedScroll;
  easedScroll += delta * (reducedMotion.matches ? 1 : .16);
  if (Math.abs(delta) < .08) easedScroll = targetScroll;

  const heroProgress = clamp((easedScroll - heroTop) / heroRange);
  const scene = selectScene(easedScroll);
  const terrainMetric = sceneMetrics.find((item) => item.scene === 1);
  const terrainProgress = terrainMetric ? clamp((easedScroll + innerHeight * .7 - terrainMetric.top) / terrainMetric.height) : 0;

  pageProgress?.style.setProperty('transform', `scaleX(${clamp(scrollY / documentMax)})`);
  paintHero(heroProgress);
  paintPaths(terrainProgress);

  if (activeScene !== scene.scene) {
    activeScene = scene.scene;
    setCurrentNavigation(scene.id, scene.scene);
    needsDraw = true;
  }

  const heroBreathing = scene.scene === 0 && heroProgress < .82 && !reducedMotion.matches;
  const frameInterval = innerWidth < 800 || coarsePointer.matches ? 33.3 : 16.7;
  const wantsDraw = needsDraw || Math.abs(delta) > .08 || heroBreathing;
  const drawIsDue = time - lastDraw >= frameInterval;
  if (renderer && wantsDraw && drawIsDue) {
    renderer.draw({
      time: time * .001,
      scene: scene.scene,
      heroProgress,
      sceneProgress: scene.progress,
      selection: selectedObjective,
    });
    lastDraw = time;
    needsDraw = false;
  }

  if (Math.abs(targetScroll - easedScroll) > .08 || heroBreathing || (renderer && wantsDraw && !drawIsDue)) schedule();
};

function schedule() {
  if (!rafId && !document.hidden) rafId = requestAnimationFrame(frame);
}

const startRenderer = () => {
  if (!canvas || reducedMotion.matches || renderer) return;
  renderer = window.createCinemaRenderer?.(canvas, {
    onReady: () => {
      root.classList.remove('webgl-failed');
      root.classList.add('webgl-ready');
    },
    onInvalidate: () => { needsDraw = true; schedule(); },
    onFailure: () => {
      root.classList.remove('webgl-ready');
      root.classList.add('webgl-failed');
    },
    onRestore: () => {
      renderer?.dispose();
      renderer = null;
      root.classList.remove('webgl-ready', 'webgl-failed');
      startRenderer();
      measure();
    },
  });
  if (renderer) {
    renderer.resize();
    needsDraw = true;
    schedule();
  }
};

addEventListener('scroll', () => {
  targetScroll = scrollY;
  needsDraw = true;
  schedule();
}, { passive: true });

addEventListener('resize', () => requestAnimationFrame(measure), { passive: true });
document.fonts?.ready.then(measure);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  } else {
    targetScroll = scrollY;
    needsDraw = true;
    schedule();
  }
});

reducedMotion.addEventListener?.('change', () => {
  if (reducedMotion.matches) {
    renderer?.dispose();
    renderer = null;
    root.classList.remove('webgl-ready');
  } else startRenderer();
  measure();
});

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  renderer?.dispose();
  renderer = null;
  root.classList.remove('webgl-ready');
});

addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  if (!renderer) startRenderer();
  targetScroll = scrollY;
  easedScroll = scrollY;
  needsDraw = true;
  measure();
});

const revealItems = $$('.reveal');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top).forEach((entry, index) => {
      entry.target.style.transitionDelay = `${Math.min(index, 3) * 65}ms`;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: .08, rootMargin: '0px 0px -12% 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else revealItems.forEach((item) => item.classList.add('is-revealed'));

const skipIntro = $('[data-skip-intro]');
const identityAnchor = $('#identity-anchor');
skipIntro?.addEventListener('click', () => {
  root.classList.add('intro-complete');
  identityAnchor?.focus({ preventScroll: true });
  scrollTo({ top: heroTop + heroRange - 2, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
});

const menuToggle = $('[data-menu-toggle]');
const siteMenu = $('[data-site-menu]');
const menuPanel = $('.menu-panel', siteMenu || document);

const setPageInert = (value) => {
  [mainContent, siteHeader, actIndicator].forEach((element) => { if (element) element.inert = value; });
};

const closeMenu = (restoreFocus = false) => {
  root.classList.remove('menu-open');
  document.body.classList.remove('menu-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  siteMenu?.setAttribute('aria-hidden', 'true');
  if (siteMenu) siteMenu.inert = true;
  setPageInert(false);
  if (restoreFocus) menuToggle?.focus();
};

const openMenu = () => {
  root.classList.add('menu-open');
  document.body.classList.add('menu-open');
  menuToggle?.setAttribute('aria-expanded', 'true');
  siteMenu?.setAttribute('aria-hidden', 'false');
  if (siteMenu) siteMenu.inert = false;
  setPageInert(true);
  requestAnimationFrame(() => $('[data-menu-first]')?.focus());
};

if (siteMenu) siteMenu.inert = true;
menuToggle?.addEventListener('click', () => root.classList.contains('menu-open') ? closeMenu() : openMenu());
$$('[data-menu-close]').forEach((button) => button.addEventListener('click', () => closeMenu(true)));
$$('[data-menu-link]').forEach((link) => link.addEventListener('click', () => {
  const destination = $(link.hash);
  const focusTarget = destination?.querySelector('h1,h2,h3') || destination;
  closeMenu();
  requestAnimationFrame(() => {
    if (!focusTarget) return;
    focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  });
}));

addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && root.classList.contains('menu-open')) closeMenu(true);
  if (event.key !== 'Tab' || !root.classList.contains('menu-open') || !menuPanel) return;
  const focusable = $$('a[href],button:not([disabled])', menuPanel);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

const consequenceData = {
  speed: ['Earlier learning', 'Greater delivery pressure'],
  efficiency: ['Lower cost', 'Possible loss of flexibility'],
  personalisation: ['Greater relevance', 'Increased privacy responsibility'],
  growth: ['Wider reach', 'Increased operational and environmental load'],
  sustainability: ['Longer-term resilience', 'Possible short-term commercial tension'],
};

const objectiveButtons = $$('[data-objective]');
const benefit = $('[data-benefit]');
const tension = $('[data-tension]');
objectiveButtons.forEach((button, index) => button.addEventListener('click', () => {
  const values = consequenceData[button.dataset.objective];
  objectiveButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  if (benefit) benefit.textContent = values[0];
  if (tension) tension.textContent = values[1];
  selectedObjective = index;
  needsDraw = true;
  schedule();
}));

const flowData = [
  ['Use signal', 'Begin with evidence already present in maintenance, utilisation, and downtime patterns, then ask whether it can support longer asset life and circular value.'],
  ['Interpret carefully', 'Translate imperfect data into a bounded indication, with confidence and missing context made visible.'],
  ['Change one decision', 'Narrow the first product to one operational maintenance decision that a team can genuinely act on.'],
  ['Name the beneficiary', 'Make clear whose work or experience improves: operator, service team, driver, asset owner, or wider system.'],
  ['Expose the risk', 'Privacy, governance, imperfect data, infrastructure cost, and misplaced confidence remain part of the product.'],
  ['Return as feedback', 'Measure whether the decision improved, then use what was learned before expanding the system.'],
];

const systemExplorer = $('[data-system-explorer]');
const flowButtons = $$('[data-flow-step]');
const flowKicker = $('[data-flow-kicker]');
const flowCopy = $('[data-flow-copy]');
flowButtons.forEach((button, index) => button.addEventListener('click', () => {
  flowButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  if (flowKicker) flowKicker.textContent = flowData[index][0];
  if (flowCopy) flowCopy.textContent = flowData[index][1];
  systemExplorer?.style.setProperty('--flow-position', `${index * 20}%`);
}));

const routeData = [
  'Begin from a connection the city already provides, reducing the need for another car journey.',
  'Offer different distances, surfaces, confidence levels, and ways to move without presenting one body as the default.',
  'Make rest part of the route. A pause can support confidence, attention, and a more sustainable pace.',
  'Keep sensitive areas visible as a limitation. Lower-impact discovery sometimes means choosing not to direct more people there.',
];

const routeButtons = $$('[data-route-step]');
const routeOutput = $('[data-route-output]');
routeButtons.forEach((button, index) => button.addEventListener('click', () => {
  routeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  if (routeOutput) routeOutput.textContent = routeData[index];
}));

startRenderer();
measure();
