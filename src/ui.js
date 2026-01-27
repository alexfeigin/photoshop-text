import {
  LAYER_TYPES,
  addLayer,
  getLayerById,
  moveLayer,
  removeLayer,
  selectLayer,
  switchBaseFillType,
  updateLayer,
} from './state.js';
import { exportConfig, importConfig } from './serialize.js';
import { DEFAULT_PRESET_URL } from './preset.js';

const IMPORT_FALLBACK_COLOR = '#000000';

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function normalizeStopsForEdit(params) {
  const stops = Array.isArray(params?.stops) ? params.stops : [];
  const normalized = stops
    .map((s) => ({
      offsetPct: clampPct(s?.offsetPct),
      color: typeof s?.color === 'string' ? s.color : '#000000',
    }))
    .sort((a, b) => a.offsetPct - b.offsetPct);
  return normalized.length
    ? normalized
    : [
        { offsetPct: 0, color: '#FFF2A6' },
        { offsetPct: 55, color: '#FFD33A' },
        { offsetPct: 100, color: '#FF8F1F' },
      ];
}

function renderStopsEditor(p) {
  const stops = normalizeStopsForEdit(p);
  return `
    <div class="stopsHeader">
      <div class="label">Stops</div>
      <button class="button" type="button" data-action="addStop">Add stop</button>
    </div>
    <div class="stopsPanel" role="group" aria-label="Gradient stops">
      <div class="stopsList">
        ${stops
          .map((s, idx) => {
            const fieldOffset = `stop.${idx}.offsetPct`;
            const fieldColor = `stop.${idx}.color`;
            const color = normalizeHexColor(s.color) || '#000000';
            return `
              <div class="stopRow" data-stop-idx="${idx}">
                <div class="stopIdx">${idx + 1}</div>
                <input class="input stopOffset" type="number" min="0" max="100" step="1" data-field="${escapeHtml(fieldOffset)}" value="${escapeHtml(s.offsetPct)}" />
                <input class="colorSwatch stopSwatch" type="color" data-field="${escapeHtml(fieldColor)}" value="${escapeHtml(color)}" />
                <input class="input stopHex" type="text" data-hex-for="${escapeHtml(fieldColor)}" value="${escapeHtml(color)}" spellcheck="false" />
                <button class="button stopDel" type="button" data-action="delStop" data-stop-idx="${idx}">Del</button>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeHexColor(input) {
  const raw = String(input || '').trim();
  const s = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toUpperCase()}`;
}

function renderColorControl({ label, field, value }) {
  const v = normalizeHexColor(value) || '#000000';
  return `
    <div class="row">
      <label class="label">${escapeHtml(label)}</label>
      <div class="colorControl">
        <input class="colorSwatch" type="color" data-field="${escapeHtml(field)}" value="${escapeHtml(v)}" />
        <input class="input" type="text" data-hex-for="${escapeHtml(field)}" value="${escapeHtml(v)}" spellcheck="false" />
      </div>
    </div>
  `;
}

function renderLayerEditor(layer) {
  const common = `
    <div class="grid">
      <div class="row">
        <label class="label">Name</label>
        <input class="input" data-field="name" value="${escapeHtml(layer.name)}" />
      </div>
      <div class="row checkboxRow">
        <input type="checkbox" data-field="enabled" ${layer.enabled ? 'checked' : ''} />
        <label>Enabled</label>
      </div>
    </div>
  `;

  const baseType =
    layer.type === LAYER_TYPES.fill || layer.type === LAYER_TYPES.gradientFill
      ? `
      <div class="grid">
        <div class="row">
          <label class="label">Fill Type</label>
          <select class="input" data-field="baseFillType">
            <option value="fill" ${layer.type === LAYER_TYPES.fill ? 'selected' : ''}>Solid</option>
            <option value="gradientFill" ${layer.type === LAYER_TYPES.gradientFill ? 'selected' : ''}>Gradient</option>
          </select>
        </div>
      </div>
    `
      : '';

  if (layer.type === LAYER_TYPES.fill) {
    return `
      ${common}
      ${baseType}
      <div class="grid">
        ${renderColorControl({ label: 'Color', field: 'color', value: layer.params.color || '#000000' })}
      </div>
    `;
  }

  if (layer.type === LAYER_TYPES.gradientFill) {
    const p = layer.params;
    return `
      ${common}
      ${baseType}
      ${renderStopsEditor(p)}

      <div class="grid">
        <div class="row">
          <label class="label">Angle (deg)</label>
          <input class="input" type="number" data-field="angleDeg" min="-180" max="180" step="1" value="${escapeHtml(p.angleDeg ?? 90)}" />
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
        ${renderColorControl({ label: 'Color', field: 'color', value: p.color || '#000000' })}
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
        ${renderColorControl({ label: 'Color', field: 'color', value: p.color || '#000000' })}
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
        ${renderColorControl({ label: 'Color', field: 'color', value: p.color || '#6E00AF' })}
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
        ${renderColorControl({ label: 'Color', field: 'color', value: p.color || '#DE5221' })}
        <div class="row">
          <label class="label">Opacity (%)</label>
          <input class="input" type="number" data-field="opacityPct" min="0" max="100" step="1" value="${escapeHtml(p.opacityPct ?? 96)}" />
        </div>
        <div class="row">
          <label class="label">Steps</label>
          <input class="input" type="number" data-field="steps" min="0" max="200" step="0.1" value="${escapeHtml(p.steps ?? 7)}" />
        </div>
        <div class="row">
          <label class="label">dx (px)</label>
          <input class="input" type="number" data-field="dx" min="-80" max="80" step="0.1" value="${escapeHtml(p.dx ?? 0)}" />
        </div>
        <div class="row">
          <label class="label">dy (px)</label>
          <input class="input" type="number" data-field="dy" min="-80" max="80" step="0.1" value="${escapeHtml(p.dy ?? 3)}" />
        </div>
        <div class="row">
          <label class="label">Blur (px)</label>
          <input class="input" type="number" data-field="blurPx" min="0" max="80" step="0.1" value="${escapeHtml(p.blurPx ?? 0)}" />
        </div>
      </div>
    `;
  }

  return common;
}

function renderLayers({ els, state }) {
  if (!els.layersList || !els.layerEditorBody) return;
  const selectedId = state.selectedLayerId;

  els.layersList.innerHTML = state.layers
    .map((l, idx) => {
      const isSelected = l.id === selectedId;
      const badge = l.type;
      return `
        <div class="layerItem ${isSelected ? 'selected' : ''}" data-layer-id="${escapeHtml(l.id)}">
          <div class="layerMain">
            <input class="layerEnabled" type="checkbox" ${l.enabled ? 'checked' : ''} />
            <div>
              <div class="layerName">${escapeHtml(l.name)}</div>
              <div class="layerBadge">${escapeHtml(badge)}</div>
            </div>
          </div>
          <div class="layerBtns">
            <button class="layerBtn layerUp" type="button" ${idx === 0 ? 'disabled' : ''}>Up</button>
            <button class="layerBtn layerDown" type="button" ${idx === state.layers.length - 1 ? 'disabled' : ''}>Down</button>
            <button class="layerBtn layerDel" type="button">Del</button>
          </div>
        </div>
      `;
    })
    .join('');

  const selected = getLayerById(state, selectedId);
  els.layerEditorBody.innerHTML = selected ? renderLayerEditor(selected) : '';
}

export function bindUI({ els, state, scheduleRender, setStatus }) {
  const onStateChange = typeof arguments[0]?.onStateChange === 'function' ? arguments[0].onStateChange : () => {};

  function rerenderUI() {
    renderLayers({ els, state });
  }

  function applyImportedConfig(next) {
    state.layers = next.layers;
    state.selectedLayerId = next.selectedLayerId;
    onStateChange();
    rerenderUI();
    scheduleRender();
  }

  // Basic controls
  els.textInput?.addEventListener('input', () => {
    onStateChange();
    scheduleRender();
  });

  els.arcPct?.addEventListener('input', () => {
    onStateChange();
    scheduleRender();
  });

  els.loadPresetBtn?.addEventListener('click', async () => {
    try {
      setStatus('Loading preset…');
      const presetUrl = typeof els.expertPresetSelect?.value === 'string' && els.expertPresetSelect.value
        ? els.expertPresetSelect.value
        : DEFAULT_PRESET_URL;
      const res = await fetch(presetUrl, { cache: 'no-store' });
      if (!res.ok) {
        const details = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
        console.warn('Could not load preset:', details, res.url);
        setStatus(`Could not load preset (${details}).`);
        setTimeout(() => setStatus(''), 2500);
        return;
      }
      const txt = await res.text();
      const next = importConfig(txt, IMPORT_FALLBACK_COLOR);
      applyImportedConfig(next);
      setStatus('Loaded preset.');
      setTimeout(() => setStatus(''), 1500);
    } catch (e) {
      console.warn('Could not load preset:', e);
      setStatus('Could not load preset.');
      setTimeout(() => setStatus(''), 2500);
    }
  });

  els.layerEditorBody?.addEventListener('click', (e) => {
    const target = e.target;
    const action = target?.getAttribute?.('data-action');
    if (!action) return;
    const id = state.selectedLayerId;
    const layer = getLayerById(state, id);
    if (!layer || layer.type !== LAYER_TYPES.gradientFill) return;

    const curStops = normalizeStopsForEdit(layer.params);
    if (action === 'addStop') {
      curStops.push({ offsetPct: 50, color: IMPORT_FALLBACK_COLOR });
      updateLayer(state, id, { params: { stops: curStops } });
      onStateChange();
      rerenderUI();
      scheduleRender();
      return;
    }
    if (action === 'delStop') {
      const idx = Number(target.getAttribute('data-stop-idx'));
      if (!Number.isFinite(idx)) return;
      if (curStops.length <= 1) return;
      curStops.splice(idx, 1);
      updateLayer(state, id, { params: { stops: curStops } });
      onStateChange();
      rerenderUI();
      scheduleRender();
    }
  });
  els.fontSize?.addEventListener('input', () => {
    onStateChange();
    scheduleRender();
  });

  els.scaleX?.addEventListener('input', () => {
    onStateChange();
    scheduleRender();
  });

  els.scaleY?.addEventListener('input', () => {
    onStateChange();
    scheduleRender();
  });

  els.align?.addEventListener('change', () => {
    onStateChange();
    scheduleRender();
  });
  els.padding?.addEventListener('input', () => {
    onStateChange();
    scheduleRender();
  });

  els.refOpacity?.addEventListener('input', () => {
    const val = Number(els.refOpacity.value);
    els.referenceImg.style.opacity = String(Math.max(0, Math.min(1, val)));
  });

  els.showBg?.addEventListener('change', () => {
    onStateChange();
    scheduleRender();
  });

  // Layers
  els.addLayerBtn?.addEventListener('click', () => {
    const t = els.addLayerType?.value || LAYER_TYPES.dropShadow;
    addLayer(state, t);
    onStateChange();
    rerenderUI();
    scheduleRender();
  });

  els.layersList?.addEventListener('click', (e) => {
    const target = e.target;
    const item = target?.closest?.('.layerItem');
    if (!item) return;
    const id = item.getAttribute('data-layer-id');

    if (target.classList.contains('layerUp')) {
      moveLayer(state, id, -1);
      onStateChange();
      rerenderUI();
      scheduleRender();
      return;
    }
    if (target.classList.contains('layerDown')) {
      moveLayer(state, id, 1);
      onStateChange();
      rerenderUI();
      scheduleRender();
      return;
    }
    if (target.classList.contains('layerDel')) {
      removeLayer(state, id);
      onStateChange();
      rerenderUI();
      scheduleRender();
      return;
    }

    if (target.classList.contains('layerEnabled')) {
      updateLayer(state, id, { enabled: target.checked });
      onStateChange();
      rerenderUI();
      scheduleRender();
      return;
    }

    selectLayer(state, id);
    rerenderUI();
  });

  els.layersList?.addEventListener('change', (e) => {
    const target = e.target;
    if (!target.classList.contains('layerEnabled')) return;
    const item = target.closest('.layerItem');
    if (!item) return;
    const id = item.getAttribute('data-layer-id');
    updateLayer(state, id, { enabled: target.checked });
    onStateChange();
    rerenderUI();
    scheduleRender();
  });

  els.layerEditorBody?.addEventListener('input', (e) => {
    const target = e.target;
    const field = target.getAttribute?.('data-field');
    const hexFor = target.getAttribute?.('data-hex-for');
    if (!field && !hexFor) return;

    const id = state.selectedLayerId;
    const layer = getLayerById(state, id);
    if (!layer) return;

    if (field === 'name') {
      updateLayer(state, id, { name: target.value });
      onStateChange();
      return;
    }
    // Avoid rerendering the entire editor on every keystroke, otherwise focus gets lost.
    // Structural changes (like switching fill type) are handled on 'change' events below.
    if (field === 'enabled' || field === 'baseFillType') return;

    if (hexFor) {
      const norm = normalizeHexColor(target.value);
      if (!norm) return;
      target.value = norm;
      const swatch = els.layerEditorBody.querySelector(`input[type="color"][data-field="${CSS.escape(hexFor)}"]`);
      if (swatch) swatch.value = norm;

      if (hexFor.startsWith('stop.')) {
        const m = hexFor.match(/^stop\.(\d+)\.color$/);
        if (!m) return;
        const idx = Number(m[1]);
        const stops = normalizeStopsForEdit(layer.params);
        if (!stops[idx]) return;
        stops[idx] = { ...stops[idx], color: norm };
        updateLayer(state, id, { params: { stops } });
      } else {
        updateLayer(state, id, { params: { [hexFor]: norm } });
      }
      onStateChange();
      scheduleRender();
      return;
    }

    let val;
    if (target.type === 'checkbox') {
      val = Boolean(target.checked);
    } else if (target.type === 'number' || target.type === 'range') {
      val = Number(target.value);
    } else {
      val = target.value;
    }

    if (typeof field === 'string' && field.startsWith('stop.')) {
      const mOffset = field.match(/^stop\.(\d+)\.offsetPct$/);
      const mColor = field.match(/^stop\.(\d+)\.color$/);
      if (!mOffset && !mColor) return;

      const idx = Number((mOffset || mColor)[1]);
      const stops = normalizeStopsForEdit(layer.params);
      if (!stops[idx]) return;

      if (mOffset) {
        stops[idx] = { ...stops[idx], offsetPct: clampPct(val) };
      } else {
        const norm = normalizeHexColor(val);
        if (!norm) return;
        stops[idx] = { ...stops[idx], color: norm };

        // Keep hex input in sync when the swatch changes.
        if (target.type === 'color') {
          const hexInput = els.layerEditorBody.querySelector(
            `input[type="text"][data-hex-for="${CSS.escape(field)}"]`
          );
          if (hexInput) hexInput.value = norm;
        }
      }

      updateLayer(state, id, { params: { stops } });
    } else {
      updateLayer(state, id, { params: { [field]: val } });
    }
    onStateChange();

    // Keep hex inputs in sync when the swatch changes.
    if (target.type === 'color') {
      const hex = String(val);
      const hexInput = els.layerEditorBody.querySelector(`input[type="text"][data-hex-for="${CSS.escape(field)}"]`);
      if (hexInput) hexInput.value = hex;
    }
    scheduleRender();
  });

  els.layerEditorBody?.addEventListener('change', (e) => {
    const target = e.target;
    const field = target?.getAttribute?.('data-field');
    if (!field) return;

    const id = state.selectedLayerId;

    if (field === 'enabled') {
      updateLayer(state, id, { enabled: Boolean(target.checked) });
      onStateChange();
      rerenderUI();
      scheduleRender();
      return;
    }

    if (field === 'baseFillType') {
      const nextType = target.value;
      switchBaseFillType(state, nextType, IMPORT_FALLBACK_COLOR);
      onStateChange();
      rerenderUI();
      scheduleRender();
      return;
    }

    // For other fields: commit-time rerender keeps layer list/editor in sync without breaking typing.
    rerenderUI();
    scheduleRender();
  });

  // Config Import/Export (file-based)
  els.configFileInput?.addEventListener('change', async () => {
    const file = els.configFileInput.files && els.configFileInput.files[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const next = importConfig(txt, IMPORT_FALLBACK_COLOR);
      applyImportedConfig(next);
      setStatus(`Imported: ${file.name}`);
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      console.error(err);
      setStatus('Invalid config file.');
      setTimeout(() => setStatus(''), 2000);
    } finally {
      // Allow selecting the same file again.
      els.configFileInput.value = '';
    }
  });

  els.exportConfigBtn?.addEventListener('click', () => {
    try {
      const payload = exportConfig(state);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'text-layer-config.json';
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus('Exported config.');
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      console.error(err);
      setStatus('Export failed.');
      setTimeout(() => setStatus(''), 2000);
    }
  });

  // Initial render of UI
  rerenderUI();
}
