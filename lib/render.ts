// テンプレートと描画エンジンで各ページの SVG を作る（spec.md 9章）
// 描画エンジンは DOM と canvas を使うため、ブラウザ側だけで呼び出すこと
import Drawer from "./drawer/Drawer";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./layout";
import type { OverflowField, OverflowInfo, Page, Participant, RenderedPage } from "./types";

// 寸法はほかのモジュールからも使うため、ここからも参照できるようにしておく
export { PAGE_HEIGHT, PAGE_WIDTH };

// テンプレートで使うフォント（文字の計測前に読み込みを待つ）
const FONT_FAMILY = "BIZ UDGothic";
const FONT_WEIGHTS = ["400", "700"];

const SVG_NS = "http://www.w3.org/2000/svg";

// 描画エンジンは、テンプレートの SVG ごとに読み込みと関数入力の展開を一度だけ行い、使い回す
// （編集画面では変更のたびに別の SVG になるため、直近のものだけを残す）
const DRAWER_CACHE_SIZE = 4;
const drawerCache = new Map<string, Drawer>();

function getDrawer(templateSvg: string): Drawer {
  const cached = drawerCache.get(templateSvg);
  if (cached) {
    // 使ったものを末尾に移して、古いものから捨てる
    drawerCache.delete(templateSvg);
    drawerCache.set(templateSvg, cached);
    return cached;
  }
  const doc = new DOMParser().parseFromString(templateSvg, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("テンプレートの SVG を読み取れませんでした");
  const drawer = new Drawer();
  drawer.load(doc.documentElement);
  drawerCache.set(templateSvg, drawer);
  while (drawerCache.size > DRAWER_CACHE_SIZE) {
    drawerCache.delete(drawerCache.keys().next().value as string);
  }
  return drawer;
}

// フォントの読み込みを待つ（描画エンジンが文字の高さを実測するため。spec.md 11章）
let fontsPromise: Promise<void> | null = null;
function waitForFonts(): Promise<void> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      // 日本語の文字を含めて指定し、日本語部分のフォントファイルも読み込ませる
      await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 16px "${FONT_FAMILY}"`, "あ寺H")));
      await document.fonts.ready;
    })();
  }
  return fontsPromise;
}

// 描画エンジンへ渡すデータに変換する（spec.md 5.3）
// 空欄にするブロック（null）は null のまま渡す。lcd-arg の値が null の関数呼び出しは描かれない（spec.md 20.4）
function toDrawParams(participants: (Participant | null)[]) {
  return {
    entries: participants.map((p) => p && ({
      line: p.line,
      name: p.name,
      contact: p.contact,
      afterword: p.afterword,
      icon: p.icon,
    })),
  };
}

// 1 ページ分を描画する
function drawPage(drawer: Drawer, participants: (Participant | null)[]): { svg: SVGSVGElement; overflows: OverflowInfo[] } {
  // ページごとに <svg> を作り、描画結果を入れる
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`);
  svg.setAttribute("width", String(PAGE_WIDTH));
  svg.setAttribute("height", String(PAGE_HEIGHT));
  svg.appendChild(drawer.draw(toDrawParams(participants)));

  // はみ出した項目を、参加者の行番号・名前つきの情報に変換する
  const overflows: OverflowInfo[] = drawer.getOverflows().map(
    (o: { field: string; args: { entry?: { line: number; name: string } }; droppedLines: number }) => ({
      line: o.args.entry?.line ?? 0,
      name: o.args.entry?.name ?? "",
      field: o.field as OverflowField,
      droppedLines: o.droppedLines,
    }),
  );
  return { svg, overflows };
}

// 全ページを描画する
export async function renderPages(pages: Page[], templateSvg: string): Promise<RenderedPage[]> {
  await waitForFonts();
  const drawer = getDrawer(templateSvg);
  return pages.map((page) => ({ pageNumber: page.pageNumber, ...drawPage(drawer, page.participants) }));
}

// 表示範囲（ページ座標）
export type ViewArea = { x: number; y: number; width: number; height: number };

// テンプレート編集画面のプレビュー用に 1 ページを描画する（spec.md 14.2）
// area を指定すると、その範囲だけを表示する SVG にする（ブロック 1 つの拡大表示に使う）
export async function renderTemplatePreview(
  templateSvg: string,
  participants: (Participant | null)[], // null は空欄にするブロック（PSD 書き出しから渡される。spec.md 20.4）
  area?: ViewArea,
): Promise<SVGSVGElement> {
  await waitForFonts();
  const { svg } = drawPage(getDrawer(templateSvg), participants);
  if (area) {
    svg.setAttribute("viewBox", `${area.x} ${area.y} ${area.width} ${area.height}`);
    svg.setAttribute("width", String(area.width));
    svg.setAttribute("height", String(area.height));
  }
  return svg;
}
