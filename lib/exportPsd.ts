// PSD 書き出し・ダウンロード（F-11。spec.md 17章）
// 参加者ブロックの中の要素を 1 要素 1 レイヤーにし、ブロックごとにグループにまとめる
import type { Layer, Psd } from "ag-psd";
import { downloadBlob, getCapture } from "./exportPng";
import { BLOCK_ORIGINS, PAGE_HEIGHT, PAGE_WIDTH } from "./layout";
import { renderTemplatePreview } from "./render";
import { buildTemplateSvg, parseTemplate, type TemplatePart, type TextPart } from "./templateModel";
import type { Page, Participant } from "./types";

// 解像度情報（キャンバスサイズを変えても 350dpi のまま。spec.md 17.2）
const DPI = 350;

// キャンバスサイズの範囲（spec.md 17.2）
export const PSD_SIZE_MIN = 1;
export const PSD_SIZE_MAX = 30000;
// ブラウザの canvas で扱える面積の上限（Chrome）。これを超えるとラスタライズできない
export const PSD_AREA_MAX = 268_435_456;

// レイヤーを切り出すときに、パーツの範囲の外側に足す余白（ページ座標の px）
// 文字の一部が枠から少しはみ出して描かれることがあるため
const CROP_PADDING = 4;

// 文字レイヤーのフォント（PostScript 名。spec.md 17.4）
const PSD_FONTS = { "400": "BIZUDGothic-Regular", "700": "BIZUDGothic-Bold" } as const;

export type PsdSize = { width: number; height: number };

// ファイル名（afterword_01.psd の形。PNG と同じ番号の付け方）
export function psdFileName(pageNumber: number): string {
  return `afterword_${String(pageNumber).padStart(2, "0")}.psd`;
}

// PSD に入らない要素（編集画面で扱えない要素）の数（spec.md 17.5）
export function countPsdUnsupported(templateSvg: string): number {
  return parseTemplate(templateSvg).unsupported;
}

// 要素の識別ルールによるレイヤー名（spec.md 17.3）
function layerName(part: TemplatePart): string {
  switch (part.kind) {
    case "icon":
      return "アイコン";
    case "rect":
      return "塗り";
    case "image":
      return "画像";
    case "text":
      return { name: "名前", contact: "連絡先", afterword: "あとがき", fixed: "固定テキスト" }[part.content];
  }
}

// パーツの範囲（ブロック内の座標）。テキストは textArea
function partBox(part: TemplatePart): { x: number; y: number; width: number; height: number } {
  return part.kind === "icon"
    ? { x: part.x, y: part.y, width: part.size, height: part.size }
    : { x: part.x, y: part.y, width: part.width, height: part.height };
}

// CSS の色を RGB にする（canvas に解釈させる。読めない色は黒）
function toRgb(color: string): { r: number; g: number; b: number } {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return { r: 0, g: 0, b: 0 };
  ctx.fillStyle = "#000000";
  ctx.fillStyle = color;
  const v = String(ctx.fillStyle);
  if (v.startsWith("#")) {
    return { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) };
  }
  // 透明度つきの色は rgba(r, g, b, a) の形で返る（PSD の文字色には透明度を入れない）
  const [r = 0, g = 0, b = 0] = (v.match(/[\d.]+/g) ?? []).map(Number);
  return { r, g, b };
}

// 単色で塗った canvas を作る
function filledCanvas(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas を作成できませんでした");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

// canvas の一部を切り出す
function cropCanvas(source: HTMLCanvasElement, left: number, top: number, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(source, left, top, width, height, 0, 0, width, height);
  return canvas;
}

// 描画エンジンが描いた 1 行分の文字
type DrawnLine = { text: string; x: number; y: number; fontSize: number };

// 描画結果の <text> 要素を読む（座標はページ座標。y はベースライン）
function readDrawnLines(svg: SVGSVGElement): DrawnLine[] {
  return Array.from(svg.querySelectorAll("text"))
    .filter((el) => !el.hasAttribute("stroke")) // 縁取り用の複製は除く（このアプリのテンプレートでは使わない）
    .map((el) => ({
      text: el.textContent ?? "",
      x: parseFloat(el.getAttribute("x") ?? "0"),
      y: parseFloat(el.getAttribute("y") ?? "0"),
      fontSize: parseFloat(el.getAttribute("font-size") ?? "0"),
    }));
}

// 1 ページ分の PSD を作る
async function buildPsd(templateSvg: string, participants: Participant[], size: PsdSize): Promise<ArrayBuffer> {
  const { writePsd } = await import("ag-psd");
  const capture = await getCapture();
  const { model } = parseTemplate(templateSvg);

  // ページ全体を、縦横比を保ってキャンバスに収め、中央に置く（spec.md 17.2）
  const scale = Math.min(size.width / PAGE_WIDTH, size.height / PAGE_HEIGHT);
  const ox = (size.width - PAGE_WIDTH * scale) / 2;
  const oy = (size.height - PAGE_HEIGHT * scale) / 2;

  // SVG を、キャンバス全体に合わせた範囲（余白を含む）で透明な背景のままラスタライズする
  const rasterize = async (svg: SVGSVGElement): Promise<HTMLCanvasElement> => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("viewBox", `${-ox / scale} ${-oy / scale} ${size.width / scale} ${size.height / scale}`);
    const canvas: HTMLCanvasElement = await capture.captureCanvas(clone, size, { background: null });
    return canvas;
  };

  // ページ座標の範囲を、キャンバス上の切り出し範囲（整数・キャンバス内に収める）にする
  const toCanvasRect = (x: number, y: number, width: number, height: number) => {
    const left = Math.max(0, Math.floor(ox + (x - CROP_PADDING) * scale));
    const top = Math.max(0, Math.floor(oy + (y - CROP_PADDING) * scale));
    const right = Math.min(size.width, Math.ceil(ox + (x + width + CROP_PADDING) * scale));
    const bottom = Math.min(size.height, Math.ceil(oy + (y + height + CROP_PADDING) * scale));
    return { left, top, width: right - left, height: bottom - top };
  };

  // 合成画像: PNG と同じページ全体の描画結果（余白はページの背景色）
  const composite = filledCanvas(size.width, size.height, model.pageBackground);
  composite.getContext("2d")?.drawImage(await rasterize(await renderTemplatePreview(templateSvg, participants)), 0, 0);

  // ブロックごとのレイヤー（ag-psd の children は下から上の順）
  const blockLayers: Layer[][] = participants.map(() => []);

  // パーツごとに、そのパーツだけのテンプレート（背景なし）で 8 ブロック分を一度に描き、ブロックごとに切り出す
  for (const part of model.parts) {
    const partTemplate = buildTemplateSvg({ pageBackground: model.pageBackground, parts: [part] }, { withBackground: false });
    const partSvg = await renderTemplatePreview(partTemplate, participants);
    const raster = await rasterize(partSvg);
    const drawnLines = part.kind === "text" ? readDrawnLines(partSvg) : [];
    const box = partBox(part);

    participants.forEach((participant, j) => {
      // アイコンのない参加者のアイコンは描かれないので、レイヤーを作らない（spec.md 17.3）
      if (part.kind === "icon" && !participant.icon) return;

      const origin = BLOCK_ORIGINS[j];
      const rect = toCanvasRect(origin.x + box.x, origin.y + box.y, box.width, box.height);
      if (rect.width <= 0 || rect.height <= 0) return; // キャンバスの外
      const layer: Layer = {
        name: layerName(part),
        left: rect.left,
        top: rect.top,
        canvas: cropCanvas(raster, rect.left, rect.top, rect.width, rect.height),
      };

      if (part.kind === "text") {
        // このブロックの textArea の中に描かれた行（文字が 1 行もなければレイヤーを作らない）
        const areaX = origin.x + part.x;
        const areaY = origin.y + part.y;
        const lines = drawnLines.filter(
          (l) => l.x >= areaX - 1 && l.x <= areaX + part.width + 1 && l.y >= areaY && l.y <= areaY + part.height + 1,
        );
        if (lines.length === 0) return;
        layer.text = buildTextData(part, lines, areaX, scale, ox, oy);
      }
      blockLayers[j].push(layer);
    });
  }

  const psd: Psd = {
    width: size.width,
    height: size.height,
    canvas: composite,
    imageResources: {
      resolutionInfo: {
        horizontalResolution: DPI,
        horizontalResolutionUnit: "PPI",
        widthUnit: "Inches",
        verticalResolution: DPI,
        verticalResolutionUnit: "PPI",
        heightUnit: "Inches",
      },
    },
    children: [
      // 背景: キャンバス全体をページの背景色で塗る
      { name: "背景", canvas: filledCanvas(size.width, size.height, model.pageBackground) },
      // ブロック 1 が下、ブロック 8 が上（spec.md 17.3）
      ...participants.map((p, j) => ({
        name: `ブロック${j + 1}：${p.name}`,
        opened: true,
        children: blockLayers[j],
      })),
    ],
  };
  return writePsd(psd, { generateThumbnail: true });
}

// 文字レイヤーの情報を作る（spec.md 17.4）
function buildTextData(part: TextPart, lines: DrawnLine[], areaX: number, scale: number, ox: number, oy: number): Layer["text"] {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const first = sorted[0];
  // 行送り（描画エンジンの行の間隔）。空行は描かれないので、y の差から行番号を求めて空行を補う
  const step = part.lineHeight + part.interval;
  let text = "";
  let lastIndex = 0;
  sorted.forEach((line, i) => {
    const index = i === 0 ? 0 : Math.max(lastIndex + 1, Math.round((line.y - first.y) / step));
    // Photoshop の改行は \r
    text += i === 0 ? line.text : "\r".repeat(index - lastIndex) + line.text;
    lastIndex = index;
  });

  // ポイントテキストの基準点: 揃えに合わせて textArea の左端・中央・右端、y は 1 行目のベースライン
  const anchorX = part.align === "center" ? areaX + part.width / 2 : part.align === "right" ? areaX + part.width : areaX;
  return {
    text,
    transform: [1, 0, 0, 1, ox + anchorX * scale, oy + first.y * scale],
    style: {
      font: { name: PSD_FONTS[part.fontWeight] },
      fontSize: first.fontSize * scale,
      autoLeading: false,
      leading: step * scale,
      fillColor: toRgb(part.color),
    },
    paragraphStyle: { justification: part.align },
  };
}

// 1 ページを PSD にしてダウンロードする
export async function exportPsd(templateSvg: string, page: Page, size: PsdSize): Promise<void> {
  const buffer = await buildPsd(templateSvg, page.participants, size);
  downloadBlob(new Blob([buffer], { type: "image/vnd.adobe.photoshop" }), psdFileName(page.pageNumber));
}

// 全ページを 1 枚ずつ順番にダウンロードする（onProgress: 作成中のページが何枚目か）
export async function exportAllPsds(
  templateSvg: string,
  pages: Page[],
  size: PsdSize,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < pages.length; i++) {
    onProgress(i + 1, pages.length);
    await exportPsd(templateSvg, pages[i], size);
    // 連続ダウンロードがブラウザに間引かれないよう、少し間を空ける
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
