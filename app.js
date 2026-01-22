const els = {
  textInput: document.getElementById('textInput'),
  fontSize: document.getElementById('fontSize'),
  fillColor: document.getElementById('fillColor'),
  align: document.getElementById('align'),
  exportScale: document.getElementById('exportScale'),
  padding: document.getElementById('padding'),
  refOpacity: document.getElementById('refOpacity'),
  showBg: document.getElementById('showBg'),
  addLayerType: document.getElementById('addLayerType'),
  addLayerBtn: document.getElementById('addLayerBtn'),
  layersList: document.getElementById('layersList'),
  layerEditorBody: document.getElementById('layerEditorBody'),
  layersJson: document.getElementById('layersJson'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  importJsonBtn: document.getElementById('importJsonBtn'),
  exportBtn: document.getElementById('exportBtn'),
  downloadLink: document.getElementById('downloadLink'),
  status: document.getElementById('status'),
  canvas: document.getElementById('canvas'),
  referenceImg: document.getElementById('referenceImg'),
  preview: document.getElementById('preview'),
};

const STYLE = {
  fontFamily: '"Mikado"',
  fontWeight: 900,
  lineHeight: 1.05,

  // Padding for export (additional beyond user padding)
  effectPad: 30,
};

const LAYER_TYPES = {
  fill: 'fill',
  dropShadow: 'dropShadow',
  stroke: 'stroke',
  outerGlow: 'outerGlow',
  extrusion: 'extrusion',
};

let appState = {
  layers: [],
  selectedLayerId: null,
};

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbaFromHex(hex, alpha01) {
  const { r, g, b } = hexToRgb(hex);
  const a = clamp(Number(alpha01) || 0, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function createLayer(type) {
  if (type === LAYER_TYPES.fill) {
    return {
      id: uid(),
      type,
      name: 'Fill',
      enabled: true,
      locked: true,
      params: {
        color: '#000000',
      },
    };
  }

  if (type === LAYER_TYPES.dropShadow) {
    // Defaults taken from drop-shadow-config.png
    return {
      id: uid(),
      type,
      name: 'Drop Shadow',
      enabled: true,
      params: {
        blend: 'normal',
        color: '#000000',
        opacityPct: 19,
        angleDeg: 66,
        distancePx: 7,
        spreadPct: 15,
        sizePx: 10,
      },
    };
  }

  if (type === LAYER_TYPES.stroke) {
    return {
      id: uid(),
      type,
      name: 'Stroke',
      enabled: true,
      params: {
        color: '#000000',
        opacityPct: 100,
        widthPx: 4,
      },
    };
  }

  if (type === LAYER_TYPES.outerGlow) {
    return {
      id: uid(),
      type,
      name: 'Outer Glow',
      enabled: true,
      params: {
        color: '#6E00AF',
        opacityPct: 55,
        sizePx: 14,
        dx: 0,
        dy: 8,
      },
    };
  }

  if (type === LAYER_TYPES.extrusion) {
    return {
      id: uid(),
      type,
      name: 'Extrusion',
      enabled: true,
      params: {
        color: '#DE5221',
        opacityPct: 96,
        steps: 7,
        dx: 0,
        dy: 3,
        blurPx: 0,
      },
    };
  }

  throw new Error(`Unknown layer type: ${type}`);
}

function getFillLayer() {
  return appState.layers.find((l) => l.type === LAYER_TYPES.fill) || null;
}

function setSelectedLayer(id) {
  appState.selectedLayerId = id;
  renderLayersUI();
  scheduleRender();
}

function addLayer(type) {
  const layer = createLayer(type);
  appState.layers.push(layer);
  setSelectedLayer(layer.id);
}

function removeLayer(id) {
  const layer = appState.layers.find((l) => l.id === id);
  if (!layer || layer.locked) return;
  appState.layers = appState.layers.filter((l) => l.id !== id);
  if (appState.selectedLayerId === id) {
    appState.selectedLayerId = appState.layers[0]?.id ?? null;
  }
  renderLayersUI();
  scheduleRender();
}

function moveLayer(id, dir) {
  const idx = appState.layers.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const target = idx + dir;
  if (target < 0 || target >= appState.layers.length) return;
  const next = [...appState.layers];
  const tmp = next[idx];
  next[idx] = next[target];
  next[target] = tmp;
  appState.layers = next;
  renderLayersUI();
  scheduleRender();
}

function updateLayer(id, patch) {
  appState.layers = appState.layers.map((l) => {
    if (l.id !== id) return l;
    return {
      ...l,
      ...patch,
      params: {
        ...l.params,
        ...(patch.params || {}),
      },
    };
  });
  renderLayersUI();
  scheduleRender();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLayersUI() {
  if (!els.layersList || !els.layerEditorBody) return;

  const selectedId = appState.selectedLayerId;
  els.layersList.innerHTML = appState.layers
    .map((l, idx) => {
      const isSelected = l.id === selectedId;
      const badge = l.locked ? 'locked' : l.type;
      return `
        <div class="layerItem ${isSelected ? 'selected' : ''}" data-layer-id="${escapeHtml(l.id)}">
          <div class="layerMain">
            <input class="layerEnabled" type="checkbox" ${l.enabled ? 'checked' : ''} ${l.locked ? 'disabled' : ''} />
            <div>
              <div class="layerName">${escapeHtml(l.name)}</div>
              <div class="layerBadge">${escapeHtml(badge)}</div>
            </div>
          </div>
          <div class="layerBtns">
            <button class="layerBtn layerUp" type="button" ${idx === 0 ? 'disabled' : ''}>Up</button>
            <button class="layerBtn layerDown" type="button" ${idx === appState.layers.length - 1 ? 'disabled' : ''}>Down</button>
            <button class="layerBtn layerDel" type="button" ${l.locked ? 'disabled' : ''}>Del</button>
          </div>
        </div>
      `;
    })
    .join('');

  const selected = appState.layers.find((l) => l.id === selectedId) || null;
  els.layerEditorBody.innerHTML = selected ? renderLayerEditor(selected) : '';
}

function renderLayerEditor(layer) {
  const common = `
    <div class="grid">
      <div class="row">
        <label class="label">Name</label>
        <input class="input" data-field="name" value="${escapeHtml(layer.name)}" ${layer.locked ? 'disabled' : ''} />
      </div>
      <div class="row checkboxRow">
        <input type="checkbox" data-field="enabled" ${layer.enabled ? 'checked' : ''} ${layer.locked ? 'disabled' : ''} />
        <label>Enabled</label>
      </div>
    </div>
  `;

  if (layer.type === LAYER_TYPES.fill) {
    return `
      ${common}
      <div class="grid">
        <div class="row">
          <label class="label">Color</label>
          <input class="input" type="color" data-field="color" value="${escapeHtml(layer.params.color || '#000000')}" />
        </div>
      </div>
    `;
  }

  if (layer.type === LAYER_TYPES.dropShadow) {
    const p = layer.params;
    return `
      ${common}
      <div class="grid">
        <div class="row">
          <label class="label">Blend</label>
          <select class="input" data-field="blend">
            <option value="normal" ${p.blend === 'normal' ? 'selected' : ''}>Normal</option>
            <option value="multiply" ${p.blend === 'multiply' ? 'selected' : ''}>Multiply</option>
          </select>
        </div>
        <div class="row">
          <label class="label">Color</label>
          <input class="input" type="color" data-field="color" value="${escapeHtml(p.color || '#000000')}" />
        </div>
        <div class="row">
          <label class="label">Opacity (%)</label>
          <input class="input" type="number" data-field="opacityPct" min="0" max="100" step="1" value="${escapeHtml(p.opacityPct ?? 19)}" />
        </div>
        <div class="row">
          <label class="label">Angle (deg)</label>
          <input class="input" type="number" data-field="angleDeg" min="-180" max="180" step="1" value="${escapeHtml(p.angleDeg ?? 66)}" />
        </div>
        <div class="row">
          <label class="label">Distance (px)</label>
          <input class="input" type="number" data-field="distancePx" min="0" max="200" step="1" value="${escapeHtml(p.distancePx ?? 7)}" />
        </div>
        <div class="row">
          <label class="label">Spread (%)</label>
          <input class="input" type="number" data-field="spreadPct" min="0" max="100" step="1" value="${escapeHtml(p.spreadPct ?? 15)}" />
        </div>
        <div class="row">
          <label class="label">Size (px)</label>
          <input class="input" type="number" data-field="sizePx" min="0" max="200" step="1" value="${escapeHtml(p.sizePx ?? 10)}" />
        </div>
      </div>
    `;
  }

  if (layer.type === LAYER_TYPES.stroke) {
    const p = layer.params;
    return `
      ${common}
      <div class="grid">
        <div class="row">
          <label class="label">Color</label>
          <input class="input" type="color" data-field="color" value="${escapeHtml(p.color || '#000000')}" />
        </div>
        <div class="row">
          <label class="label">Opacity (%)</label>
          <input class="input" type="number" data-field="opacityPct" min="0" max="100" step="1" value="${escapeHtml(p.opacityPct ?? 100)}" />
        </div>
        <div class="row">
          <label class="label">Width (px)</label>
          <input class="input" type="number" data-field="widthPx" min="0" max="60" step="1" value="${escapeHtml(p.widthPx ?? 4)}" />
        </div>
      </div>
    `;
  }

  if (layer.type === LAYER_TYPES.outerGlow) {
    const p = layer.params;
    return `
      ${common}
      <div class="grid">
        <div class="row">
          <label class="label">Color</label>
          <input class="input" type="color" data-field="color" value="${escapeHtml(p.color || '#6E00AF')}" />
        </div>
        <div class="row">
          <label class="label">Opacity (%)</label>
          <input class="input" type="number" data-field="opacityPct" min="0" max="100" step="1" value="${escapeHtml(p.opacityPct ?? 55)}" />
        </div>
        <div class="row">
          <label class="label">Size (px)</label>
          <input class="input" type="number" data-field="sizePx" min="0" max="200" step="1" value="${escapeHtml(p.sizePx ?? 14)}" />
        </div>
        <div class="row">
          <label class="label">dx (px)</label>
          <input class="input" type="number" data-field="dx" min="-200" max="200" step="1" value="${escapeHtml(p.dx ?? 0)}" />
        </div>
        <div class="row">
          <label class="label">dy (px)</label>
          <input class="input" type="number" data-field="dy" min="-200" max="200" step="1" value="${escapeHtml(p.dy ?? 8)}" />
        </div>
      </div>
    `;
  }

  if (layer.type === LAYER_TYPES.extrusion) {
    const p = layer.params;
    return `
      ${common}
      <div class="grid">
        <div class="row">
          <label class="label">Color</label>
          <input class="input" type="color" data-field="color" value="${escapeHtml(p.color || '#DE5221')}" />
        </div>
        <div class="row">
          <label class="label">Opacity (%)</label>
          <input class="input" type="number" data-field="opacityPct" min="0" max="100" step="1" value="${escapeHtml(p.opacityPct ?? 96)}" />
        </div>
        <div class="row">
          <label class="label">Steps</label>
          <input class="input" type="number" data-field="steps" min="0" max="80" step="1" value="${escapeHtml(p.steps ?? 7)}" />
        </div>
        <div class="row">
          <label class="label">dx (px)</label>
          <input class="input" type="number" data-field="dx" min="-20" max="20" step="1" value="${escapeHtml(p.dx ?? 0)}" />
        </div>
        <div class="row">
          <label class="label">dy (px)</label>
          <input class="input" type="number" data-field="dy" min="-20" max="20" step="1" value="${escapeHtml(p.dy ?? 3)}" />
        </div>
        <div class="row">
          <label class="label">Blur (px)</label>
          <input class="input" type="number" data-field="blurPx" min="0" max="20" step="0.1" value="${escapeHtml(p.blurPx ?? 0)}" />
        </div>
      </div>
    `;
  }

  return common;
}

function setStatus(msg) {
  els.status.textContent = msg || '';
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function splitLines(text) {
  const normalized = (text ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  return lines.length ? lines : [''];
}

function ensureFontLoaded() {
  // Attempt to load Mikado at a representative size.
  // Some browsers ignore weight for OTF; keeping it simple.
  return document.fonts.load(`20px ${STYLE.fontFamily}`).then(() => document.fonts.ready);
}

function layersToRenderModel(layers) {
  const arr = Array.isArray(layers) ? layers : [];
  const enabled = arr.filter((l) => l && l.enabled);

  const fill = enabled.find((l) => l.type === LAYER_TYPES.fill) || null;
  const dropShadows = enabled.filter((l) => l.type === LAYER_TYPES.dropShadow);
  const strokes = enabled.filter((l) => l.type === LAYER_TYPES.stroke);
  const glows = enabled.filter((l) => l.type === LAYER_TYPES.outerGlow);
  const extrusions = enabled.filter((l) => l.type === LAYER_TYPES.extrusion);

  return { fill, dropShadows, strokes, glows, extrusions };
}

function measureTextBlock(ctx, lines, fontSizePx) {
  ctx.font = `${STYLE.fontWeight} ${fontSizePx}px ${STYLE.fontFamily}`;
  ctx.textBaseline = 'alphabetic';

  let maxWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    maxWidth = Math.max(maxWidth, w);
  }

  // Approximate ascent/descent using TextMetrics if available; fallback otherwise.
  const m = ctx.measureText(lines[0] || ' ');
  const ascent = m.actualBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent = m.actualBoundingBoxDescent ?? fontSizePx * 0.2;
  const lineHeight = fontSizePx * STYLE.lineHeight;

  const height = ascent + descent + (lines.length - 1) * lineHeight;

  return {
    width: maxWidth,
    height,
    ascent,
    descent,
    lineHeight,
  };
}

function getAlignX(alignment, xLeft, blockWidth) {
  if (alignment === 'left') return xLeft;
  if (alignment === 'right') return xLeft + blockWidth;
  return xLeft + blockWidth / 2;
}

function setCanvasSize(canvas, w, h) {
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));
}

function renderToCanvas({
  canvas,
  text,
  fontSize,
  alignment,
  padding,
  showBg,
  bgColor,
  layers,
  scale,
  targetWidth,
  targetHeight,
  anchor,
  offsetX,
  offsetY,
}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const lines = splitLines(text);

  // Measure on a scratch canvas.
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d');
  if (!sctx) throw new Error('Canvas 2D context unavailable');

  const metrics = measureTextBlock(sctx, lines, fontSize * scale);

  const padUser = padding * scale;
  const pad = padUser + STYLE.effectPad * scale;

  const model = layersToRenderModel(layers);

  let extraLeft = 0;
  let extraRight = 0;
  let extraTop = 0;
  let extraBottom = 0;

  for (const l of model.dropShadows) {
    const p = l.params || {};
    const blur = (Number(p.sizePx) || 0) * scale;
    const distance = (Number(p.distancePx) || 0) * scale;
    const angle = ((Number(p.angleDeg) || 0) * Math.PI) / 180;
    const dx = distance * Math.cos(angle);
    const dy = distance * Math.sin(angle);
    extraRight = Math.max(extraRight, blur + Math.max(0, dx));
    extraLeft = Math.max(extraLeft, blur + Math.max(0, -dx));
    extraBottom = Math.max(extraBottom, blur + Math.max(0, dy));
    extraTop = Math.max(extraTop, blur + Math.max(0, -dy));

    const spreadPx = ((Number(p.spreadPct) || 0) / 100) * (Number(p.sizePx) || 0) * 2 * scale;
    extraRight = Math.max(extraRight, spreadPx);
    extraLeft = Math.max(extraLeft, spreadPx);
    extraBottom = Math.max(extraBottom, spreadPx);
    extraTop = Math.max(extraTop, spreadPx);
  }

  for (const l of model.glows) {
    const p = l.params || {};
    const blur = (Number(p.sizePx) || 0) * scale;
    const dx = (Number(p.dx) || 0) * scale;
    const dy = (Number(p.dy) || 0) * scale;
    extraRight = Math.max(extraRight, blur + Math.max(0, dx));
    extraLeft = Math.max(extraLeft, blur + Math.max(0, -dx));
    extraBottom = Math.max(extraBottom, blur + Math.max(0, dy));
    extraTop = Math.max(extraTop, blur + Math.max(0, -dy));
  }

  for (const l of model.strokes) {
    const p = l.params || {};
    const w = (Number(p.widthPx) || 0) * scale;
    extraRight = Math.max(extraRight, w);
    extraLeft = Math.max(extraLeft, w);
    extraBottom = Math.max(extraBottom, w);
    extraTop = Math.max(extraTop, w);
  }

  for (const l of model.extrusions) {
    const p = l.params || {};
    const steps = Number(p.steps) || 0;
    const dx = (Number(p.dx) || 0) * steps * scale;
    const dy = (Number(p.dy) || 0) * steps * scale;
    extraRight = Math.max(extraRight, Math.max(0, dx));
    extraLeft = Math.max(extraLeft, Math.max(0, -dx));
    extraBottom = Math.max(extraBottom, Math.max(0, dy));
    extraTop = Math.max(extraTop, Math.max(0, -dy));
  }

  const autoWidth = metrics.width + pad * 2 + extraLeft + extraRight;
  const autoHeight = metrics.height + pad * 2 + extraTop + extraBottom;

  const width = typeof targetWidth === 'number' ? targetWidth * scale : autoWidth;
  const height = typeof targetHeight === 'number' ? targetHeight * scale : autoHeight;

  setCanvasSize(canvas, width, height);

  // Reset state after resizing.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (showBg) {
    // Preview-only background (not used on export)
    ctx.fillStyle = bgColor || '#7D2ED7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.textBaseline = 'alphabetic';
  ctx.font = `${STYLE.fontWeight} ${fontSize * scale}px ${STYLE.fontFamily}`;

  const resolvedAnchor = anchor || 'topleft';
  const shiftX = (Number(offsetX) || 0) * scale;
  const shiftY = (Number(offsetY) || 0) * scale;

  const xLeft =
    (resolvedAnchor === 'center' ? (canvas.width - metrics.width) / 2 : pad + extraLeft) + shiftX;
  const x = getAlignX(alignment, xLeft, metrics.width);
  ctx.textAlign = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center';

  // Baseline Y for first line.
  const y0 =
    resolvedAnchor === 'center'
      ? (canvas.height - metrics.height) / 2 + metrics.ascent + shiftY
      : pad + extraTop + metrics.ascent + shiftY;

  // Render layers in order
  for (const layer of Array.isArray(layers) ? layers : []) {
    if (!layer || !layer.enabled) continue;
    const p = layer.params || {};

    if (layer.type === LAYER_TYPES.dropShadow) {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const blur = (Number(p.sizePx) || 0) * scale;
      const distance = (Number(p.distancePx) || 0) * scale;
      const angle = ((Number(p.angleDeg) || 0) * Math.PI) / 180;
      const dx = distance * Math.cos(angle);
      const dy = distance * Math.sin(angle);
      const spreadPx = ((Number(p.spreadPct) || 0) / 100) * (Number(p.sizePx) || 0) * 2 * scale;

      ctx.save();
      ctx.globalCompositeOperation = p.blend === 'multiply' ? 'multiply' : 'source-over';
      ctx.shadowColor = rgbaFromHex(p.color || '#000000', opacity);
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = dx;
      ctx.shadowOffsetY = dy;

      ctx.fillStyle = 'rgba(0,0,0,1)';
      for (let i = 0; i < lines.length; i++) {
        const y = y0 + i * metrics.lineHeight;
        ctx.fillText(lines[i], x, y);
      }

      if (spreadPx > 0.1) {
        ctx.shadowBlur = 0;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = spreadPx;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          ctx.strokeText(lines[i], x, y);
        }
      }

      ctx.restore();
      continue;
    }

    if (layer.type === LAYER_TYPES.outerGlow) {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const blur = (Number(p.sizePx) || 0) * scale;
      const dx = (Number(p.dx) || 0) * scale;
      const dy = (Number(p.dy) || 0) * scale;

      ctx.save();
      ctx.shadowColor = rgbaFromHex(p.color || '#6E00AF', opacity);
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = dx;
      ctx.shadowOffsetY = dy;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = 6 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0)';
      for (let i = 0; i < lines.length; i++) {
        const y = y0 + i * metrics.lineHeight;
        ctx.strokeText(lines[i], x, y);
      }
      ctx.restore();
      continue;
    }

    if (layer.type === LAYER_TYPES.extrusion) {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const steps = clamp(Number(p.steps) || 0, 0, 200);
      const dxStep = (Number(p.dx) || 0) * scale;
      const dyStep = (Number(p.dy) || 0) * scale;
      const blur = clamp(Number(p.blurPx) || 0, 0, 50) * scale;

      ctx.save();
      ctx.fillStyle = rgbaFromHex(p.color || '#DE5221', opacity);
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';

      for (let step = 1; step <= steps; step++) {
        const dx = dxStep * step;
        const dy = dyStep * step;
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          ctx.fillText(lines[i], x + dx, y + dy);
        }
      }
      ctx.restore();
      continue;
    }

    if (layer.type === LAYER_TYPES.fill) {
      ctx.save();
      ctx.filter = 'none';
      ctx.fillStyle = p.color || '#000000';
      for (let i = 0; i < lines.length; i++) {
        const y = y0 + i * metrics.lineHeight;
        ctx.fillText(lines[i], x, y);
      }
      ctx.restore();
      continue;
    }

    if (layer.type === LAYER_TYPES.stroke) {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const w = clamp(Number(p.widthPx) || 0, 0, 200) * scale;
      if (w <= 0) continue;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = w;
      ctx.strokeStyle = rgbaFromHex(p.color || '#000000', opacity);
      for (let i = 0; i < lines.length; i++) {
        const y = y0 + i * metrics.lineHeight;
        ctx.strokeText(lines[i], x, y);
      }
      ctx.restore();
      continue;
    }
  }

  return {
    width: canvas.width,
    height: canvas.height,
  };
}

function updateReferenceOpacity() {
  const val = Number(els.refOpacity.value);
  els.referenceImg.style.opacity = String(clamp(val, 0, 1));
}

function updatePreviewBg() {
  // The canvas renderer paints the bg; we just trigger redraw.
  scheduleRender();
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderPreview();
  });
}

function renderPreview() {
  const fontSize = clamp(Number(els.fontSize.value) || 143, 8, 500);
  const padding = clamp(Number(els.padding.value) || 24, 0, 300);
  const alignment = els.align.value;
  const showBg = els.showBg.checked;

  const fill = getFillLayer();
  if (fill && els.fillColor) {
    // Keep Fill layer synced with the quick color picker.
    fill.params.color = els.fillColor.value;
  }

  renderToCanvas({
    canvas: els.canvas,
    text: els.textInput.value,
    fontSize,
    alignment,
    padding,
    showBg,
    bgColor: '#7D2ED7',
    layers: appState.layers,
    scale: 1,
  });
}

async function exportPng() {
  setStatus('Preparing…');
  els.downloadLink.hidden = true;

  await ensureFontLoaded();

  const fontSize = clamp(Number(els.fontSize.value) || 143, 8, 500);
  const padding = clamp(Number(els.padding.value) || 24, 0, 300);
  const alignment = els.align.value;
  const scale = clamp(Number(els.exportScale.value) || 2, 1, 4);

  const fill = getFillLayer();
  if (fill && els.fillColor) {
    fill.params.color = els.fillColor.value;
  }

  const exportCanvas = document.createElement('canvas');
  renderToCanvas({
    canvas: exportCanvas,
    text: els.textInput.value,
    fontSize,
    alignment,
    padding,
    showBg: false,
    layers: appState.layers,
    scale,
  });

  const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    setStatus('Export failed (could not create PNG).');
    return;
  }

  const url = URL.createObjectURL(blob);
  els.downloadLink.href = url;
  els.downloadLink.hidden = false;
  els.downloadLink.textContent = `Download (${exportCanvas.width}×${exportCanvas.height})`;
  els.downloadLink.click();

  setStatus('Exported.');

  // Cleanup after a bit.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

function bindEvents() {
  els.textInput.addEventListener('input', scheduleRender);
  els.fontSize.addEventListener('input', scheduleRender);
  els.fillColor?.addEventListener('input', scheduleRender);
  els.align.addEventListener('change', scheduleRender);
  els.padding.addEventListener('input', scheduleRender);

  els.addLayerBtn?.addEventListener('click', () => {
    const t = els.addLayerType?.value || LAYER_TYPES.dropShadow;
    addLayer(t);
  });

  els.layersList?.addEventListener('click', (e) => {
    const target = e.target;
    const item = target?.closest?.('.layerItem');
    if (!item) return;
    const id = item.getAttribute('data-layer-id');

    if (target.classList.contains('layerUp')) {
      moveLayer(id, -1);
      return;
    }
    if (target.classList.contains('layerDown')) {
      moveLayer(id, 1);
      return;
    }
    if (target.classList.contains('layerDel')) {
      removeLayer(id);
      return;
    }

    if (target.classList.contains('layerEnabled')) {
      const checked = target.checked;
      updateLayer(id, { enabled: checked });
      return;
    }

    setSelectedLayer(id);
  });

  els.layersList?.addEventListener('change', (e) => {
    const target = e.target;
    if (!target.classList.contains('layerEnabled')) return;
    const item = target.closest('.layerItem');
    if (!item) return;
    const id = item.getAttribute('data-layer-id');
    updateLayer(id, { enabled: target.checked });
  });

  els.layerEditorBody?.addEventListener('input', (e) => {
    const target = e.target;
    const field = target.getAttribute?.('data-field');
    if (!field) return;
    const id = appState.selectedLayerId;
    const layer = appState.layers.find((l) => l.id === id);
    if (!layer) return;

    if (field === 'name') {
      updateLayer(id, { name: target.value });
      return;
    }
    if (field === 'enabled') {
      updateLayer(id, { enabled: target.checked });
      return;
    }

    // Params
    let val;
    if (target.type === 'checkbox') {
      val = Boolean(target.checked);
    } else if (target.type === 'number' || target.type === 'range') {
      val = Number(target.value);
    } else {
      val = target.value;
    }
    updateLayer(id, { params: { [field]: val } });
  });

  els.layerEditorBody?.addEventListener('change', (e) => {
    // Keep select inputs responsive
    els.layerEditorBody.dispatchEvent(new Event('input', { bubbles: true }));
  });

  els.exportJsonBtn?.addEventListener('click', () => {
    const payload = {
      version: 1,
      layers: appState.layers,
    };
    els.layersJson.value = JSON.stringify(payload, null, 2);
  });

  els.importJsonBtn?.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(els.layersJson.value || '{}');
      const nextLayers = Array.isArray(parsed.layers) ? parsed.layers : [];
      // Ensure there is exactly one fill layer; lock it.
      let fill = nextLayers.find((l) => l && l.type === LAYER_TYPES.fill);
      if (!fill) {
        fill = createLayer(LAYER_TYPES.fill);
        nextLayers.unshift(fill);
      }
      fill.locked = true;
      fill.enabled = true;
      fill.name = 'Fill';
      if (!fill.params) fill.params = { color: '#000000' };
      if (!fill.params.color) fill.params.color = '#000000';

      appState.layers = nextLayers
        .filter((l) => l && typeof l.type === 'string' && typeof l.id === 'string')
        .map((l) => ({
          ...l,
          params: l.params || {},
        }));

      appState.selectedLayerId = appState.layers[0]?.id ?? null;
      els.fillColor.value = fill.params.color;
      renderLayersUI();
      scheduleRender();
    } catch (err) {
      console.error(err);
      setStatus('Invalid JSON.');
      setTimeout(() => setStatus(''), 2000);
    }
  });

  els.refOpacity.addEventListener('input', updateReferenceOpacity);
  els.showBg.addEventListener('change', updatePreviewBg);

  els.exportBtn.addEventListener('click', () => {
    exportPng().catch((err) => {
      console.error(err);
      setStatus('Export failed. See console.');
    });
  });
}

async function init() {
  bindEvents();
  updateReferenceOpacity();

  // Initialize default state: Fill-only, no effects.
  const fill = createLayer(LAYER_TYPES.fill);
  fill.params.color = els.fillColor?.value || '#000000';
  appState.layers = [fill];
  appState.selectedLayerId = fill.id;
  renderLayersUI();

  try {
    setStatus('Loading font…');
    await ensureFontLoaded();
    setStatus('');
  } catch (e) {
    console.warn('Font load failed:', e);
    setStatus('Warning: font did not load.');
  }

  renderPreview();
}

init();

window.__renderTestPngDataUrl = async function __renderTestPngDataUrl(options) {
  const opts = options || {};
  await ensureFontLoaded();

  const fontSize = clamp(Number(opts.fontSize) || 143, 8, 500);
  const padding = clamp(Number(opts.padding) || 24, 0, 300);
  const alignment = opts.alignment || 'center';
  const scale = clamp(Number(opts.scale) || 1, 1, 8);
  const width = typeof opts.width === 'number' ? opts.width : undefined;
  const height = typeof opts.height === 'number' ? opts.height : undefined;

  const layers = Array.isArray(opts.layers) ? opts.layers : appState.layers;

  const c = document.createElement('canvas');
  renderToCanvas({
    canvas: c,
    text: String(opts.text ?? ''),
    fontSize,
    alignment,
    padding,
    showBg: Boolean(opts.showBg),
    bgColor: typeof opts.bgColor === 'string' ? opts.bgColor : undefined,
    layers,
    scale,
    targetWidth: width,
    targetHeight: height,
    anchor: opts.anchor || (width && height ? 'center' : 'topleft'),
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
  });

  return c.toDataURL('image/png');
};
