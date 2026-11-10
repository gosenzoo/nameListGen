// ページ割り（spec.md 7.1）
import type { Page, Participant } from "./types";

// 1 ページあたりのブロック数（縦 4 × 横 2）
export const ENTRIES_PER_PAGE = 8;

// CSV の順に 8 人ずつ区切ってページに割り当てる
export function paginate(participants: Participant[]): Page[] {
  const pages: Page[] = [];
  for (let i = 0; i < participants.length; i += ENTRIES_PER_PAGE) {
    pages.push({
      pageNumber: pages.length + 1,
      participants: participants.slice(i, i + ENTRIES_PER_PAGE),
    });
  }
  return pages;
}
