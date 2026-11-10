"use client";

// CSV エラー・警告・はみ出し警告の表示（spec.md 4章）
import type { LineMessage, OverflowField, OverflowInfo } from "@/lib/types";

// はみ出した項目の表示名
const FIELD_LABELS: Record<OverflowField, string> = {
  name: "名前",
  contact: "連絡先",
  afterword: "あとがき",
};

type Props = {
  errors: LineMessage[];
  warnings: LineMessage[];
  overflows: OverflowInfo[];
};

export default function MessageList({ errors, warnings, overflows }: Props) {
  if (errors.length === 0 && warnings.length === 0 && overflows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {errors.length > 0 && (
        <section className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
          <h3 className="font-bold">CSV エラー（この行は描画していません）</h3>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>
                {e.line} 行目: {e.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      {overflows.length > 0 && (
        <section className="rounded border border-orange-300 bg-orange-50 p-3 text-orange-900">
          <h3 className="font-bold">はみ出し警告（枠に収まらず、文字が切れています）</h3>
          <ul className="mt-1 list-disc pl-5">
            {overflows.map((o, i) => (
              <li key={i}>
                {o.line} 行目「{o.name}」: {FIELD_LABELS[o.field]}が {o.droppedLines} 行切れています
              </li>
            ))}
          </ul>
        </section>
      )}
      {warnings.length > 0 && (
        <section className="rounded border border-yellow-300 bg-yellow-50 p-3 text-yellow-900">
          <h3 className="font-bold">警告</h3>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>
                {w.line} 行目: {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
