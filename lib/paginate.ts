// ページ割り（spec.md 7.1・18.4・20.3）
import type { Page, Participant } from "./types";

// CSV の順に perPage 人ずつ区切ってページに割り当てる
// perPage は実際の 1 ページあたりの人数（= min(テンプレートの人数, ブロック数)。spec.md 18.4）
// startBlock は開始位置（1 人目を置くブロックの番号。1 始まり。spec.md 20章）
// 最初のページだけ、先頭の (startBlock - 1) 個のブロックを空欄（null）にしてから詰める
export function paginate(participants: Participant[], perPage: number, startBlock = 1): Page[] {
  if (perPage < 1) throw new Error("テンプレートにブロックがありません");
  // 開始位置は 1〜perPage の整数に丸める（spec.md 20.2）
  const start = Math.min(perPage, Math.max(1, Math.round(startBlock)));
  const slots: (Participant | null)[] = [...Array<null>(start - 1).fill(null), ...participants];
  const pages: Page[] = [];
  // 参加者がいないときはページを作らない（空欄だけのページは作らない）
  if (participants.length === 0) return pages;
  for (let i = 0; i < slots.length; i += perPage) {
    pages.push({
      pageNumber: pages.length + 1,
      participants: slots.slice(i, i + perPage),
    });
  }
  return pages;
}
