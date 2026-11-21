"use client";

// メイン画面のテンプレート選択欄（F-07。spec.md 4章）
import type { StoredTemplateSummary } from "@/lib/templateStore";

// 選択欄の値。"builtin" は組み込み、それ以外は保存済みテンプレートの id
export const BUILTIN_VALUE = "builtin";

type Props = {
  value: string;
  templates: StoredTemplateSummary[];
  disabled: boolean;
  onChange: (value: string) => void;
};

export default function TemplateSelector({ value, templates, disabled, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm">
      テンプレート:
      <select
        className="rounded border border-zinc-400 px-2 py-1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={BUILTIN_VALUE}>標準（組み込み）</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
