// ページ割り（spec.md 7.1・18.4）
import type { Page, Participant } from "./types";

// CSV の順に perPage 人ずつ区切ってページに割り当てる
// perPage は実際の 1 ページあたりの人数（= min(テンプレートの人数, ブロック数)。spec.md 18.4）
export function paginate(participants: Participant[], perPage: number): Page[] {
  if (perPage < 1) throw new Error("テンプレートにブロックがありません");
  const pages: Page[] = [];
  for (let i = 0; i < participants.length; i += perPage) {
    pages.push({
      pageNumber: pages.length + 1,
      participants: participants.slice(i, i + perPage),
    });
  }
  return pages;
}
