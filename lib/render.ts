// テンプレートと描画エンジンで各ページの SVG を作る（spec.md 9章）
// 描画エンジンは DOM と canvas を使うため、ブラウザ側だけで呼び出すこと
import Drawer from "./drawer/Drawer";
import type { OverflowField, OverflowInfo, Page, Participant, RenderedPage } from "./types";

// ページのピクセル数（B5 + 塗り足し 3mm を 350dpi。spec.md 6章）
export const PAGE_WIDTH = 2591;
export const PAGE_HEIGHT = 3624;

// テンプレートの置き場所
const TEMPLATE_URL = "/templates/page.svg";

// テンプレートで使うフォント（文字の計測前に読み込みを待つ）
const FONT_FAMILY = "BIZ UDGothic";
const FONT_WEIGHTS = ["400", "700"];

const SVG_NS = "http://www.w3.org/2000/svg";

// 描画エンジンはテンプレートの読み込みと関数入力の展開を一度だけ行い、使い回す
let drawerPromise: Promise<Drawer> | null = null;

// テンプレートを読み込んで描画エンジンを初期化する
function getDrawer(): Promise<Drawer> {
  if (!drawerPromise) {
    drawerPromise = (async () => {
      const res = await fetch(TEMPLATE_URL);
      if (!res.ok) throw new Error(`テンプレートを読み込めませんでした（${res.status}）`);
      const text = await res.text();
      const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
      const drawer = new Drawer();
      drawer.load(svg);
      return drawer;
    })();
    // 失敗した場合は次回に読み込み直せるようにする
    drawerPromise.catch(() => {
      drawerPromise = null;
    });
  }
  return drawerPromise;
}

// フォントの読み込みを待つ（描画エンジンが文字の高さを実測するため。spec.md 11章）
async function waitForFonts(): Promise<void> {
  // 日本語の文字を含めて指定し、日本語部分のフォントファイルも読み込ませる
  await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 16px "${FONT_FAMILY}"`, "あ寺H")));
  await document.fonts.ready;
}

// 描画エンジンへ渡すデータに変換する（spec.md 5.3）
function toDrawParams(participants: Participant[]) {
  return {
    entries: participants.map((p) => ({
      line: p.line,
      name: p.name,
      contact: p.contact,
      afterword: p.afterword,
      icon: p.icon,
    })),
  };
}

// 全ページを描画する
export async function renderPages(pages: Page[]): Promise<RenderedPage[]> {
  await waitForFonts();
  const drawer = await getDrawer();

  return pages.map((page) => {
    // ページごとに <svg> を作り、描画結果を入れる
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("viewBox", `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`);
    svg.setAttribute("width", String(PAGE_WIDTH));
    svg.setAttribute("height", String(PAGE_HEIGHT));
    svg.appendChild(drawer.draw(toDrawParams(page.participants)));

    // はみ出した項目を、参加者の行番号・名前つきの情報に変換する
    const overflows: OverflowInfo[] = drawer.getOverflows().map(
      (o: { field: string; args: { entry?: { line: number; name: string } }; droppedLines: number }) => ({
        line: o.args.entry?.line ?? 0,
        name: o.args.entry?.name ?? "",
        field: o.field as OverflowField,
        droppedLines: o.droppedLines,
      }),
    );

    return { pageNumber: page.pageNumber, svg, overflows };
  });
}
