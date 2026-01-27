import { createDefaultState, getGradientMidColor } from './state.js';
import { renderToCanvas } from './renderer.js';
import { bindUI } from './ui.js';
import { importConfig } from './serialize.js';
import { DEFAULT_PRESET_URL, PRESETS } from './preset.js';
import { APP_VERSION } from './version.js';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ensureFontLoaded(fontFamily) {
  return document.fonts.load(`20px ${fontFamily}`).then(() => document.fonts.ready);
}

function getEls() {
  return {
    presetSelect: document.getElementById('presetSelect'),
    expertPresetSelect: document.getElementById('expertPresetSelect'),
    textInput: document.getElementById('textInput'),
    arcPct: document.getElementById('arcPct'),
    fontSize: document.getElementById('fontSize'),
    scaleX: document.getElementById('scaleX'),
    scaleY: document.getElementById('scaleY'),
    align: document.getElementById('align'),
    exportScale: document.getElementById('exportScale'),
    padding: document.getElementById('padding'),
    refOpacity: document.getElementById('refOpacity'),
    showBg: document.getElementById('showBg'),
    addLayerType: document.getElementById('addLayerType'),
    addLayerBtn: document.getElementById('addLayerBtn'),
    layersList: document.getElementById('layersList'),
    layerEditorBody: document.getElementById('layerEditorBody'),
    configFileInput: document.getElementById('configFileInput'),
    loadPresetBtn: document.getElementById('loadPresetBtn'),
    exportConfigBtn: document.getElementById('exportConfigBtn'),
    exportBtn: document.getElementById('exportBtn'),
    downloadLink: document.getElementById('downloadLink'),
    status: document.getElementById('status'),
    appVersion: document.getElementById('appVersion'),
    canvas: document.getElementById('canvas'),
    referenceImg: document.getElementById('referenceImg'),
  };
}

function isExpertMode() {
  try {
    const url = new URL(window.location.href);
    const v = (url.searchParams.get('expert') || '').toLowerCase();
    return v === 'yes' || v === 'true' || v === '1';
  } catch {
    return false;
  }
}

function setModeClass(expert) {
  document.body.classList.toggle('isExpert', Boolean(expert));
  document.body.classList.toggle('isRegular', !expert);
}

const DEFAULT_REGULAR_PRESET_URL = PRESETS[0]?.url || DEFAULT_PRESET_URL;
const IMPORT_FALLBACK_COLOR = '#000000';

async function loadPresetIntoState({ url, els, state, schedulePersist }) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const details = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    throw new Error(`Could not load preset (${details}): ${res.url}`);
  }
  const txt = await res.text();
  const next = importConfig(txt, IMPORT_FALLBACK_COLOR);
  state.layers = next.layers;
  state.selectedLayerId = next.selectedLayerId;
  schedulePersist?.();
}

function setStatus(els, msg) {
  if (!els.status) return;
  els.status.textContent = msg || '';
}

const SESSION_KEY = 'photoshop-text.session.v1';

function loadSessionState() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSessionState(payload) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function clampScale(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return clamp(v, 0.1, 5);
}

async function exportPng({ els, state, style }) {
  setStatus(els, 'Preparing…');
  els.downloadLink.hidden = true;

  await ensureFontLoaded(style.fontFamily);

  const fontSize = clamp(Number(els.fontSize.value) || 143, 8, 500);
  const scaleX = clampScale(els.scaleX?.value);
  const scaleY = clampScale(els.scaleY?.value);
  const padding = clamp(Number(els.padding.value) || 24, 0, 300);
  const alignment = els.align.value;
  const arcPct = clamp(Number(els.arcPct?.value) || 0, 0, 100);
  const scale = clamp(Number(els.exportScale.value) || 2, 1, 4);

  const exportCanvas = document.createElement('canvas');
  renderToCanvas({
    canvas: exportCanvas,
    text: els.textInput.value,
    fontSize,
    scaleX,
    scaleY,
    alignment,
    padding,
    arcPct,
    showBg: false,
    layers: state.layers,
    scale,
    style,
  });

  const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    setStatus(els, 'Export failed (could not create PNG).');
    return;
  }

  const url = URL.createObjectURL(blob);
  els.downloadLink.href = url;
  els.downloadLink.hidden = false;
  els.downloadLink.textContent = `Download (${exportCanvas.width}×${exportCanvas.height})`;
  els.downloadLink.click();

  setStatus(els, 'Exported.');
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function init() {
  const expertMode = isExpertMode();
  setModeClass(expertMode);

  const style = {
    fontFamily: '"Mikado"',
    fontWeight: 900,
    lineHeight: 1.05,
    effectPad: 30,
  };

  const els = getEls();
  const state = createDefaultState();

  if (els.appVersion) {
    els.appVersion.textContent = `v${APP_VERSION}`;
  }

  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;

      const layersForPersist = (state.layers || []).map((l) => {
        if (!l || typeof l !== 'object') return l;
        const { locked, ...rest } = l;
        return rest;
      });

      saveSessionState({
        version: 1,
        ui: {
          text: els.textInput?.value ?? '',
          arcPct: els.arcPct?.value ?? '',
          fontSize: els.fontSize?.value ?? '',
          scaleX: els.scaleX?.value ?? '',
          scaleY: els.scaleY?.value ?? '',
          alignment: els.align?.value ?? 'center',
          padding: els.padding?.value ?? '',
          showBg: Boolean(els.showBg?.checked),
        },
        layers: layersForPersist,
        selectedLayerId: state.selectedLayerId,
      });
    }, 120);
  }

  const session = loadSessionState();
  if (expertMode && session && Array.isArray(session.layers)) {
    const next = importConfig(JSON.stringify({ version: 1, layers: session.layers }), IMPORT_FALLBACK_COLOR);
    state.layers = next.layers;
    state.selectedLayerId = typeof session.selectedLayerId === 'string' ? session.selectedLayerId : next.selectedLayerId;

    if (session.ui && typeof session.ui === 'object') {
      if (typeof session.ui.text === 'string' && els.textInput) els.textInput.value = session.ui.text;
      if (typeof session.ui.arcPct === 'string' && els.arcPct) els.arcPct.value = session.ui.arcPct;
      if (typeof session.ui.fontSize === 'string' && els.fontSize) els.fontSize.value = session.ui.fontSize;
      if (typeof session.ui.scaleX === 'string' && els.scaleX) els.scaleX.value = session.ui.scaleX;
      if (typeof session.ui.scaleY === 'string' && els.scaleY) els.scaleY.value = session.ui.scaleY;
      if (typeof session.ui.alignment === 'string' && els.align) els.align.value = session.ui.alignment;
      if (typeof session.ui.padding === 'string' && els.padding) els.padding.value = session.ui.padding;
      if (typeof session.ui.showBg === 'boolean' && els.showBg) els.showBg.checked = session.ui.showBg;
    }

    schedulePersist();
  } else {
    const initialPresetUrl = expertMode ? DEFAULT_PRESET_URL : DEFAULT_REGULAR_PRESET_URL;
    try {
      await loadPresetIntoState({ url: initialPresetUrl, els, state, schedulePersist });
    } catch (e) {
      console.warn('Could not load sample preset:', e);
    }
  }

  let renderQueued = false;
  function render() {
    const fontSize = clamp(Number(els.fontSize.value) || 143, 8, 500);
    const scaleX = clampScale(els.scaleX?.value);
    const scaleY = clampScale(els.scaleY?.value);
    const padding = clamp(Number(els.padding.value) || 24, 0, 300);
    const alignment = els.align.value;
    const showBg = els.showBg.checked;
    const arcPct = clamp(Number(els.arcPct?.value) || 0, 0, 100);

    renderToCanvas({
      canvas: els.canvas,
      text: els.textInput.value,
      fontSize,
      scaleX,
      scaleY,
      alignment,
      padding,
      arcPct,
      showBg,
      bgColor: '#7D2ED7',
      layers: state.layers,
      scale: 1,
      style,
    });
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  bindUI({
    els,
    state,
    scheduleRender,
    setStatus: (msg) => setStatus(els, msg),
    onStateChange: schedulePersist,
  });

  if (!expertMode && els.presetSelect) {
    els.presetSelect.innerHTML = (PRESETS || [])
      .map((p) => `<option value="${p.url}">${p.label}</option>`)
      .join('');

    els.presetSelect.value = DEFAULT_REGULAR_PRESET_URL;
    els.presetSelect.addEventListener('change', async () => {
      try {
        setStatus(els, 'Loading preset…');
        await loadPresetIntoState({ url: els.presetSelect.value, els, state, schedulePersist });
        setStatus(els, 'Loaded preset.');
        scheduleRender();
        setTimeout(() => setStatus(els, ''), 1500);
      } catch (e) {
        console.warn(e);
        setStatus(els, 'Could not load preset.');
        setTimeout(() => setStatus(els, ''), 2500);
      }
    });
  }

  if (expertMode && els.expertPresetSelect) {
    els.expertPresetSelect.innerHTML = (PRESETS || [])
      .map((p) => `<option value="${p.url}">${p.label}</option>`)
      .join('');
    els.expertPresetSelect.value = DEFAULT_PRESET_URL;
  }

  try {
    setStatus(els, 'Loading font…');
    await ensureFontLoaded(style.fontFamily);
    setStatus(els, '');
  } catch (e) {
    console.warn('Font load failed:', e);
    setStatus(els, 'Warning: font did not load.');
  }

  // Initial render
  scheduleRender();

  // Test hook
  window.__renderTestPngDataUrl = async function __renderTestPngDataUrl(options) {
    const opts = options || {};
    await ensureFontLoaded(style.fontFamily);

    const fontSize = clamp(Number(opts.fontSize) || 143, 8, 500);
    const scaleX = clampScale(opts.scaleX);
    const scaleY = clampScale(opts.scaleY);
    const padding = clamp(Number(opts.padding) || 24, 0, 300);
    const alignment = opts.alignment || 'center';
    const arcPct = clamp(Number(opts.arcPct) || 0, 0, 100);
    const scale = clamp(Number(opts.scale) || 1, 1, 8);
    const width = typeof opts.width === 'number' ? opts.width : undefined;
    const height = typeof opts.height === 'number' ? opts.height : undefined;

    const c = document.createElement('canvas');
    renderToCanvas({
      canvas: c,
      text: String(opts.text ?? ''),
      fontSize,
      scaleX,
      scaleY,
      alignment,
      padding,
      arcPct,
      showBg: Boolean(opts.showBg),
      bgColor: typeof opts.bgColor === 'string' ? opts.bgColor : undefined,
      layers: Array.isArray(opts.layers) ? opts.layers : state.layers,
      scale,
      targetWidth: width,
      targetHeight: height,
      anchor: opts.anchor,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      style,
    });

    return c.toDataURL('image/png');
  };

  els.exportBtn.addEventListener('click', () => {
    exportPng({ els, state, style }).catch((err) => {
      console.error(err);
      setStatus(els, 'Export failed. See console.');
    });
  });
}

init();
