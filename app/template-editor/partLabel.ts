// パーツの表示名（パーツ一覧・プロパティ欄で使う）
import type { PageItem, TemplatePart, TextContent } from "@/lib/templateModel";

export const CONTENT_LABELS: Record<TextContent, string> = {
  name: "名前",
  contact: "連絡先",
  afterword: "あとがき",
  fixed: "固定の文字列",
};

// ブロックは番号つきの名前を呼び出し側で付ける（番号は並び順で決まるため。spec.md 18.6）
export function partLabel(part: TemplatePart | PageItem): string {
  switch (part.kind) {
    case "rect":
      return "塗り";
    case "icon":
      return "アイコン";
    case "image":
      return "画像";
    case "block":
      return "ブロック";
    case "arrange":
      return "等間隔配置";
    case "text":
      return part.content === "fixed"
        ? `テキスト「${part.fixedText.split("\n")[0].slice(0, 10)}」`
        : `テキスト（${CONTENT_LABELS[part.content]}）`;
  }
}
