import fs from 'fs';
import zlib from 'zlib';

function createPNG(size) {
  // Create RGBA buffer
  const width = size;
  const height = size;
  const buffer = Buffer.alloc(width * height * 4);

  // Background color: #0f172a (15, 23, 42)
  // Accent color: #818cf8 (129, 140, 248)
  // Secondary color: #38bdf8 (56, 189, 248)
  const radius = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Rounded rect check
      const dx = Math.max(0, Math.abs(x - cx) - (size / 2 - radius));
      const dy = Math.max(0, Math.abs(y - cy) - (size / 2 - radius));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside rounded rect
        // Create subtle gradient from top-left (#1e1b4b) to bottom-right (#0f172a)
        const t = (x + y) / (width + height);
        const rBg = Math.round(30 * (1 - t) + 15 * t);
        const gBg = Math.round(27 * (1 - t) + 23 * t);
        const bBg = Math.round(75 * (1 - t) + 42 * t);

        // Icon shape: code brackets < / >
        const relX = (x - cx) / (size * 0.35);
        const relY = (y - cy) / (size * 0.35);

        // Draw left angle bracket: |relX + 0.3| close to |relY|
        const isLeftBracket = Math.abs(relX + 0.35 + Math.abs(relY) * 0.4) < 0.15 && Math.abs(relY) < 0.6;
        // Draw right angle bracket
        const isRightBracket = Math.abs(relX - 0.35 - Math.abs(relY) * 0.4) < 0.15 && Math.abs(relY) < 0.6;
        // Draw slash
        const isSlash = Math.abs(relX + relY * 0.45) < 0.12 && Math.abs(relY) < 0.7;

        if (isLeftBracket || isRightBracket || isSlash) {
          buffer[idx] = 129;     // R #818cf8
          buffer[idx + 1] = 140; // G
          buffer[idx + 2] = 248; // B
          buffer[idx + 3] = 255; // A
        } else {
          buffer[idx] = rBg;
          buffer[idx + 1] = gBg;
          buffer[idx + 2] = bBg;
          buffer[idx + 3] = 255;
        }
      } else {
        // Transparent
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }

  // Build raw scanlines with filter type 0 (None)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0; // Filter byte 0
    buffer.copy(scanlines, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idatData = zlib.deflateSync(scanlines);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

[16, 48, 128].forEach(size => {
  const png = createPNG(size);
  fs.writeFileSync(`public/icons/icon${size}.png`, png);
  console.log(`Generated icon${size}.png`);
});
