"use client";

// パーツ一覧（追加ボタン・ページ背景色つき。spec.md 14.2）
import type { TemplatePart } from "@/lib/templateModel";
import { partLabel } from "../partLabel";
import { ColorField } from "./Fields";

type Props = {
  parts: TemplatePart[];
  selectedId: string | null;
  pageBackground: string;
  onSelect: (id: string) => void;
  onAdd: (kind: TemplatePart["kind"]) => void;
  onPageBackgroundChange: (color: string) => void;
};

export default function PartList({ parts, selectedId, pageBackground, onSelect, onAdd, onPageBackgroundChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h2 className="mb-1 text-sm font-bold">パーツ（下ほど前面）</h2>
        <ul className="flex flex-col rounded border border-zinc-300 text-sm">
          {parts.length === 0 && <li className="px-2 py-1 text-zinc-500">パーツがありません</li>}
          {parts.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`w-full px-2 py-1 text-left ${p.id === selectedId ? "bg-blue-100 font-bold" : "hover:bg-zinc-100"}`}
                onClick={() => onSelect(p.id)}
              >
                {partLabel(p)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">追加</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" className="rounded border border-zinc-400 px-2 py-1 hover:bg-zinc-100" onClick={() => onAdd("rect")}>
            ＋塗り
          </button>
          <button type="button" className="rounded border border-zinc-400 px-2 py-1 hover:bg-zinc-100" onClick={() => onAdd("text")}>
            ＋テキスト
          </button>
          <button type="button" className="rounded border border-zinc-400 px-2 py-1 hover:bg-zinc-100" onClick={() => onAdd("icon")}>
            ＋アイコン
          </button>
        </div>
      </section>

      <section>
        <ColorField label="ページの背景色" value={pageBackground} onChange={onPageBackgroundChange} />
      </section>
    </div>
  );
}
