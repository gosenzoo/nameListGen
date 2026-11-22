"use client";

// PSD のキャンバスサイズの入力ダイアログ（F-11。spec.md 17.2）
// ブラウザの prompt は使わず、画面内に表示する
import { useState } from "react";
import { PAGE_HEIGHT, PAGE_WIDTH } from "@/lib/layout";
import { PSD_AREA_MAX, PSD_SIZE_MAX, PSD_SIZE_MIN, type PsdSize } from "@/lib/exportPsd";

type Props = {
  title: string; // 「1 ページ目を PSD で保存」など
  unsupported: number; // PSD に入らない要素の数（spec.md 17.5）
  onSave: (size: PsdSize) => void;
  onCancel: () => void;
};

// 入力欄の文字列を、範囲内の整数として読む（読めなければ null）
function parseSize(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= PSD_SIZE_MIN && n <= PSD_SIZE_MAX ? n : null;
}

export default function PsdSizeDialog({ title, unsupported, onSave, onCancel }: Props) {
  // 初期値は今のページサイズ
  const [width, setWidth] = useState(String(PAGE_WIDTH));
  const [height, setHeight] = useState(String(PAGE_HEIGHT));
  const w = parseSize(width);
  const h = parseSize(height);
  const tooLarge = w !== null && h !== null && w * h > PSD_AREA_MAX;
  const valid = w !== null && h !== null && !tooLarge;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        className="flex w-[440px] max-w-[90vw] flex-col gap-4 rounded bg-white p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave({ width: w, height: h });
        }}
      >
        <h2 className="font-bold">{title}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            幅（px）
            <input
              autoFocus
              type="number"
              min={PSD_SIZE_MIN}
              max={PSD_SIZE_MAX}
              className="rounded border border-zinc-400 px-2 py-1"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            高さ（px）
            <input
              type="number"
              min={PSD_SIZE_MIN}
              max={PSD_SIZE_MAX}
              className="rounded border border-zinc-400 px-2 py-1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-zinc-600">
          ページ全体を縦横比を保って拡大縮小し、中央に置きます（余白は背景色）。初期値はページの大きさ（{PAGE_WIDTH} × {PAGE_HEIGHT}）。
        </p>
        {(w === null || h === null) && (
          <p className="text-sm text-red-700">
            幅と高さは {PSD_SIZE_MIN}〜{PSD_SIZE_MAX} の整数で入力してください
          </p>
        )}
        {tooLarge && <p className="text-sm text-red-700">大きすぎるため作成できません（幅 × 高さが {PSD_AREA_MAX.toLocaleString()} 以下）</p>}
        {unsupported > 0 && (
          <p className="rounded border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-900">
            テンプレートに PSD に含まれない要素が {unsupported} 個あります（PNG には含まれます）
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-zinc-400 px-3 py-1 hover:bg-zinc-100" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!valid}
          >
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
