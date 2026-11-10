// 試験用 CSV を生成するスクリプト（spec.md 12章）
// 実データは使わず、架空の参加者と単色のアイコンで作る
// 実行: node scripts/makeTestData.mjs  → testdata/test.csv
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "testdata", "test.csv");

// ---- 単色の PNG を作る（Node.js 標準機能だけを使う） ----

// CRC32（PNG のチャンクの検査値）
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// PNG のチャンク（長さ + 種類 + データ + CRC）
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// size × size の PNG。中央に白い円を描いて、切り抜き位置を確認しやすくする
function makeIcon(r, g, b, width = 128, height = 128) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ: RGB
  const rows = [];
  const cx = width / 2, cy = height / 2, rad = Math.min(width, height) / 4;
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); // 先頭はフィルタ種別 0
    for (let x = 0; x < width; x++) {
      const inCircle = (x - cx) ** 2 + (y - cy) ** 2 < rad ** 2;
      row.set(inCircle ? [255, 255, 255] : [r, g, b], 1 + x * 3);
    }
    rows.push(row);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ---- 参加者データ ----

const COLORS = [
  [231, 76, 60], [52, 152, 219], [46, 204, 113], [155, 89, 182], [241, 196, 15],
  [230, 126, 34], [26, 188, 156], [52, 73, 94], [236, 64, 122], [121, 85, 72],
];

const SHORT = "合同誌に参加できてとても楽しかったです。ありがとうございました！";
const MEDIUM =
  "今回はじめて合同誌に参加しました。締め切り前はかなり慌ただしかったですが、" +
  "皆さんの原稿を読むのが楽しみです。\n次の機会があればまたよろしくお願いします。";
const LONG = Array.from({ length: 12 }, (_, i) => `長文テスト${i + 1}行目：枠からはみ出すかどうかを確認するための文章です。`).join("\n");

// [名前, 連絡先, あとがき, アイコン]
const rows = [];
for (let i = 1; i <= 19; i++) {
  const [r, g, b] = COLORS[(i - 1) % COLORS.length];
  rows.push([`テスト参加者${String(i).padStart(2, "0")}`, `X: @test_user${i}`, i % 2 ? SHORT : MEDIUM, makeIcon(r, g, b)]);
}

// 特殊なケースを上書きする
rows[1] = ["カンマ, と \"引用符\" の人", "メール: test2@example.com\nWeb: https://example.com/test2", "本文に, カンマと \"ダブルクォート\" を含みます。\n改行も含みます。", makeIcon(52, 152, 219)];
rows[2] = ["長文の人", "https://example.com/very/long/url/for/testing/line/wrapping/of/contact/field", LONG, makeIcon(46, 204, 113)];
rows[3] = ["アイコンなしの人", "なし", SHORT, ""];
rows[4] = ["不正なアイコンの人", "なし", SHORT, "これは画像ではありません"];
rows[5] = ["横長アイコンの人", "X: @wide_icon", SHORT, makeIcon(155, 89, 182, 256, 128)];
rows[6] = ["とても長い名前の人とても長い名前の人とても長い名前の人とても長い名前の人", "連絡先1行目\n連絡先2行目\n連絡先3行目\n連絡先4行目\n連絡先5行目", MEDIUM, makeIcon(241, 196, 15)];

// CSV の値を RFC 4180 の形にする（改行・カンマ・ダブルクォートを含む値は囲む）
const quote = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const lines = rows.map((row) => row.map(quote).join(","));

// 列不足の行（エラーになることを確認する）
lines.splice(10, 0, "列が足りない人,連絡先だけ");
// 空行（読み飛ばされることを確認する）
lines.splice(12, 0, "");

mkdirSync(dirname(OUT), { recursive: true });
// 改行コードは CRLF（Excel などで作った CSV を想定）
writeFileSync(OUT, lines.join("\r\n") + "\r\n", "utf8");
console.log(`${OUT} を作成しました（参加者 ${rows.length} 人 + 列不足 1 行 + 空行 1 行）`);
