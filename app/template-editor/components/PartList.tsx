"use client";

// パーツ一覧（追加ボタン・ページ背景色つき。spec.md 14.2）
import { useRef } from "react";
import { IMAGE_ACCEPT } from "@/lib/imageFile";
import type { TemplatePart } from "@/lib/templateModel";
import { partLabel } from "../partLabel";
import { ColorField } from "./Fields";

type Props = {
  parts: TemplatePart[];
  selectedId: string | null;
  pageBackground: string;
  onSelect: (id: string) => void;
  onAdd: (kind: Exclude<TemplatePart["kind"], "image">) => void;
  onAddImage: (file: File) => void; // 「＋画像」で画像ファイルを選んだとき
  onPageBackgroundChange: (color: string) => void;
};

export default function PartList({ parts, selectedId, pageBackground, onSelect, onAdd, onAddImage, onPageBackgroundChange }: Props) {
  // 「＋画像」で開くファイル選択（画像を選んだ時点でパーツを追加する。spec.md 14.3.1）
  const fileRef = useRef<HTMLInputElement>(null);
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
          <button type="button" className="rounded border border-zinc-400 px-2 py-1 hover:bg-zinc-100" onClick={() => fileRef.current?.click()}>
            ＋画像
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
              if (file) onAddImage(file);
            }}
          />
        </div>
      </section>

      <section>
        <ColorField label="ページの背景色" value={pageBackground} onChange={onPageBackgroundChange} />
      </section>
    </div>
  );
}
