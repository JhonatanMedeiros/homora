import qrcode from 'qrcode-generator';

/** QR code drawn as SVG. Always dark on white: scanners need the contrast in any theme. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const size = qr.getModuleCount();
  const margin = 4;
  let path = '';
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++)
      if (qr.isDark(row, column)) path += `M${column + margin} ${row + margin}h1v1h-1z`;
  const side = size + margin * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${side} ${side}`}
      shapeRendering="crispEdges"
      className="size-48 rounded-md border"
    >
      <rect width={side} height={side} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
