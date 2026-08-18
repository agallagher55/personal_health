// Small dependency-free chart helpers, drawn on <canvas> (see
// docs/frontend-architecture.md - no charting library for v1).

const DPR = window.devicePixelRatio || 1;

function prepareCanvas(canvas) {
  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = canvas.clientHeight || canvas.height;
  canvas.width = cssWidth * DPR;
  canvas.height = cssHeight * DPR;
  const ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);
  return { ctx, width: cssWidth, height: cssHeight };
}

/**
 * Draws a simple line sparkline for `values` (an array of numbers; gaps can
 * be represented as null/undefined and are skipped, not interpolated).
 */
export function drawSparkline(canvas, values, { color = "#3b82f6", padding = 4 } = {}) {
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const points = values
    .map((v, i) => ({ i, v }))
    .filter((p) => typeof p.v === "number" && !Number.isNaN(p.v));

  if (points.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("no data", width / 2, height / 2);
    return;
  }

  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const range = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const n = values.length;

  const xFor = (i) => padding + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (v) => padding + innerH - ((v - min) / range) * innerH;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let started = false;
  for (const p of points) {
    const x = xFor(p.i);
    const y = yFor(p.v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Dot on the last real point.
  const last = points[points.length - 1];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(xFor(last.i), yFor(last.v), 3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws a horizontal stacked bar for sleep stages: segments is an array of
 * { minutes, color }, drawn left-to-right in the order given.
 */
export function drawStackedBar(canvas, segments, { padding = 2 } = {}) {
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const total = segments.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const innerW = width - padding * 2;
  const barHeight = height - padding * 2;

  if (total <= 0) {
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(padding, padding, innerW, barHeight);
    return;
  }

  let x = padding;
  for (const seg of segments) {
    const segWidth = (Math.max(seg.minutes, 0) / total) * innerW;
    if (segWidth <= 0) continue;
    ctx.fillStyle = seg.color;
    ctx.fillRect(x, padding, segWidth, barHeight);
    x += segWidth;
  }
}
