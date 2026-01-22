import { LAYER_TYPES, createLayer } from './state.js';

function migrateGradientParams(params, fillColorFallback) {
  const p = params && typeof params === 'object' ? { ...params } : {};
  if (Array.isArray(p.stops)) {
    if (p.stops.length === 0) {
      p.stops = [{ offsetPct: 50, color: fillColorFallback || '#000000' }];
    }
    return p;
  }

  const top = p.topColor;
  const mid = p.midColor;
  const bottom = p.bottomColor;
  const midpointPct = p.midpointPct;

  const stops = [];
  if (typeof top === 'string') stops.push({ offsetPct: 0, color: top });
  if (typeof mid === 'string') stops.push({ offsetPct: typeof midpointPct === 'number' ? midpointPct : 55, color: mid });
  if (typeof bottom === 'string') stops.push({ offsetPct: 100, color: bottom });

  p.stops =
    stops.length > 0
      ? stops
      : [
          { offsetPct: 0, color: '#FF8F1F' },
          { offsetPct: 55, color: fillColorFallback || '#FFD33A' },
          { offsetPct: 100, color: '#FFF2A6' },
        ];

  delete p.topColor;
  delete p.midColor;
  delete p.bottomColor;
  delete p.midpointPct;
  delete p.highlightColor;
  delete p.highlightOpacityPct;
  delete p.highlightY0Pct;
  delete p.highlightY1Pct;
  return p;
}

export function exportConfig(state) {
  return {
    version: 1,
    layers: (state.layers || []).map((l) => {
      if (!l || typeof l !== 'object') return l;
      const { locked, ...rest } = l;

      if (rest.type === LAYER_TYPES.gradientFill) {
        return {
          ...rest,
          params: migrateGradientParams(rest.params, undefined),
        };
      }

      return rest;
    }),
  };
}

export function importConfig(jsonText, fillColorFallback) {
  const parsed = JSON.parse(jsonText || '{}');
  const nextLayers = Array.isArray(parsed.layers) ? parsed.layers : [];

  let base = nextLayers.find((l) => l && l.type === LAYER_TYPES.gradientFill);
  if (!base) base = nextLayers.find((l) => l && l.type === LAYER_TYPES.fill);
  if (!base) {
    base = createLayer(LAYER_TYPES.gradientFill);
    if (fillColorFallback && base.params && Array.isArray(base.params.stops)) {
      const mid = base.params.stops.find((s) => Number(s?.offsetPct) === 55);
      if (mid) mid.color = fillColorFallback;
    }
    nextLayers.unshift(base);
  }

  base.enabled = true;
  if (base.type === LAYER_TYPES.gradientFill) {
    base.name = 'Gradient Fill';
    if (!base.params) base.params = {};
    base.params = migrateGradientParams(base.params, fillColorFallback);
  } else {
    base.name = 'Fill';
    if (!base.params) base.params = { color: fillColorFallback || '#000000' };
    if (!base.params.color) base.params.color = fillColorFallback || '#000000';
  }

  const sanitized = nextLayers
    .filter((l) => l && typeof l.type === 'string' && typeof l.id === 'string')
    .map((l) => {
      const { locked, ...rest } = l;
      return {
        ...rest,
        params:
          rest.type === LAYER_TYPES.gradientFill
            ? migrateGradientParams(l.params, fillColorFallback)
            : l.params || {},
      };
    });

  return {
    version: 1,
    layers: sanitized,
    selectedLayerId: sanitized[0]?.id ?? null,
  };
}
