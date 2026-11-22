"use client";

// 設定欄（1 ページあたりの参加者数・ブロックの基準サイズ・ページの背景色。spec.md 18.5）
import { blocksOf, ENTRIES_PER_PAGE_MAX, ENTRIES_PER_PAGE_MIN, type TemplateModel } from "@/lib/templateModel";
import { ColorField, NumberField } from "./Fields";

type Props = {
  model: TemplateModel;
  onChange: (model: TemplateModel) => void;
};

export default function SettingsPanel({ model, onChange }: Props) {
  const blockCount = blocksOf(model).length;
  const perPage = model.entriesPerPage;

  // ブロック数と人数が違うときの説明（spec.md 18.4）
  let note: string | null = null;
  if (blockCount === 0) {
    note = "ブロックがないため、参加者を描けません。「ページ」の編集でブロックを追加してください";
  } else if (blockCount < perPage) {
    note = `ブロックが ${blockCount} 個のため、1 ページに描くのは ${blockCount} 人です（残りは次のページに回します）`;
  } else if (blockCount > perPage) {
    const from = perPage + 1;
    note = `ブロックが ${blockCount} 個あり、${from === blockCount ? from : `${from}〜${blockCount}`} 番のブロックには何も描きません`;
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">設定</h2>
      <NumberField
        label={`1 ページあたりの参加者数（${ENTRIES_PER_PAGE_MIN}〜${ENTRIES_PER_PAGE_MAX}）`}
        value={perPage}
        min={ENTRIES_PER_PAGE_MIN}
        onChange={(n) => onChange({ ...model, entriesPerPage: Math.min(ENTRIES_PER_PAGE_MAX, n) })}
      />
      {note && <p className="text-xs text-yellow-800">{note}</p>}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="ブロックの基準幅" value={model.blockWidth} min={1} onChange={(blockWidth) => onChange({ ...model, blockWidth })} />
        <NumberField label="ブロックの基準高さ" value={model.blockHeight} min={1} onChange={(blockHeight) => onChange({ ...model, blockHeight })} />
      </div>
      <p className="text-xs text-zinc-500">基準サイズを変えても、ブロックの中身の配置とページ上のブロックの大きさは変わりません</p>
      <ColorField label="ページの背景色" value={model.pageBackground} onChange={(pageBackground) => onChange({ ...model, pageBackground })} />
    </section>
  );
}
