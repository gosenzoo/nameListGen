"use client";

// 1 ページ分のプレビュー（ガイド表示・保存ボタンつき。spec.md 4章）
import { useEffect, useRef } from "react";
// ガイドの位置（spec.md 6章・7.1）。寸法は lib/layout.ts にまとめてある
import {
  BLOCK_HEIGHT as BLOCK_H,
  BLOCK_WIDTH as BLOCK_W,
  BLOCK_XS,
  BLOCK_YS,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  SAFE, // 安全領域
  TRIM, // 仕上がり線（塗り足し 3mm）
} from "@/lib/layout";

type Props = {
  pageNumber: number;
  svg: SVGSVGElement;
  showGuide: boolean;
  disabled: boolean;
  onSave: () => void;
};

export default function PagePreview({ pageNumber, svg, showGuide, disabled, onSave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 描画済みの <svg> 要素をそのまま表示領域に入れる（PNG 書き出しでも同じ要素を使う）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren(svg);
    return () => {
      container.replaceChildren();
    };
  }, [svg]);

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative border border-zinc-300 shadow">
        {/* 表示サイズは CSS で縮小する（<svg> 要素自体の属性は PNG 書き出し用にそのまま残す） */}
        <div ref={containerRef} className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" />
        {showGuide && (
          // ガイドは表示専用の別レイヤー（PNG には含めない）
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
          >
            <rect
              x={TRIM}
              y={TRIM}
              width={PAGE_WIDTH - TRIM * 2}
              height={PAGE_HEIGHT - TRIM * 2}
              fill="none"
              stroke="#ef4444"
              strokeWidth={6}
            />
            <rect
              x={SAFE}
              y={SAFE}
              width={PAGE_WIDTH - SAFE * 2}
              height={PAGE_HEIGHT - SAFE * 2}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={4}
              strokeDasharray="24 16"
            />
            {BLOCK_YS.flatMap((y) =>
              BLOCK_XS.map((x) => (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width={BLOCK_W}
                  height={BLOCK_H}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={4}
                />
              )),
            )}
          </svg>
        )}
      </div>
      <figcaption className="flex items-center justify-between text-sm">
        <span>{pageNumber} ページ</span>
        <button
          type="button"
          className="rounded border border-zinc-400 px-3 py-1 hover:bg-zinc-100 disabled:opacity-50"
          disabled={disabled}
          onClick={onSave}
        >
          保存
        </button>
      </figcaption>
    </figure>
  );
}
