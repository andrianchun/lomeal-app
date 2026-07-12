import React from 'react';

/**
 * RingChart — cincin progres SVG serbaguna.
 * - segments: [{ value, color }] → multi-segmen (ring makro piring)
 * - atau progress tunggal: progress (0-1) + color
 * Dipakai untuk Hero Widget dashboard & pinggiran piring Meal Grid.
 */
const RingChart = ({ size = 120, stroke = 10, progress = null, color = '#22c55e', trackColor = 'rgba(148,163,184,0.15)', segments = null, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  let segEls = null;
  if (segments && segments.length) {
    const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
    let offset = 0;
    segEls = segments.map((seg, i) => {
      const frac = Math.max(0, seg.value) / total;
      const dash = frac * c;
      const el = (
        <circle key={i} cx={center} cy={center} r={r} fill="none"
          stroke={seg.color} strokeWidth={stroke} strokeLinecap="butt"
          strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
          transform={`rotate(-90 ${center} ${center})`} />
      );
      offset += dash;
      return el;
    });
  }

  const p = progress === null ? null : Math.min(1, Math.max(0, progress));

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        {segEls}
        {p !== null && (
          <circle cx={center} cy={center} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${p * c} ${c - p * c}`}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.25,1,0.5,1)' }} />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
};

export default RingChart;
