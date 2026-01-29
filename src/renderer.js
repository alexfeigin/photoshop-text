function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function splitLines(text) {
  const normalized = (text ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  return lines.length ? lines : [''];
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

function measureTextBlock(ctx, lines, fontSizePx, style) {
  ctx.font = `${style.fontWeight} ${fontSizePx}px ${style.fontFamily}`;
  ctx.textBaseline = 'alphabetic';

  let maxWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    maxWidth = Math.max(maxWidth, w);
  }

  const m = ctx.measureText(lines[0] || ' ');
  const ascent = m.actualBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent = m.actualBoundingBoxDescent ?? fontSizePx * 0.2;
  const lineHeight = fontSizePx * style.lineHeight;
  const height = ascent + descent + (lines.length - 1) * lineHeight;

  return { width: maxWidth, height, ascent, descent, lineHeight };
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

function pct(v, fallback) {
  const n = Number(v);
  if (Number.isFinite(n)) return clamp(n, 0, 100);
  return clamp(Number(fallback) || 0, 0, 100);
}

function normalizeGradientStops(params) {
  const p = params || {};

  const rawStops = Array.isArray(p.stops) ? p.stops : null;
  if (rawStops && rawStops.length) {
    const normalized = rawStops
      .map((s, i) => {
        const off = pct(s?.offsetPct, 0) / 100;
        const color = typeof s?.color === 'string' ? s.color : null;
        return { offset: off, color, i };
      })
      .filter((s) => s.color);

    if (normalized.length) {
      normalized.sort((a, b) => (a.offset === b.offset ? a.i - b.i : a.offset - b.offset));
      return normalized;
    }
  }

  // Legacy fallback (top/mid/bottom + midpoint).
  const topColor = p.topColor || '#FFF2A6';
  const midColor = p.midColor || '#FFD33A';
  const bottomColor = p.bottomColor || '#FF8F1F';
  const midpoint = pct(p.midpointPct, 55) / 100;

  return [
    { offset: 0, color: topColor, i: 0 },
    { offset: midpoint, color: midColor, i: 1 },
    { offset: 1, color: bottomColor, i: 2 },
  ];
}

function buildRenderStack(layers) {
  const arr = Array.isArray(layers) ? layers : [];
  const enabled = arr.filter((l) => l && l.enabled);

  const effects = enabled.filter(
    (l) => l.type === 'dropShadow' || l.type === 'outerGlow' || l.type === 'extrusion'
  );
  const enabledGradientFills = enabled.filter((l) => l.type === 'gradientFill');
  const enabledFills = enabled.filter((l) => l.type === 'fill');

  // Only one base fill should be applied. Prefer gradientFill if present.
  const baseFill =
    enabledGradientFills.length > 0
      ? enabledGradientFills[enabledGradientFills.length - 1]
      : enabledFills.length > 0
        ? enabledFills[enabledFills.length - 1]
        : null;

  const fills = baseFill ? [baseFill] : [];
  const strokes = enabled.filter((l) => l.type === 'stroke');

  // Unknown/other types: keep them after fills but before strokes.
  const other = enabled.filter(
    (l) =>
      l.type !== 'dropShadow' &&
      l.type !== 'outerGlow' &&
      l.type !== 'extrusion' &&
      l.type !== 'fill' &&
      l.type !== 'gradientFill' &&
      l.type !== 'stroke'
  );

  return {
    enabled,
    stack: [...effects, ...fills, ...other, ...strokes],
  };
}

export function renderToCanvas({
  canvas,
  text,
  fontSize,
  scaleX,
  scaleY,
  alignment,
  padding,
  arcPct,
  showBg,
  bgColor,
  layers,
  scale,
  targetWidth,
  targetHeight,
  anchor,
  offsetX,
  offsetY,
  style,
}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const sxRaw = Number(scaleX);
  const syRaw = Number(scaleY);
  const sx = Number.isFinite(sxRaw) && sxRaw > 0 ? sxRaw : 1;
  const sy = Number.isFinite(syRaw) && syRaw > 0 ? syRaw : 1;
  const blurScale = Math.max(sx, sy);

  const lines = splitLines(text);
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d');
  if (!sctx) throw new Error('Canvas 2D context unavailable');

  const baseFontPx = fontSize * scale;
  const metricsBase = measureTextBlock(sctx, lines, baseFontPx, style);
  const metrics = {
    width: metricsBase.width * sx,
    height: metricsBase.height * sy,
    ascent: metricsBase.ascent * sy,
    descent: metricsBase.descent * sy,
    lineHeight: metricsBase.lineHeight * sy,
  };

  const padUser = padding * scale;
  const pad = padUser + (style.effectPad || 0) * scale;

  const { stack } = buildRenderStack(layers);

  let extraLeft = 0;
  let extraRight = 0;
  let extraTop = 0;
  let extraBottom = 0;

  for (const layer of stack) {
    const p = layer.params || {};

    if (layer.type === 'dropShadow') {
      const blur = (Number(p.sizePx) || 0) * scale * blurScale;
      const distance = (Number(p.distancePx) || 0) * scale;
      const angle = ((Number(p.angleDeg) || 0) * Math.PI) / 180;
      const dx = distance * Math.cos(angle) * sx;
      const dy = distance * Math.sin(angle) * sy;

      extraRight = Math.max(extraRight, blur + Math.max(0, dx));
      extraLeft = Math.max(extraLeft, blur + Math.max(0, -dx));
      extraBottom = Math.max(extraBottom, blur + Math.max(0, dy));
      extraTop = Math.max(extraTop, blur + Math.max(0, -dy));

      const spreadPx =
        ((Number(p.spreadPct) || 0) / 100) * (Number(p.sizePx) || 0) * 2 * scale * blurScale;
      extraRight = Math.max(extraRight, spreadPx);
      extraLeft = Math.max(extraLeft, spreadPx);
      extraBottom = Math.max(extraBottom, spreadPx);
      extraTop = Math.max(extraTop, spreadPx);
    }

    if (layer.type === 'outerGlow') {
      const blur = (Number(p.sizePx) || 0) * scale * blurScale;
      const dx = (Number(p.dx) || 0) * scale * sx;
      const dy = (Number(p.dy) || 0) * scale * sy;
      extraRight = Math.max(extraRight, blur + Math.max(0, dx));
      extraLeft = Math.max(extraLeft, blur + Math.max(0, -dx));
      extraBottom = Math.max(extraBottom, blur + Math.max(0, dy));
      extraTop = Math.max(extraTop, blur + Math.max(0, -dy));
    }

    if (layer.type === 'stroke') {
      const w = (Number(p.widthPx) || 0) * scale * blurScale;
      extraRight = Math.max(extraRight, w);
      extraLeft = Math.max(extraLeft, w);
      extraBottom = Math.max(extraBottom, w);
      extraTop = Math.max(extraTop, w);
    }

    if (layer.type === 'extrusion') {
      const steps = Number(p.steps) || 0;
      const dx = (Number(p.dx) || 0) * steps * scale * sx;
      const dy = (Number(p.dy) || 0) * steps * scale * sy;
      extraRight = Math.max(extraRight, Math.max(0, dx));
      extraLeft = Math.max(extraLeft, Math.max(0, -dx));
      extraBottom = Math.max(extraBottom, Math.max(0, dy));
      extraTop = Math.max(extraTop, Math.max(0, -dy));
    }
  }

  const autoWidth = metrics.width + pad * 2 + extraLeft + extraRight;
  const autoHeight = metrics.height + pad * 2 + extraTop + extraBottom;

  const w = typeof targetWidth === 'number' ? targetWidth * scale : autoWidth;
  const h = typeof targetHeight === 'number' ? targetHeight * scale : autoHeight;

  setCanvasSize(canvas, w, h);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (showBg) {
    ctx.fillStyle = bgColor || '#7D2ED7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.textBaseline = 'alphabetic';
  ctx.font = `${style.fontWeight} ${baseFontPx}px ${style.fontFamily}`;

  const resolvedAnchor = anchor || 'topleft';
  const shiftX = (Number(offsetX) || 0) * scale;
  const shiftY = (Number(offsetY) || 0) * scale;

  const xLeft =
    (resolvedAnchor === 'center' ? (canvas.width - metrics.width) / 2 : pad + extraLeft) + shiftX;
  const x = getAlignX(alignment, xLeft, metrics.width);
  ctx.textAlign = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center';

  const y0 =
    resolvedAnchor === 'center'
      ? (canvas.height - metrics.height) / 2 + metrics.ascent + shiftY
      : pad + extraTop + metrics.ascent + shiftY;

  const blockTop = y0 - metrics.ascent;
  const blockBottom = blockTop + metrics.height;

  // Draw in a scaled coordinate space so scaling affects glyphs and effects.
  // We convert device-space coordinates (computed above) into unscaled coordinates for draw calls.
  ctx.save();
  ctx.scale(sx, sy);
  const toUx = (x) => x / sx;
  const toUy = (y) => y / sy;

  for (const layer of stack) {
    const p = layer.params || {};

    if (layer.type === 'dropShadow') {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const blur = (Number(p.sizePx) || 0) * scale;
      const distance = (Number(p.distancePx) || 0) * scale;
      const angle = ((Number(p.angleDeg) || 0) * Math.PI) / 180;
      const dxDev = distance * Math.cos(angle) * sx;
      const dyDev = distance * Math.sin(angle) * sy;
      const spreadPx = ((Number(p.spreadPct) || 0) / 100) * (Number(p.sizePx) || 0) * 2 * scale;

      ctx.save();
      ctx.globalCompositeOperation = p.blend === 'multiply' ? 'multiply' : 'source-over';
      ctx.shadowColor = rgbaFromHex(p.color || '#000000', opacity);
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = dxDev / sx;
      ctx.shadowOffsetY = dyDev / sy;

      ctx.fillStyle = 'rgba(0,0,0,1)';
      for (let i = 0; i < lines.length; i++) {
        const y = y0 + i * metrics.lineHeight;
        ctx.fillText(lines[i], toUx(x), toUy(y));
      }

      if (spreadPx > 0.1) {
        ctx.shadowBlur = 0;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = spreadPx;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          ctx.strokeText(lines[i], toUx(x), toUy(y));
        }
      }

      ctx.restore();
      continue;
    }

    if (layer.type === 'outerGlow') {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const blur = (Number(p.sizePx) || 0) * scale;
      const dxDev = (Number(p.dx) || 0) * scale * sx;
      const dyDev = (Number(p.dy) || 0) * scale * sy;

      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tctx = tmp.getContext('2d');

      if (tctx) {
        tctx.clearRect(0, 0, tmp.width, tmp.height);
        tctx.save();
        tctx.scale(sx, sy);
        tctx.font = ctx.font;
        tctx.textAlign = ctx.textAlign;
        tctx.textBaseline = ctx.textBaseline;

        // 1) Draw shadowed glyph.
        tctx.shadowColor = rgbaFromHex(p.color || '#6E00AF', opacity);
        tctx.shadowBlur = blur;
        tctx.shadowOffsetX = dxDev / sx;
        tctx.shadowOffsetY = dyDev / sy;
        tctx.fillStyle = 'rgba(0,0,0,1)';
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          tctx.fillText(lines[i], toUx(x), toUy(y));
        }

        // 2) Punch out the solid glyph, leaving only the glow.
        tctx.globalCompositeOperation = 'destination-out';
        tctx.shadowColor = 'rgba(0,0,0,0)';
        tctx.shadowBlur = 0;
        tctx.shadowOffsetX = 0;
        tctx.shadowOffsetY = 0;
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          tctx.fillText(lines[i], toUx(x), toUy(y));
        }

        tctx.restore();

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      }
      continue;
    }

    if (layer.type === 'extrusion') {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const steps = clamp(Number(p.steps) || 0, 0, 200);
      const fullSteps = Math.floor(steps);
      const fracStep = steps - fullSteps;
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

      for (let step = 1; step <= fullSteps; step++) {
        const dx = dxStep * step;
        const dy = dyStep * step;
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          ctx.fillText(lines[i], toUx(x + dx * sx), toUy(y + dy * sy));
        }
      }

      if (fracStep > 0) {
        const step = fullSteps + 1;
        const dx = dxStep * step;
        const dy = dyStep * step;
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * fracStep;
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          ctx.fillText(lines[i], toUx(x + dx * sx), toUy(y + dy * sy));
        }
        ctx.globalAlpha = prevAlpha;
      }

      ctx.restore();
      continue;
    }

    if (layer.type === 'fill') {
      ctx.save();
      ctx.filter = 'none';
      ctx.fillStyle = p.color || '#000000';
      for (let i = 0; i < lines.length; i++) {
        const y = y0 + i * metrics.lineHeight;
        ctx.fillText(lines[i], toUx(x), toUy(y));
      }
      ctx.restore();
      continue;
    }

    if (layer.type === 'gradientFill') {
      const stops = normalizeGradientStops(p);

      // Map angle to a gradient line across the text block.
      const angle = ((Number(p.angleDeg) || 90) * Math.PI) / 180;
      const vx = Math.cos(angle);
      const vy = Math.sin(angle);

      const left = xLeft;
      const right = xLeft + metrics.width;
      const top = blockTop;
      const bottom = blockBottom;

      const corners = [
        { x: left, y: top },
        { x: right, y: top },
        { x: left, y: bottom },
        { x: right, y: bottom },
      ];

      let minProj = Infinity;
      let maxProj = -Infinity;
      for (const c of corners) {
        const proj = c.x * vx + c.y * vy;
        minProj = Math.min(minProj, proj);
        maxProj = Math.max(maxProj, proj);
      }

      const range = Math.max(1e-6, maxProj - minProj);
      const t0 = minProj;
      const t1 = minProj + range;

      const x0 = vx * t0;
      const yA = vy * t0;
      const x1 = vx * t1;
      const yB = vy * t1;

      ctx.save();
      ctx.filter = 'none';

      const g = ctx.createLinearGradient(toUx(x0), toUy(yA), toUx(x1), toUy(yB));
      for (const s of stops) {
        g.addColorStop(s.offset, s.color);
      }

      ctx.fillStyle = g;
      for (let i = 0; i < lines.length; i++) {
        const y = y0 + i * metrics.lineHeight;
        ctx.fillText(lines[i], toUx(x), toUy(y));
      }

      ctx.restore();
      continue;
    }

    if (layer.type === 'stroke') {
      const opacity = clamp((Number(p.opacityPct) || 0) / 100, 0, 1);
      const w = clamp(Number(p.widthPx) || 0, 0, 200) * scale;
      if (w <= 0) continue;

      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tctx = tmp.getContext('2d');

      if (tctx) {
        tctx.clearRect(0, 0, tmp.width, tmp.height);
        tctx.save();
        tctx.scale(sx, sy);
        tctx.font = ctx.font;
        tctx.textAlign = ctx.textAlign;
        tctx.textBaseline = ctx.textBaseline;
        tctx.lineJoin = 'round';
        tctx.miterLimit = 2;
        tctx.lineWidth = w;
        tctx.strokeStyle = rgbaFromHex(p.color || '#000000', opacity);
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          tctx.strokeText(lines[i], toUx(x), toUy(y));
        }

        tctx.globalCompositeOperation = 'destination-out';
        tctx.fillStyle = 'rgba(0,0,0,1)';
        for (let i = 0; i < lines.length; i++) {
          const y = y0 + i * metrics.lineHeight;
          tctx.fillText(lines[i], toUx(x), toUy(y));
        }

        tctx.restore();

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      }
      continue;

    }
  }

  ctx.restore();

  const arc = clamp(Number(arcPct) || 0, 0, 100);
  if (arc > 0) {
    const w0 = canvas.width;
    const h0 = canvas.height;
    const src = document.createElement('canvas');
    src.width = w0;
    src.height = h0;
    const sctx2 = src.getContext('2d');
    if (sctx2) {
      sctx2.drawImage(canvas, 0, 0);

      // Photoshop-like Arc: map the rectangle onto a circular arc by placing/rotating vertical slices.
      // IMPORTANT: allocate extra output height so the arc warp can't clip pixels (preview + export).
      const s = (arc / 100) * h0 * 0.35;
      const halfW = w0 / 2;
      const denom = Math.max(1e-6, 8 * s);
      const R = (w0 * w0) / denom + s / 2;
      const d = R - s;

      // Estimate the vertical displacement range caused by the arc.
      // yArc = d - R*cos(theta), theta depends on x.
      let minArc = Infinity;
      let maxArc = -Infinity;
      const sampleStep = Math.max(1, Math.floor(w0 / 512));
      for (let x = 0; x < w0; x += sampleStep) {
        const xc = x + 0.5;
        const xC = xc - halfW;
        const sinT = Math.max(-0.999999, Math.min(0.999999, xC / R));
        const theta = Math.asin(sinT);
        const yArc = d - R * Math.cos(theta);
        minArc = Math.min(minArc, yArc);
        maxArc = Math.max(maxArc, yArc);
      }
      if (!Number.isFinite(minArc) || !Number.isFinite(maxArc)) {
        minArc = -Math.abs(s);
        maxArc = 0;
      }

      const arcRange = Math.max(0, maxArc - minArc);
      const h1 = h0 + Math.ceil(arcRange);
      const midArc = (minArc + maxArc) / 2;

      // Resize output canvas; this clears it.
      canvas.width = w0;
      canvas.height = h1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w0, h1);

      if (showBg) {
        ctx.fillStyle = bgColor || '#7D2ED7';
        ctx.fillRect(0, 0, w0, h1);
      }

      const srcImg = sctx2.getImageData(0, 0, w0, h0);
      const outImg = ctx.createImageData(w0, h1);
      const sd = srcImg.data;
      const od = outImg.data;

      function sampleBilinear(x, y, outIdx) {
        // Sample at subpixel coordinate (x,y) in source image space.
        if (x < 0 || y < 0 || x >= w0 || y >= h0) {
          od[outIdx] = 0;
          od[outIdx + 1] = 0;
          od[outIdx + 2] = 0;
          od[outIdx + 3] = 0;
          return;
        }

        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(w0 - 1, x0 + 1);
        const y1 = Math.min(h0 - 1, y0 + 1);
        const tx = x - x0;
        const ty = y - y0;

        const i00 = (y0 * w0 + x0) * 4;
        const i10 = (y0 * w0 + x1) * 4;
        const i01 = (y1 * w0 + x0) * 4;
        const i11 = (y1 * w0 + x1) * 4;

        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;

        od[outIdx] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
        od[outIdx + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
        od[outIdx + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
        od[outIdx + 3] = sd[i00 + 3] * w00 + sd[i10 + 3] * w10 + sd[i01 + 3] * w01 + sd[i11 + 3] * w11;
      }

      for (let x = 0; x < w0; x++) {
        const xc = x + 0.5;
        const xC = xc - halfW;
        const sinT = Math.max(-0.999999, Math.min(0.999999, xC / R));
        const theta = Math.asin(sinT);
        const cosT = Math.cos(theta);
        const sinTheta = sinT; // sin(theta)
        const yArc = d - R * Math.cos(theta);

        const tx = halfW + xC;
        const ty = h1 / 2 + (yArc - midArc);

        for (let y = 0; y < h1; y++) {
          const yc = y + 0.5;
          const dx = xc - tx;
          const dy = yc - ty;

          // Inverse rotate the destination point back into the source slice frame.
          const ux = cosT * dx + sinTheta * dy;
          const uy = -sinTheta * dx + cosT * dy;

          const srcX = xc + ux;
          const srcY = h0 / 2 + uy;

          const outIdx = (y * w0 + x) * 4;
          sampleBilinear(srcX, srcY, outIdx);
        }
      }

      ctx.putImageData(outImg, 0, 0);
    }
  }

  return { width: canvas.width, height: canvas.height };
}