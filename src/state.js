export const LAYER_TYPES = {
  fill: 'fill',
  gradientFill: 'gradientFill',
  dropShadow: 'dropShadow',
  stroke: 'stroke',
  outerGlow: 'outerGlow',
  extrusion: 'extrusion',
};

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createLayer(type) {
  if (type === LAYER_TYPES.fill) {
    return {
      id: uid(),
      type,
      name: 'Fill',
      enabled: true,
      params: {
        color: '#000000',
      },
    };
  }

  if (type === LAYER_TYPES.gradientFill) {
    return {
      id: uid(),
      type,
      name: 'Gradient Fill',
      enabled: true,
      params: {
        stops: [
          { offsetPct: 0, color: '#FF8F1F' },
          { offsetPct: 55, color: '#FFD33A' },
          { offsetPct: 100, color: '#FFF2A6' },
        ],
        angleDeg: 90,
      },
    };
  }

  if (type === LAYER_TYPES.dropShadow) {
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

export function createDefaultState({ fillColor }) {
  const fill = createLayer(LAYER_TYPES.fill);
  fill.params.color = fillColor || '#000000';
  return {
    layers: [fill],
    selectedLayerId: fill.id,
  };
}

function findBaseFillIndex(state) {
  const gidx = state.layers.findIndex((l) => l && l.type === LAYER_TYPES.gradientFill);
  if (gidx !== -1) return gidx;
  const fidx = state.layers.findIndex((l) => l && l.type === LAYER_TYPES.fill);
  if (fidx !== -1) return fidx;
  return -1;
}

function ensureBaseFillLayer(state, fillColorFallback) {
  const idx = findBaseFillIndex(state);
  if (idx !== -1) return;

  const fill = createLayer(LAYER_TYPES.fill);
  fill.params.color = fillColorFallback || '#000000';
  state.layers = [fill, ...state.layers];
  state.selectedLayerId = fill.id;
}

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

export function getGradientMidColor(params, fallback) {
  const stops = Array.isArray(params?.stops) ? params.stops : null;
  if (!stops || stops.length === 0) return fallback;
  let best = null;
  let bestDist = Infinity;
  for (const s of stops) {
    const off = clampPct(s?.offsetPct);
    const dist = Math.abs(off - 50);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return typeof best?.color === 'string' ? best.color : fallback;
}

export function setGradientMidColor(params, color) {
  if (!params || typeof params !== 'object') return false;
  const stops = Array.isArray(params.stops) ? [...params.stops] : [];
  if (stops.length === 0) {
    params.stops = [{ offsetPct: 50, color }];
    return true;
  }

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const dist = Math.abs(clampPct(stops[i]?.offsetPct) - 50);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  stops[bestIdx] = { ...stops[bestIdx], color };
  params.stops = stops;
  return true;
}

export function switchBaseFillType(state, newType, fillColorFallback) {
  if (newType !== LAYER_TYPES.fill && newType !== LAYER_TYPES.gradientFill) return false;
  const idx = findBaseFillIndex(state);
  if (idx === -1) return false;
  const cur = state.layers[idx];
  if (cur.type === newType) return true;

  const next = createLayer(newType);
  // Preserve identity/position.
  next.id = cur.id;
  next.enabled = true;

  const fallback = fillColorFallback || '#000000';
  if (newType === LAYER_TYPES.fill) {
    const mid = getGradientMidColor(cur?.params, fallback);
    next.params.color = mid;
    next.name = 'Fill';
  } else {
    const color = cur?.params?.color;
    const c = typeof color === 'string' ? color : fallback;
    setGradientMidColor(next.params, c);
    next.name = 'Gradient Fill';
  }

  const layers = [...state.layers];
  layers[idx] = next;
  state.layers = layers;
  state.selectedLayerId = next.id;
  return true;
}

export function getLayerById(state, id) {
  return state.layers.find((l) => l.id === id) || null;
}

export function selectLayer(state, id) {
  state.selectedLayerId = id;
}

export function addLayer(state, type) {
  const layer = createLayer(type);
  state.layers.push(layer);
  state.selectedLayerId = layer.id;
  return layer;
}

export function removeLayer(state, id) {
  const layer = getLayerById(state, id);
  if (!layer) return false;

  state.layers = state.layers.filter((l) => l.id !== id);
  if (state.selectedLayerId === id) {
    state.selectedLayerId = state.layers[0]?.id ?? null;
  }

  ensureBaseFillLayer(state, '#000000');
  return true;
}

export function moveLayer(state, id, dir) {
  const idx = state.layers.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  const target = idx + dir;
  if (target < 0 || target >= state.layers.length) return false;
  const next = [...state.layers];
  const tmp = next[idx];
  next[idx] = next[target];
  next[target] = tmp;
  state.layers = next;
  return true;
}

export function updateLayer(state, id, patch) {
  let changed = false;
  state.layers = state.layers.map((l) => {
    if (l.id !== id) return l;
    changed = true;
    return {
      ...l,
      ...patch,
      params: {
        ...(l.params || {}),
        ...((patch && patch.params) || {}),
      },
    };
  });
  return changed;
}
