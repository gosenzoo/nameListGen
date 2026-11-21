// テンプレート編集画面のプレビュー用のダミーの参加者データ（spec.md 14.2）
// 実データは使わない
import { BLOCK_ORIGINS } from "./layout";
import type { Participant } from "./types";

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f1c40f", "#e67e22", "#1abc9c", "#34495e"];

// 単色の背景に白い円を描いたアイコンを canvas で作る（data URL）
function makeIcon(color: string): string {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 4, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toDataURL("image/png");
}

const AFTERWORD =
  "今回はじめて合同誌に参加しました。締め切り前はかなり慌ただしかったですが、" +
  "皆さんの原稿を読むのが楽しみです。\n次の機会があればまたよろしくお願いします。";

// ページを埋める 8 人分のダミーデータ（ブラウザでだけ呼び出す）
let cache: Participant[] | null = null;
export function getSampleParticipants(): Participant[] {
  if (!cache) {
    cache = BLOCK_ORIGINS.map((_, i) => ({
      line: i + 1,
      name: `サンプル参加者${String(i + 1).padStart(2, "0")}`,
      contact: `X: @sample_user${i + 1}\nhttps://example.com/sample${i + 1}`,
      afterword: AFTERWORD,
      icon: makeIcon(COLORS[i % COLORS.length]),
    }));
  }
  return cache;
}
