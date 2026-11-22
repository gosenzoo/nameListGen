"use client";

// キャンバス（spec.md 14.2・14.4・18.6）
// 描画エンジンで実際に描画したページ（またはブロック）の上に、要素の枠と操作用のハンドルを重ねる
// 「ページ」の編集ではページ上の要素（ブロックなど）、「ブロックの中身」の編集ではブロックの中のパーツを操作する
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { renderTemplatePreview, type ViewArea } from "@/lib/render";
import { getSampleParticipants } from "@/lib/sampleData";
import type { PageItem, TemplatePart } from "@/lib/templateModel";

// キャンバスで操作する要素（ブロックの中のパーツ、またはページ上の要素）
export type CanvasItem = TemplatePart | PageItem;

// 大きさ変更のハンドルの向き
type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLE_DIRS: HandleDir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

// パーツの外枠（表示範囲の座標）
type Box = { x: number; y: number; width: number; height: number };
function boxOf(part: CanvasItem): Box {
  return part.kind === "icon"
    ? { x: part.x, y: part.y, width: part.size, height: part.size }
    : { x: part.x, y: part.y, width: part.width, height: part.height };
}

// ハンドルの中心座標
function handlePoint(box: Box, dir: HandleDir): { x: number; y: number } {
  const x = dir.includes("w") ? box.x : dir.includes("e") ? box.x + box.width : box.x + box.width / 2;
  const y = dir.includes("n") ? box.y : dir.includes("s") ? box.y + box.height : box.y + box.height / 2;
  return { x, y };
}

// 移動量（dx, dy）を加えたパーツを返す
function movePart(part: CanvasItem, dx: number, dy: number): CanvasItem {
  return { ...part, x: part.x + dx, y: part.y + dy };
}

// ハンドルのドラッグ量（dx, dy）で大きさを変えたパーツを返す
function resizePart(part: CanvasItem, dir: HandleDir, dx: number, dy: number): CanvasItem {
  if (part.kind === "icon") {
    // アイコンは正方形を保つ。角は大きく動いた方の軸に合わせる
    const dw = dir.includes("e") ? dx : dir.includes("w") ? -dx : 0;
    const dh = dir.includes("s") ? dy : dir.includes("n") ? -dy : 0;
    const delta = dir.length === 2 ? (Math.abs(dw) > Math.abs(dh) ? dw : dh) : dw || dh;
    const size = Math.max(1, part.size + delta);
    return {
      ...part,
      size,
      x: dir.includes("w") ? part.x + (part.size - size) : part.x,
      y: dir.includes("n") ? part.y + (part.size - size) : part.y,
    };
  }
  if ((part.kind === "image" || part.kind === "block") && part.keepAspect) {
    // 画像・ブロック（縦横比を保つ）: ドラッグ開始時の幅 : 高さを保つ（spec.md 14.3.1・18.3）
    const ratio = part.width / part.height;
    const dw = dir.includes("e") ? dx : dir.includes("w") ? -dx : 0;
    const dh = dir.includes("s") ? dy : dir.includes("n") ? -dy : 0;
    // 四隅は動かした量の大きい方の辺、各辺の中央はその辺に合わせて、もう一方を決める
    const byWidth = dir.length === 2 ? Math.abs(dw) >= Math.abs(dh) : dir === "e" || dir === "w";
    let width: number;
    let height: number;
    if (byWidth) {
      width = Math.max(1, part.width + dw);
      height = Math.max(1, Math.round(width / ratio));
    } else {
      height = Math.max(1, part.height + dh);
      width = Math.max(1, Math.round(height * ratio));
    }
    return {
      ...part,
      width,
      height,
      // 左・上のハンドルのときは、反対側の辺を固定する
      x: dir.includes("w") ? part.x + (part.width - width) : part.x,
      y: dir.includes("n") ? part.y + (part.height - height) : part.y,
    };
  }
  let { x, y, width, height } = part;
  if (dir.includes("e")) width = Math.max(1, part.width + dx);
  if (dir.includes("s")) height = Math.max(1, part.height + dy);
  if (dir.includes("w")) {
    width = Math.max(1, part.width - dx);
    x = part.x + (part.width - width);
  }
  if (dir.includes("n")) {
    height = Math.max(1, part.height - dy);
    y = part.y + (part.height - height);
  }
  return { ...part, x, y, width, height };
}

// ドラッグ中の状態
type DragState = {
  mode: "move" | "resize";
  dir: HandleDir | null;
  pointerId: number;
  startX: number;
  startY: number;
  original: CanvasItem; // ドラッグ開始時のパーツ
  started: boolean; // 実際に動いたか（クリックだけのときは履歴に積まない）
};

// ブロックの番号の表示（spec.md 18.2）。drawn: 参加者を描くか（人数を超える番号は描かない）
export type BlockLabel = { number: number; drawn: boolean };

type Props = {
  previewSvg: string; // プレビューに描画するテンプレート
  area: ViewArea; // 表示範囲（ページ全体、またはブロック 1 つ）
  sampleCount: number; // プレビューに使うダミーの参加者の人数
  items: CanvasItem[];
  blockLabels: Map<string, BlockLabel>; // ブロックの id → 番号
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDragStart: () => void; // ドラッグで最初に動いたとき（元に戻す用に、変更前の状態を記録する）
  onDragChange: (part: CanvasItem) => void; // ドラッグ中の変更（履歴には積まない）
};

export default function EditorCanvas({
  previewSvg,
  area,
  sampleCount,
  items,
  blockLabels,
  selectedId,
  onSelect,
  onDragStart,
  onDragChange,
}: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // ハンドル・線・番号の大きさは表示範囲に合わせる（ページ全体の表示でも見える大きさにする）
  const unit = Math.max(area.width, area.height) / 1130;
  const handleSize = 18 * unit;

  // テンプレートが変わったら、少し待ってからプレビューを描画し直す（ドラッグ中の描画回数を抑える）
  const { x: areaX, y: areaY, width: areaW, height: areaH } = area;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const svg = await renderTemplatePreview(previewSvg, getSampleParticipants(sampleCount), {
          x: areaX,
          y: areaY,
          width: areaW,
          height: areaH,
        });
        if (cancelled || !previewRef.current) return;
        previewRef.current.replaceChildren(svg);
        setRenderError(null);
      } catch (e) {
        if (!cancelled) setRenderError(e instanceof Error ? e.message : String(e));
      }
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewSvg, sampleCount, areaX, areaY, areaW, areaH]);

  // 画面上の座標を表示範囲の座標に変換する
  const toViewPoint = (e: ReactPointerEvent): { x: number; y: number } => {
    const svg = overlayRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // パーツ・ハンドルのドラッグ開始
  const beginDrag = (e: ReactPointerEvent, part: CanvasItem, mode: DragState["mode"], dir: HandleDir | null) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(part.id);
    const p = toViewPoint(e);
    dragRef.current = { mode, dir, pointerId: e.pointerId, startX: p.x, startY: p.y, original: part, started: false };
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = toViewPoint(e);
    // 座標・大きさは整数に丸める
    const dx = Math.round(p.x - drag.startX);
    const dy = Math.round(p.y - drag.startY);
    if (!drag.started) {
      if (dx === 0 && dy === 0) return;
      drag.started = true;
      onDragStart();
    }
    const next =
      drag.mode === "move" ? movePart(drag.original, dx, dy) : resizePart(drag.original, drag.dir as HandleDir, dx, dy);
    onDragChange(next);
  };

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (overlayRef.current?.hasPointerCapture(e.pointerId)) overlayRef.current.releasePointerCapture(e.pointerId);
  };

  const selected = items.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative w-full border border-zinc-400 bg-white shadow"
        style={{ aspectRatio: `${area.width} / ${area.height}` }}
      >
        {/* 描画エンジンによるプレビュー */}
        <div ref={previewRef} className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" />

        {/* 要素の枠と操作用のハンドル */}
        <svg
          ref={overlayRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
          viewBox={`${area.x} ${area.y} ${area.width} ${area.height}`}
          onPointerDown={() => onSelect(null)}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* 後ろのパーツほど前面にあるので、クリックは前面のパーツに当たる */}
          {items.map((part) => {
            const box = boxOf(part);
            const isSelected = part.id === selectedId;
            const label = blockLabels.get(part.id);
            return (
              <g key={part.id}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="transparent"
                  stroke={isSelected ? "#2563eb" : part.kind === "block" ? "#0000ff" : "#64748b"}
                  strokeWidth={(isSelected ? 4 : 2) * unit}
                  strokeDasharray={isSelected ? undefined : `${10 * unit} ${8 * unit}`}
                  className="cursor-move"
                  onPointerDown={(e) => beginDrag(e, part, "move", null)}
                />
                {/* ブロックの番号（spec.md 18.2）。参加者を描かないブロックは「描画なし」 */}
                {label && (
                  <text
                    x={box.x + 8 * unit}
                    y={box.y + 44 * unit}
                    fontSize={40 * unit}
                    fontWeight={700}
                    fill={label.drawn ? "#0000ff" : "#94a3b8"}
                    stroke="#ffffff"
                    strokeWidth={6 * unit}
                    paintOrder="stroke"
                    className="pointer-events-none"
                  >
                    {label.drawn ? label.number : `${label.number}（描画なし）`}
                  </text>
                )}
              </g>
            );
          })}
          {/* 選択中のパーツのハンドル */}
          {selected &&
            HANDLE_DIRS.map((dir) => {
              const p = handlePoint(boxOf(selected), dir);
              const cursor = dir === "n" || dir === "s" ? "ns-resize" : dir === "e" || dir === "w" ? "ew-resize" : dir === "nw" || dir === "se" ? "nwse-resize" : "nesw-resize";
              return (
                <rect
                  key={dir}
                  x={p.x - handleSize / 2}
                  y={p.y - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth={3 * unit}
                  style={{ cursor }}
                  onPointerDown={(e) => beginDrag(e, selected, "resize", dir)}
                />
              );
            })}
        </svg>
      </div>
      {renderError && <p className="text-sm text-red-700">プレビューを描画できませんでした: {renderError}</p>}
    </div>
  );
}
