"use client";

// キャンバス（spec.md 14.2・14.4）
// 描画エンジンで実際に描画したブロックの上に、パーツの枠と操作用のハンドルを重ねる
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BLOCK_HEIGHT, BLOCK_ORIGINS, BLOCK_WIDTH, PAGE_HEIGHT, PAGE_WIDTH } from "@/lib/layout";
import { renderTemplatePreview } from "@/lib/render";
import { getSampleParticipants } from "@/lib/sampleData";
import type { TemplatePart } from "@/lib/templateModel";

// 大きさ変更のハンドルの向き
type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLE_DIRS: HandleDir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

// ハンドルの大きさ（ブロック座標）
const HANDLE_SIZE = 18;

// パーツの外枠（ブロック内の座標）
type Box = { x: number; y: number; width: number; height: number };
function boxOf(part: TemplatePart): Box {
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
function movePart(part: TemplatePart, dx: number, dy: number): TemplatePart {
  return { ...part, x: part.x + dx, y: part.y + dy };
}

// ハンドルのドラッグ量（dx, dy）で大きさを変えたパーツを返す
function resizePart(part: TemplatePart, dir: HandleDir, dx: number, dy: number): TemplatePart {
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
  original: TemplatePart; // ドラッグ開始時のパーツ
  started: boolean; // 実際に動いたか（クリックだけのときは履歴に積まない）
};

type Props = {
  templateSvg: string;
  parts: TemplatePart[];
  selectedId: string | null;
  showFullPage: boolean;
  onSelect: (id: string | null) => void;
  onDragStart: () => void; // ドラッグで最初に動いたとき（元に戻す用に、変更前の状態を記録する）
  onDragChange: (part: TemplatePart) => void; // ドラッグ中の変更（履歴には積まない）
};

export default function EditorCanvas({
  templateSvg,
  parts,
  selectedId,
  showFullPage,
  onSelect,
  onDragStart,
  onDragChange,
}: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // テンプレートが変わったら、少し待ってからプレビューを描画し直す（ドラッグ中の描画回数を抑える）
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // ブロック 1 つの拡大表示のときは、左上のブロックの範囲だけを表示する
        const area = showFullPage
          ? undefined
          : { x: BLOCK_ORIGINS[0].x, y: BLOCK_ORIGINS[0].y, width: BLOCK_WIDTH, height: BLOCK_HEIGHT };
        const svg = await renderTemplatePreview(templateSvg, getSampleParticipants(), area);
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
  }, [templateSvg, showFullPage]);

  // 画面上の座標をブロック内の座標に変換する
  const toBlockPoint = (e: ReactPointerEvent): { x: number; y: number } => {
    const svg = overlayRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // パーツ・ハンドルのドラッグ開始
  const beginDrag = (e: ReactPointerEvent, part: TemplatePart, mode: DragState["mode"], dir: HandleDir | null) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(part.id);
    const p = toBlockPoint(e);
    dragRef.current = { mode, dir, pointerId: e.pointerId, startX: p.x, startY: p.y, original: part, started: false };
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = toBlockPoint(e);
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

  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const viewWidth = showFullPage ? PAGE_WIDTH : BLOCK_WIDTH;
  const viewHeight = showFullPage ? PAGE_HEIGHT : BLOCK_HEIGHT;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative w-full border border-zinc-400 bg-white shadow"
        style={{ aspectRatio: `${viewWidth} / ${viewHeight}` }}
      >
        {/* 描画エンジンによるプレビュー */}
        <div ref={previewRef} className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" />

        {/* パーツの枠と操作用のハンドル（ページ全体の表示中は操作しない） */}
        {!showFullPage && (
          <svg
            ref={overlayRef}
            className="absolute inset-0 h-full w-full touch-none select-none"
            viewBox={`0 0 ${BLOCK_WIDTH} ${BLOCK_HEIGHT}`}
            onPointerDown={() => onSelect(null)}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* 後ろのパーツほど前面にあるので、クリックは前面のパーツに当たる */}
            {parts.map((part) => {
              const box = boxOf(part);
              const isSelected = part.id === selectedId;
              return (
                <rect
                  key={part.id}
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="transparent"
                  stroke={isSelected ? "#2563eb" : "#64748b"}
                  strokeWidth={isSelected ? 4 : 2}
                  strokeDasharray={isSelected ? undefined : "10 8"}
                  className="cursor-move"
                  onPointerDown={(e) => beginDrag(e, part, "move", null)}
                />
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
                    x={p.x - HANDLE_SIZE / 2}
                    y={p.y - HANDLE_SIZE / 2}
                    width={HANDLE_SIZE}
                    height={HANDLE_SIZE}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={3}
                    style={{ cursor }}
                    onPointerDown={(e) => beginDrag(e, selected, "resize", dir)}
                  />
                );
              })}
          </svg>
        )}
      </div>
      {renderError && <p className="text-sm text-red-700">プレビューを描画できませんでした: {renderError}</p>}
    </div>
  );
}
