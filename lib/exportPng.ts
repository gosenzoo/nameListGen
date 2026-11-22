// PNG 書き出し・ダウンロード（spec.md 6章・9章）
import LcdCapture from "./drawer/lcdCapture";
import { setPngDpi } from "./pngDpi";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./render";

// 出力解像度
const DPI = 350;

// 埋め込み用フォントの取得は一度だけ行う
let capturePromise: Promise<LcdCapture> | null = null;

// PSD 書き出し（lib/exportPsd.ts）でも同じものを使う
export function getCapture(): Promise<LcdCapture> {
  if (!capturePromise) {
    capturePromise = (async () => {
      const capture = new LcdCapture();
      await capture.preloadFonts();
      return capture;
    })();
  }
  return capturePromise;
}

// ファイル名（afterword_01.png の形。ページ番号を 2 桁でゼロ埋め）
export function pngFileName(pageNumber: number): string {
  return `afterword_${String(pageNumber).padStart(2, "0")}.png`;
}

// 1 ページを PNG にしてダウンロードする
export async function exportPng(svg: SVGSVGElement, pageNumber: number): Promise<void> {
  const capture = await getCapture();
  const blob: Blob | null = await capture.capture(svg, { width: PAGE_WIDTH, height: PAGE_HEIGHT });
  if (!blob) throw new Error("PNG を作成できませんでした");
  const png = await setPngDpi(blob, DPI);
  downloadBlob(png, pngFileName(pageNumber));
}

// <a download> でダウンロードする（PSD 書き出しでも使う）
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // ダウンロードの開始を待ってから URL を解放する
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

// 全ページを 1 枚ずつ順番にダウンロードする
export async function exportAllPngs(pages: { svg: SVGSVGElement; pageNumber: number }[]): Promise<void> {
  for (const page of pages) {
    await exportPng(page.svg, page.pageNumber);
    // 連続ダウンロードがブラウザに間引かれないよう、少し間を空ける
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
