// PNG に解像度情報（pHYs チャンク）を書き込む（spec.md 6章）
// canvas.toBlob で作った PNG には解像度情報がないため、IHDR の直後に pHYs を差し込む

// CRC32 の計算表（PNG のチャンクの検査値に使う）
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// dpi をメートルあたりのピクセル数に換算する（350dpi → 13780）
export function dpiToPixelsPerMeter(dpi: number): number {
  return Math.round(dpi / 0.0254);
}

// PNG の Blob に pHYs チャンクを書き込んだ新しい Blob を返す
export async function setPngDpi(png: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await png.arrayBuffer());
  const view = new DataView(src.buffer);

  // PNG の署名（8 バイト）の次は IHDR チャンク（長さ 4 + 種類 4 + データ 13 + CRC 4 = 25 バイト）
  const ihdrEnd = 8 + 25;

  // 既存の pHYs チャンクがあれば取り除く（IDAT より前にある）
  const chunks: Uint8Array[] = [];
  let pos = ihdrEnd;
  while (pos < src.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...src.subarray(pos + 4, pos + 8));
    const end = pos + 12 + length;
    if (type !== "pHYs") chunks.push(src.subarray(pos, end));
    pos = end;
  }

  // pHYs チャンクを作る（X 方向・Y 方向のピクセル数/m と、単位 1 = メートル）
  const ppm = dpiToPixelsPerMeter(dpi);
  const phys = new Uint8Array(12 + 9);
  const pv = new DataView(phys.buffer);
  pv.setUint32(0, 9);
  phys.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  pv.setUint32(8, ppm);
  pv.setUint32(12, ppm);
  phys[16] = 1;
  pv.setUint32(17, crc32(phys.subarray(4, 17)));

  // 署名 + IHDR → pHYs → 残りのチャンク の順に 1 つの配列へ詰める
  const parts = [src.subarray(0, ihdrEnd), phys, ...chunks];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return new Blob([out], { type: "image/png" });
}
