// テンプレートの SVG と編集用データの相互変換（spec.md 14.6）
import { BLOCK_HEIGHT, BLOCK_ORIGINS, BLOCK_WIDTH, PAGE_HEIGHT, PAGE_WIDTH } from "./layout";

// ---- 編集用のデータ ----

export type TextContent = "name" | "contact" | "afterword" | "fixed";
export type TextAlign = "left" | "center" | "right";
export type FontWeight = "400" | "700";

export type RectPart = {
  id: string;
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
};

export type IconPart = {
  id: string;
  kind: "icon";
  x: number;
  y: number;
  size: number; // 正方形の一辺
  circle: boolean; // 円形に切り抜くか
};

export type TextPart = {
  id: string;
  kind: "text";
  content: TextContent;
  fixedText: string; // content が "fixed" のときの文字列
  x: number; // textArea
  y: number;
  width: number;
  height: number;
  lineHeight: number; // 文字の高さ（textLine の height）
  interval: number; // 行間
  fontWeight: FontWeight;
  color: string;
  align: TextAlign;
};

export type TemplatePart = RectPart | IconPart | TextPart;

export type TemplateModel = {
  pageBackground: string; // ページの背景色
  parts: TemplatePart[]; // 描画順（後ろほど前面）
};

// 読み込み結果（unsupported: 編集画面で扱えず、保存すると失われる要素の数）
export type ParsedTemplate = {
  model: TemplateModel;
  unsupported: number;
};

// テキストの内容と、差し込み式・はみ出し報告の項目名の対応
const CONTENT_TEXT: Record<Exclude<TextContent, "fixed">, string> = {
  name: "#{$entry.name}",
  contact: "#{$entry.contact}",
  afterword: "#{$entry.afterword}",
};

const FONT_FAMILY = "BIZ UDGothic";
const FUNC_NAME = "entryBlock";

// パーツの id（画面上の識別用。SVG には書き出さない）
let idCounter = 0;
export function newPartId(): string {
  idCounter += 1;
  return `part-${Date.now().toString(36)}-${idCounter}`;
}

// ---- SVG → 編集用データ ----

// 数値属性を読む（なければ既定値）
function num(el: Element | null | undefined, name: string, fallback = 0): number {
  const v = parseFloat(el?.getAttribute(name) ?? "");
  return Number.isFinite(v) ? v : fallback;
}

// lcdParts 属性
function partsOf(el: Element): string | null {
  return el.getAttribute("lcdParts");
}

// テキストブロック（<g lcdParts="text">）を読む
function parseTextPart(g: Element): TextPart {
  const children = Array.from(g.children);
  const area = children.find((c) => partsOf(c) === "textArea");
  const line = children.find((c) => partsOf(c) === "textLine");

  // textLine の data-style（JSON）から太さと文字色を読む
  let style: { fontWeight?: string; fill?: string } = {};
  try {
    style = JSON.parse(line?.getAttribute("data-style") || "{}");
  } catch {
    style = {};
  }

  // lcdText が差し込み式なら名前・連絡先・あとがき、それ以外は固定の文字列
  const lcdText = g.getAttribute("lcdText") ?? "";
  const entry = (Object.entries(CONTENT_TEXT) as [Exclude<TextContent, "fixed">, string][]).find(
    ([, expr]) => expr === lcdText,
  );

  const align = g.getAttribute("lcd-holAlign");
  return {
    id: newPartId(),
    kind: "text",
    content: entry ? entry[0] : "fixed",
    fixedText: entry ? "" : lcdText,
    x: num(area, "x"),
    y: num(area, "y"),
    width: num(area, "width"),
    height: num(area, "height"),
    lineHeight: num(line, "height", 38),
    interval: num(g, "interval"),
    fontWeight: style.fontWeight === "700" ? "700" : "400",
    color: style.fill || "#000000",
    align: align === "center" || align === "right" ? align : "left",
  };
}

// テンプレートの SVG を編集用データに変換する
export function parseTemplate(svgText: string): ParsedTemplate {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("テンプレートの SVG を読み取れませんでした");
  const root = doc.documentElement;

  let pageBackground = "#ffffff";
  let backgroundFound = false;
  let unsupported = 0;
  const parts: TemplatePart[] = [];

  for (const el of Array.from(root.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === "defs") continue;
    // 関数呼び出し（8 ブロックの配置は固定なので読み飛ばす）
    if (el.hasAttribute("lcd-funcCall")) continue;

    // 参加者ブロックの定義
    if (el.getAttribute("lcd-funcDef") === FUNC_NAME) {
      for (const child of Array.from(el.children)) {
        const p = partsOf(child);
        const childTag = child.tagName.toLowerCase();
        if (p === "funcArea") continue;
        // lcdParts のない要素は描画されない目印なので読み飛ばす
        if (p === null) continue;

        if (p === "static" && childTag === "rect") {
          parts.push({
            id: newPartId(),
            kind: "rect",
            x: num(child, "x"),
            y: num(child, "y"),
            width: num(child, "width"),
            height: num(child, "height"),
            fill: child.getAttribute("fill") || "#000000",
          });
        } else if (p === "static" && childTag === "image") {
          parts.push({
            id: newPartId(),
            kind: "icon",
            x: num(child, "x"),
            y: num(child, "y"),
            size: num(child, "width"),
            circle: (child.getAttribute("clip-path") ?? "").includes("iconClip"),
          });
        } else if (p === "text" && childTag === "g") {
          parts.push(parseTextPart(child));
        } else {
          unsupported++;
        }
      }
      continue;
    }

    // ページの背景（最初の static な rect）
    if (!backgroundFound && partsOf(el) === "static" && tag === "rect") {
      pageBackground = el.getAttribute("fill") || "#ffffff";
      backgroundFound = true;
      continue;
    }

    // lcdParts のない要素は描画されないので読み飛ばす。それ以外は扱えない要素
    if (partsOf(el) !== null) unsupported++;
  }

  return { model: { pageBackground, parts }, unsupported };
}

// ---- 編集用データ → SVG ----

// XML の属性値として書けるようにエスケープする（改行は文字参照にして保持する）
function attr(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;");
}

// 1 パーツ分の SVG（ブロック内の座標）
function buildPart(part: TemplatePart): string {
  switch (part.kind) {
    case "rect":
      return `    <!-- 塗り -->
    <rect lcdParts="static" x="${attr(part.x)}" y="${attr(part.y)}" width="${attr(part.width)}" height="${attr(part.height)}" fill="${attr(part.fill)}" />`;
    case "icon": {
      const clip = part.circle ? `\n           clip-path="url(#iconClip)"` : "";
      return `    <!-- アイコン${part.circle ? "（四角に内接する円）" : ""} -->
    <image lcdParts="static" isDraw="$entry.icon" lcd-href="#{$entry.icon}"
           x="${attr(part.x)}" y="${attr(part.y)}" width="${attr(part.size)}" height="${attr(part.size)}" preserveAspectRatio="xMidYMid slice"${clip} />`;
    }
    case "text": {
      const content = part.content;
      const isFixed = content === "fixed";
      const lcdText = content === "fixed" ? part.fixedText : CONTENT_TEXT[content];
      // はみ出し警告は参加者の項目だけに付ける
      const overflow = isFixed ? "" : ` lcd-overflow="${content}"`;
      const interval = part.interval > 0 ? ` interval="${attr(part.interval)}"` : "";
      const style = JSON.stringify({ fontFamily: FONT_FAMILY, fontWeight: part.fontWeight, fill: part.color });
      const label = { name: "名前", contact: "連絡先", afterword: "あとがき本文", fixed: "固定の文字列" }[part.content];
      return `    <!-- テキスト（${label}） -->
    <g lcdParts="text" lcdText="${attr(lcdText)}"${overflow}
       lcd-holAlign="${part.align}" lcd-verAlign="top"${interval} breakType="1">
      <rect lcdParts="textArea" x="${attr(part.x)}" y="${attr(part.y)}" width="${attr(part.width)}" height="${attr(part.height)}" fill="#00a00033" />
      <rect lcdParts="textLine" x="${attr(part.x)}" y="${attr(part.y)}" width="${attr(part.width)}" height="${attr(part.lineHeight)}" fill="#ff800033"
            data-style="${attr(style)}" />
    </g>`;
    }
  }
}

// 編集用データからテンプレートの SVG を組み立てる（spec.md 7.3 の形式）
export function buildTemplateSvg(model: TemplateModel): string {
  const parts = model.parts.map(buildPart).join("\n\n");
  const calls = BLOCK_ORIGINS.map(
    ({ x, y }, i) =>
      `  <rect lcd-funcCall="${FUNC_NAME}" lcd-arg="entry:entries[${i}]" x="${x}" y="${y}" width="${BLOCK_WIDTH}" height="${BLOCK_HEIGHT}" fill="#0000ff33" />`,
  ).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}">
  <!-- あとがきリスト 1 ページ分のテンプレート（テンプレート編集画面で作成。spec.md 7.3・14.6）
       B5 + 塗り足し 3mm（188 x 263 mm）を 350dpi で ${PAGE_WIDTH} x ${PAGE_HEIGHT} px として扱う -->

  <defs>
    <!-- アイコンを円形に切り抜く。objectBoundingBox 指定なので、画像自身の四角に内接する円になる -->
    <clipPath id="iconClip" clipPathUnits="objectBoundingBox">
      <circle cx="0.5" cy="0.5" r="0.5" />
    </clipPath>
  </defs>

  <!-- 背景（塗り足し込み） -->
  <rect lcdParts="static" x="0" y="0" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${attr(model.pageBackground)}" />

  <!-- 関数呼び出し・funcArea・textArea・textLine の塗りは、配置を確認するための透明度 0.2 の目印（spec.md 7.3）。
       描画エンジンは描画しないため、プレビューと PNG には出ない -->

  <!-- 参加者ブロックの定義（関数入力） -->
  <g lcd-funcDef="${FUNC_NAME}">
    <rect lcdParts="funcArea" x="0" y="0" width="${BLOCK_WIDTH}" height="${BLOCK_HEIGHT}" fill="#80808033" />

${parts}
  </g>

  <!-- 8 ブロックの呼び出し（左上から右へ、次の段へ） -->
${calls}
</svg>
`;
}

// ---- 新しいパーツの既定値 ----

export function createPart(kind: TemplatePart["kind"]): TemplatePart {
  switch (kind) {
    case "rect":
      return { id: newPartId(), kind, x: 0, y: 0, width: 300, height: 150, fill: "#e5e7eb" };
    case "icon":
      return { id: newPartId(), kind, x: 0, y: 0, size: 250, circle: true };
    case "text":
      return {
        id: newPartId(),
        kind,
        content: "fixed",
        fixedText: "テキスト",
        x: 0,
        y: 0,
        width: 500,
        height: 60,
        lineHeight: 38,
        interval: 10,
        fontWeight: "400",
        color: "#000000",
        align: "left",
      };
  }
}
