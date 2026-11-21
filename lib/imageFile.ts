// テンプレートの画像（固定）パーツ用に、画像ファイルを data URL として読み込む（spec.md 14.3.1）

// 読み込める形式（ファイル選択の accept にも使う）
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";

// 1 ファイルの上限（2MB）
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

// 元の大きさが取れない画像（大きさ指定のない SVG など）の大きさ
const FALLBACK_SIZE = 300;

export type LoadedImage = {
  href: string; // data URL（base64）
  width: number; // 元の幅（px）
  height: number; // 元の高さ（px）
};

// File を data URL にする（再圧縮・縮小はしない）
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

// data URL の画像の元の大きさを調べる
export function measureImage(href: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      // 大きさが取れない場合は既定の大きさにする
      if (width > 0 && height > 0) resolve({ width, height });
      else resolve({ width: FALLBACK_SIZE, height: FALLBACK_SIZE });
    };
    img.onerror = () => reject(new Error("画像として読み取れないファイルです"));
    img.src = href;
  });
}

// 画像ファイルを読み込む。形式・大きさの上限を確かめ、合わなければエラーにする
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
    throw new Error(`「${file.name}」は読み込めない形式です（PNG・JPEG・GIF・WebP・SVG のみ）`);
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error(`「${file.name}」は 2MB を超えているため読み込めません（${Math.ceil(file.size / 1024)} KB）`);
  }
  const href = await readAsDataUrl(file);
  const { width, height } = await measureImage(href);
  return { href, width, height };
}

// data URL のデータ量（バイト。base64 を元に戻したときの大きさ）
export function dataUrlBytes(href: string): number {
  const comma = href.indexOf(",");
  const body = comma >= 0 ? href.slice(comma + 1) : href;
  // base64 でない data URL（URL エンコードの SVG など）はそのままの長さ
  if (!href.slice(0, comma).includes(";base64")) {
    try {
      return decodeURIComponent(body).length;
    } catch {
      return body.length;
    }
  }
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}
