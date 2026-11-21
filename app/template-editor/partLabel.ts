// パーツの表示名（パーツ一覧・プロパティ欄で使う）
import type { TemplatePart, TextContent } from "@/lib/templateModel";

export const CONTENT_LABELS: Record<TextContent, string> = {
  name: "名前",
  contact: "連絡先",
  afterword: "あとがき",
  fixed: "固定の文字列",
};

export function partLabel(part: TemplatePart): string {
  switch (part.kind) {
    case "rect":
      return "塗り";
    case "icon":
      return "アイコン";
    case "text":
      return part.content === "fixed"
        ? `テキスト「${part.fixedText.split("\n")[0].slice(0, 10)}」`
        : `テキスト（${CONTENT_LABELS[part.content]}）`;
  }
}
