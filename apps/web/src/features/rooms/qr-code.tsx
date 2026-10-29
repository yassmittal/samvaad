'use client';

import { encode } from 'uqr';

/** A QR code as an inline SVG, one square per dark module. Drawn with `uqr` (Phase 4). */
export function QrCode({ text, label }: { text: string; label: string }) {
  // Medium error correction still scans off a bright or slightly scratched phone screen.
  const { data, size } = encode(text, { ecc: 'M', border: 2 });
  const darkModulesPath = data
    .flatMap((row, rowIndex) =>
      row.flatMap((isDark, columnIndex) => (isDark ? [`M${columnIndex} ${rowIndex}h1v1h-1z`] : [])),
    )
    .join('');

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="aspect-square w-full rounded-xl bg-white"
    >
      <path d={darkModulesPath} fill="#1c1917" />
    </svg>
  );
}
