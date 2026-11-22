"use client";

// パーツ一覧（追加ボタンつき。spec.md 14.2・18.6）
// 「ページ」の編集ではページ上の要素、「ブロックの中身」の編集ではブロックの中のパーツを並べる
import { useRef } from "react";
import { IMAGE_ACCEPT } from "@/lib/imageFile";

// 一覧の 1 行（表示名は呼び出し側で決める。ブロックの番号は並び順で変わるため）
export type PartListEntry = { id: string; label: string };

// 追加ボタン（画像以外）
export type AddButton = { label: string; onClick: () => void };

type Props = {
  entries: PartListEntry[];
  selectedId: string | null;
  addButtons: AddButton[];
  onSelect: (id: string) => void;
  onAddImage: (file: File) => void; // 「＋画像」で画像ファイルを選んだとき
};

export default function PartList({ entries, selectedId, addButtons, onSelect, onAddImage }: Props) {
  // 「＋画像」で開くファイル選択（画像を選んだ時点でパーツを追加する。spec.md 14.3.1）
  const fileRef = useRef<HTMLInputElement>(null);
  const buttonClass = "rounded border border-zinc-400 px-2 py-1 hover:bg-zinc-100";

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h2 className="mb-1 text-sm font-bold">パーツ（下ほど前面）</h2>
        <ul className="flex flex-col rounded border border-zinc-300 text-sm">
          {entries.length === 0 && <li className="px-2 py-1 text-zinc-500">パーツがありません</li>}
          {entries.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`w-full px-2 py-1 text-left ${p.id === selectedId ? "bg-blue-100 font-bold" : "hover:bg-zinc-100"}`}
                onClick={() => onSelect(p.id)}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">追加</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {addButtons.map((b) => (
            <button key={b.label} type="button" className={buttonClass} onClick={b.onClick}>
              {b.label}
            </button>
          ))}
          <button type="button" className={buttonClass} onClick={() => fileRef.current?.click()}>
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
    </div>
  );
}
