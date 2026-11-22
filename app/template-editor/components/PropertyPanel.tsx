"use client";

// 選択中のパーツのプロパティ欄（spec.md 14.3・18.2）
import { useRef, useState } from "react";
import { dataUrlBytes, IMAGE_ACCEPT } from "@/lib/imageFile";
import {
  ARRANGE_COUNT_MAX,
  type ArrangeItem,
  type BlockItem,
  type FontWeight,
  type ImagePart,
  type TextAlign,
  type TextContent,
} from "@/lib/templateModel";
import { CONTENT_LABELS } from "../partLabel";
import type { BlockLabel, CanvasItem } from "./EditorCanvas";
import { ColorField, NumberField } from "./Fields";

type Props = {
  part: CanvasItem | null;
  label: string; // 見出しに出す表示名（ブロックは番号つき）
  blockLabel: BlockLabel | null; // ブロックのときの番号（spec.md 18.2）
  fixedTextOnly: boolean; // テキストの内容を固定の文字列に限るか（ページ上の要素。spec.md 18.2）
  canMoveForward: boolean;
  canMoveBackward: boolean;
  onChange: (part: CanvasItem) => void;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onDelete: () => void;
  onReplaceImage: (file: File) => void; // 画像（固定）の「画像を選び直す…」で選んだとき
  arrangeInnerBlocks: BlockItem[]; // 等間隔配置のときの、計算済みの中のブロック（spec.md 19.3）
  onExplodeArrange: () => void; // 等間隔配置の「個別のブロックに分解」（spec.md 19.5）
};

const selectClass = "w-full rounded border border-zinc-400 px-2 py-1 text-sm";

export default function PropertyPanel({
  part,
  label,
  blockLabel,
  fixedTextOnly,
  canMoveForward,
  canMoveBackward,
  onChange,
  onMoveForward,
  onMoveBackward,
  onDelete,
  onReplaceImage,
  arrangeInnerBlocks,
  onExplodeArrange,
}: Props) {
  if (!part) {
    return <p className="text-sm text-zinc-500">パーツを選ぶと、ここで位置や大きさなどを編集できます</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold">{label}</h2>

      {/* 位置（全種類共通） */}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="x" value={part.x} onChange={(x) => onChange({ ...part, x })} />
        <NumberField label="y" value={part.y} onChange={(y) => onChange({ ...part, y })} />
      </div>

      {/* 種類ごとの属性 */}
      {part.kind === "rect" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="幅" value={part.width} min={1} onChange={(width) => onChange({ ...part, width })} />
            <NumberField label="高さ" value={part.height} min={1} onChange={(height) => onChange({ ...part, height })} />
          </div>
          <ColorField label="色" value={part.fill} onChange={(fill) => onChange({ ...part, fill })} />
        </>
      )}

      {part.kind === "icon" && (
        <>
          <NumberField label="大きさ（正方形の一辺）" value={part.size} min={1} onChange={(size) => onChange({ ...part, size })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={part.circle} onChange={(e) => onChange({ ...part, circle: e.target.checked })} />
            円形に切り抜く
          </label>
        </>
      )}

      {part.kind === "image" && <ImageProperties part={part} onChange={onChange} onReplaceImage={onReplaceImage} />}

      {part.kind === "block" && <BlockProperties part={part} blockLabel={blockLabel} onChange={onChange} />}

      {part.kind === "arrange" && (
        <ArrangeProperties part={part} blocks={arrangeInnerBlocks} onChange={onChange} onExplode={onExplodeArrange} />
      )}

      {part.kind === "text" && (
        <>
          <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
            内容
            <select
              className={selectClass}
              value={part.content}
              onChange={(e) => onChange({ ...part, content: e.target.value as TextContent })}
            >
              {/* ページ上のテキストは固定の文字列だけ（spec.md 18.2） */}
              {(fixedTextOnly ? (["fixed"] as TextContent[]) : (Object.keys(CONTENT_LABELS) as TextContent[])).map((c) => (
                <option key={c} value={c}>
                  {CONTENT_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {part.content === "fixed" && (
            <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
              文字列（改行できます）
              <textarea
                className="w-full rounded border border-zinc-400 px-2 py-1 text-sm"
                rows={3}
                value={part.fixedText}
                onChange={(e) => onChange({ ...part, fixedText: e.target.value })}
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="幅" value={part.width} min={1} onChange={(width) => onChange({ ...part, width })} />
            <NumberField label="高さ" value={part.height} min={1} onChange={(height) => onChange({ ...part, height })} />
            <NumberField label="文字の高さ" value={part.lineHeight} min={1} onChange={(lineHeight) => onChange({ ...part, lineHeight })} />
            <NumberField label="行間" value={part.interval} min={0} onChange={(interval) => onChange({ ...part, interval })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
              太さ
              <select
                className={selectClass}
                value={part.fontWeight}
                onChange={(e) => onChange({ ...part, fontWeight: e.target.value as FontWeight })}
              >
                <option value="400">標準（400）</option>
                <option value="700">太字（700）</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
              揃え
              <select
                className={selectClass}
                value={part.align}
                onChange={(e) => onChange({ ...part, align: e.target.value as TextAlign })}
              >
                <option value="left">左</option>
                <option value="center">中央</option>
                <option value="right">右</option>
              </select>
            </label>
          </div>
          <ColorField label="文字色" value={part.color} onChange={(color) => onChange({ ...part, color })} />
        </>
      )}

      {/* 重なり順と削除 */}
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          className="rounded border border-zinc-400 px-2 py-1 hover:bg-zinc-100 disabled:opacity-50"
          disabled={!canMoveForward}
          onClick={onMoveForward}
        >
          前面へ
        </button>
        <button
          type="button"
          className="rounded border border-zinc-400 px-2 py-1 hover:bg-zinc-100 disabled:opacity-50"
          disabled={!canMoveBackward}
          onClick={onMoveBackward}
        >
          背面へ
        </button>
        <button type="button" className="rounded border border-red-400 px-2 py-1 text-red-700 hover:bg-red-50" onClick={onDelete}>
          削除
        </button>
      </div>
    </div>
  );
}

// 幅・高さの入力。縦横比を保つときは、変更直前の比に合わせてもう一方を計算する（整数に丸める）
// 比は入力欄にフォーカスした時点の幅 : 高さを使う（1 文字ずつ入力したときに、途中の値の丸めで比がずれないようにする）
function SizeFields({ part, onChange }: { part: ImagePart | BlockItem; onChange: (part: CanvasItem) => void }) {
  const ratioRef = useRef<number | null>(null);
  const rememberRatio = () => {
    ratioRef.current = part.width / part.height;
  };
  const changeWidth = (width: number) => {
    const ratio = ratioRef.current ?? part.width / part.height;
    const height = part.keepAspect ? Math.max(1, Math.round(width / ratio)) : part.height;
    onChange({ ...part, width, height });
  };
  const changeHeight = (height: number) => {
    const ratio = ratioRef.current ?? part.width / part.height;
    const width = part.keepAspect ? Math.max(1, Math.round(height * ratio)) : part.width;
    onChange({ ...part, width, height });
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="幅" value={part.width} min={1} onChange={changeWidth} onFocus={rememberRatio} />
        <NumberField label="高さ" value={part.height} min={1} onChange={changeHeight} onFocus={rememberRatio} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={part.keepAspect} onChange={(e) => onChange({ ...part, keepAspect: e.target.checked })} />
        縦横比を保つ
      </label>
    </>
  );
}

// ブロックの属性（spec.md 18.2・18.3）
function BlockProperties({
  part,
  blockLabel,
  onChange,
}: {
  part: BlockItem;
  blockLabel: BlockLabel | null;
  onChange: (part: CanvasItem) => void;
}) {
  return (
    <>
      {blockLabel && (
        <p className="text-xs text-zinc-600">
          {blockLabel.drawn
            ? `各ページの ${blockLabel.number} 人目の参加者を描きます`
            : "1 ページあたりの参加者数を超える番号のため、何も描きません"}
        </p>
      )}
      <SizeFields part={part} onChange={onChange} />
      <p className="text-xs text-zinc-500">ブロックの中身は、大きさ ÷ 基準サイズの倍率で拡大縮小して描きます</p>
    </>
  );
}

// 画像（固定）パーツの属性（spec.md 14.3.1）
function ImageProperties({
  part,
  onChange,
  onReplaceImage,
}: {
  part: ImagePart;
  onChange: (part: CanvasItem) => void;
  onReplaceImage: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // 元の大きさ（縮小表示の読み込み後にわかる）。どの画像の大きさかを href とあわせて持つ
  const [natural, setNatural] = useState<{ href: string; width: number; height: number } | null>(null);
  const naturalSize = natural?.href === part.href ? natural : null;

  return (
    <>
      {/* 縮小表示（data URL の画像なので next/image は使わない） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={part.href}
        alt="選んだ画像"
        className="max-h-32 w-full rounded border border-zinc-300 bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] object-contain"
        onLoad={(e) => setNatural({ href: part.href, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      />
      <p className="text-xs text-zinc-600">
        元の大きさ: {naturalSize && naturalSize.width > 0 ? `${naturalSize.width} × ${naturalSize.height} px` : "不明"}
        ／ データ量: {Math.ceil(dataUrlBytes(part.href) / 1024)} KB
      </p>
      <button
        type="button"
        className="rounded border border-zinc-400 px-2 py-1 text-sm hover:bg-zinc-100"
        onClick={() => fileRef.current?.click()}
      >
        画像を選び直す…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 同じファイルをもう一度選べるように空にしておく
          e.target.value = "";
          if (file) onReplaceImage(file);
        }}
      />
      <SizeFields part={part} onChange={onChange} />
    </>
  );
}

// 等間隔配置の属性（spec.md 19.2・19.5）
function ArrangeProperties({
  part,
  blocks,
  onChange,
  onExplode,
}: {
  part: ArrangeItem;
  blocks: BlockItem[];
  onChange: (part: CanvasItem) => void;
  onExplode: () => void;
}) {
  // 列数・行数は 1〜100、かつ列数 × 行数が 100 以下（spec.md 19.2）
  const tooMany = part.columns * part.rows > ARRANGE_COUNT_MAX;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="範囲の幅" value={part.width} min={1} onChange={(width) => onChange({ ...part, width })} />
        <NumberField label="範囲の高さ" value={part.height} min={1} onChange={(height) => onChange({ ...part, height })} />
        <NumberField
          label="列数"
          value={part.columns}
          min={1}
          onChange={(columns) => onChange({ ...part, columns: Math.min(ARRANGE_COUNT_MAX, columns) })}
        />
        <NumberField
          label="行数"
          value={part.rows}
          min={1}
          onChange={(rows) => onChange({ ...part, rows: Math.min(ARRANGE_COUNT_MAX, rows) })}
        />
        <NumberField label="列間隔" value={part.gapX} min={0} onChange={(gapX) => onChange({ ...part, gapX })} />
        <NumberField label="行間隔" value={part.gapY} min={0} onChange={(gapY) => onChange({ ...part, gapY })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={part.keepAspect} onChange={(e) => onChange({ ...part, keepAspect: e.target.checked })} />
        縦横比を保つ（ブロックの基準サイズと同じ縦横比）
      </label>
      <p className="text-xs text-zinc-600">並び順: 横優先（左上から右へ、次の行へ）</p>
      {tooMany ? (
        <p className="text-sm text-red-700">ブロック数（列数 × 行数）は {ARRANGE_COUNT_MAX} 以下にしてください</p>
      ) : blocks.length === 0 ? (
        <p className="text-sm text-red-700">範囲に収まりません。範囲を広げるか、間隔・列数・行数を減らしてください</p>
      ) : (
        <p className="text-xs text-zinc-600">
          ブロックの大きさ: {blocks[0].width} × {blocks[0].height}（{blocks.length} 個）
        </p>
      )}
      <button
        type="button"
        className="rounded border border-zinc-400 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50"
        disabled={blocks.length === 0}
        onClick={onExplode}
      >
        個別のブロックに分解
      </button>
    </>
  );
}
