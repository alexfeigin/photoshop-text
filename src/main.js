import { createDefaultState, getGradientMidColor } from './state.js';
import { renderToCanvas } from './renderer.js';
import { bindUI } from './ui.js';
import { importConfig } from './serialize.js';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ensureFontLoaded(fontFamily) {
  return document.fonts.load(`20px ${fontFamily}`).then(() => document.fonts.ready);
}

function getEls() {
  return {
    textInput: document.getElementById('textInput'),
    fontSize: document.getElementById('fontSize'),
    fillColor: document.getElementById('fillColor'),
    fillColorHex: document.getElementById('fillColorHex'),
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
    canvas: document.getElementById('canvas'),
    referenceImg: document.getElementById('referenceImg'),
  };
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

async function exportPng({ els, state, style }) {
  setStatus(els, 'Preparing…');
  els.downloadLink.hidden = true;

  await ensureFontLoaded(style.fontFamily);

  const fontSize = clamp(Number(els.fontSize.value) || 143, 8, 500);
  const padding = clamp(Number(els.padding.value) || 24, 0, 300);
  const alignment = els.align.value;
  const scale = clamp(Number(els.exportScale.value) || 2, 1, 4);

  const exportCanvas = document.createElement('canvas');
  renderToCanvas({
    canvas: exportCanvas,
    text: els.textInput.value,
    fontSize,
    alignment,
    padding,
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
  const style = {
    fontFamily: '"Mikado"',
    fontWeight: 900,
    lineHeight: 1.05,
    effectPad: 30,
  };

  const els = getEls();
  const state = createDefaultState({ fillColor: els.fillColor?.value || '#000000' });

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
          fontSize: els.fontSize?.value ?? '',
          alignment: els.align?.value ?? 'center',
          padding: els.padding?.value ?? '',
          showBg: Boolean(els.showBg?.checked),
          fillColor: els.fillColor?.value ?? '',
        },
        layers: layersForPersist,
        selectedLayerId: state.selectedLayerId,
      });
    }, 120);
  }

  const session = loadSessionState();
  if (session && Array.isArray(session.layers)) {
    const next = importConfig(JSON.stringify({ version: 1, layers: session.layers }), els.fillColor?.value);
    state.layers = next.layers;
    state.selectedLayerId = typeof session.selectedLayerId === 'string' ? session.selectedLayerId : next.selectedLayerId;

    if (session.ui && typeof session.ui === 'object') {
      if (typeof session.ui.text === 'string' && els.textInput) els.textInput.value = session.ui.text;
      if (typeof session.ui.fontSize === 'string' && els.fontSize) els.fontSize.value = session.ui.fontSize;
      if (typeof session.ui.alignment === 'string' && els.align) els.align.value = session.ui.alignment;
      if (typeof session.ui.padding === 'string' && els.padding) els.padding.value = session.ui.padding;
      if (typeof session.ui.showBg === 'boolean' && els.showBg) els.showBg.checked = session.ui.showBg;
    }

    const gfill = state.layers.find((l) => l.type === 'gradientFill');
    if (gfill && els.fillColor) {
      const mid = getGradientMidColor(gfill.params, els.fillColor.value);
      els.fillColor.value = mid;
      if (els.fillColorHex) els.fillColorHex.value = mid;
    }
    const fill = state.layers.find((l) => l.type === 'fill');
    if (!gfill && fill && els.fillColor) {
      els.fillColor.value = fill.params.color;
      if (els.fillColorHex) els.fillColorHex.value = fill.params.color;
    }

    schedulePersist();
  } else {
    try {
      const res = await fetch('presets/text-sample-no-background.json', { cache: 'no-store' });
      if (res.ok) {
        const txt = await res.text();
        const next = importConfig(txt, els.fillColor?.value);
        state.layers = next.layers;
        state.selectedLayerId = next.selectedLayerId;

        const gfill = state.layers.find((l) => l.type === 'gradientFill');
        if (gfill && els.fillColor) {
          const mid = getGradientMidColor(gfill.params, els.fillColor.value);
          els.fillColor.value = mid;
          if (els.fillColorHex) els.fillColorHex.value = mid;
        }
        const fill = state.layers.find((l) => l.type === 'fill');
        if (!gfill && fill && els.fillColor) {
          els.fillColor.value = fill.params.color;
          if (els.fillColorHex) els.fillColorHex.value = fill.params.color;
        }

        schedulePersist();
      }
    } catch (e) {
      console.warn('Could not load sample preset:', e);
    }
  }

  let renderQueued = false;
  function render() {
    const fontSize = clamp(Number(els.fontSize.value) || 143, 8, 500);
    const padding = clamp(Number(els.padding.value) || 24, 0, 300);
    const alignment = els.align.value;
    const showBg = els.showBg.checked;

    renderToCanvas({
      canvas: els.canvas,
      text: els.textInput.value,
      fontSize,
      alignment,
      padding,
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
    const padding = clamp(Number(opts.padding) || 24, 0, 300);
    const alignment = opts.alignment || 'center';
    const scale = clamp(Number(opts.scale) || 1, 1, 8);
    const width = typeof opts.width === 'number' ? opts.width : undefined;
    const height = typeof opts.height === 'number' ? opts.height : undefined;

    const c = document.createElement('canvas');
    renderToCanvas({
      canvas: c,
      text: String(opts.text ?? ''),
      fontSize,
      alignment,
      padding,
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
