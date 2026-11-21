"use client";

// 選択中のパーツのプロパティ欄（spec.md 14.3）
import { useRef, useState } from "react";
import { dataUrlBytes, IMAGE_ACCEPT } from "@/lib/imageFile";
import type { FontWeight, ImagePart, TemplatePart, TextAlign, TextContent } from "@/lib/templateModel";
import { CONTENT_LABELS, partLabel } from "../partLabel";
import { ColorField, NumberField } from "./Fields";

type Props = {
  part: TemplatePart | null;
  canMoveForward: boolean;
  canMoveBackward: boolean;
  onChange: (part: TemplatePart) => void;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onDelete: () => void;
  onReplaceImage: (file: File) => void; // 画像（固定）の「画像を選び直す…」で選んだとき
};

const selectClass = "w-full rounded border border-zinc-400 px-2 py-1 text-sm";

export default function PropertyPanel({
  part,
  canMoveForward,
  canMoveBackward,
  onChange,
  onMoveForward,
  onMoveBackward,
  onDelete,
  onReplaceImage,
}: Props) {
  if (!part) {
    return <p className="text-sm text-zinc-500">パーツを選ぶと、ここで位置や大きさなどを編集できます</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold">{partLabel(part)}</h2>

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

      {part.kind === "text" && (
        <>
          <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
            内容
            <select
              className={selectClass}
              value={part.content}
              onChange={(e) => onChange({ ...part, content: e.target.value as TextContent })}
            >
              {(Object.keys(CONTENT_LABELS) as TextContent[]).map((c) => (
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

// 画像（固定）パーツの属性（spec.md 14.3.1）
function ImageProperties({
  part,
  onChange,
  onReplaceImage,
}: {
  part: ImagePart;
  onChange: (part: TemplatePart) => void;
  onReplaceImage: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // 元の大きさ（縮小表示の読み込み後にわかる）。どの画像の大きさかを href とあわせて持つ
  const [natural, setNatural] = useState<{ href: string; width: number; height: number } | null>(null);
  const naturalSize = natural?.href === part.href ? natural : null;

  // 縦横比を保つときは、変更直前の比に合わせてもう一方を計算する（整数に丸める）
  const changeWidth = (width: number) => {
    const height = part.keepAspect ? Math.max(1, Math.round((width * part.height) / part.width)) : part.height;
    onChange({ ...part, width, height });
  };
  const changeHeight = (height: number) => {
    const width = part.keepAspect ? Math.max(1, Math.round((height * part.width) / part.height)) : part.width;
    onChange({ ...part, width, height });
  };

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
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="幅" value={part.width} min={1} onChange={changeWidth} />
        <NumberField label="高さ" value={part.height} min={1} onChange={changeHeight} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={part.keepAspect} onChange={(e) => onChange({ ...part, keepAspect: e.target.checked })} />
        縦横比を保つ
      </label>
    </>
  );
}
