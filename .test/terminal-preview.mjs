// Reconstruct a cropped SVG from captured terminal cells, never from the private reference.
import { writeFileSync } from "node:fs";
const escape = value => value.replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
export function savePreview(terminal, start, count, path) {
  const width = 590, height = 28 + count * 24;
  const texts = [];
  for (let row = 0; row < count; row++) {
    const line = terminal.buffer.active.getLine(terminal.buffer.active.viewportY + start + row);
    for (let col = 0; col < terminal.cols; col++) {
      const cell = line.getCell(col), chars = cell?.getChars();
      if (!chars || !chars.trim() || cell.getWidth() === 0) continue;
      const color = cell.isFgRGB() ? `#${cell.getFgColor().toString(16).padStart(6, "0")}` : "#dddddd";
      texts.push(`<text x="${18 + col * 8.5}" y="${28 + row * 24}" fill="${color}"${cell.isBold() ? ' font-weight="bold"' : ""}${cell.isStrikethrough() ? ' text-decoration="line-through"' : ""}>${escape(chars)}</text>`);
    }
  }
  writeFileSync(path, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Kimi-inspired TODO widget captured from Pi with synthetic tasks"><title>Pi TODO terminal capture — synthetic tasks</title><rect width="100%" height="100%" fill="#000000"/><g font-family="DejaVu Sans Mono, Noto Sans Mono CJK SC, monospace" font-size="14">${texts.join("")}</g></svg>\n`);
}
