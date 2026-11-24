"use client";

// メイン画面の開始位置の入力欄（F-15。spec.md 20.2）
// 1 人目の参加者を、最初のページの何番目のブロックに置くかを入力する
import { useState } from "react";

type Props = {
  value: number; // 確定した開始位置（1 始まり）
  max: number | null; // 上限（実際の 1 ページあたりの人数）。テンプレートを読めていないときは null
  disabled: boolean;
  onChange: (value: number) => void; // 範囲内の整数に丸めた値で呼ぶ
};

export default function StartBlockInput({ value, max, disabled, onChange }: Props) {
  // 入力途中の文字列（確定するまでは描画し直さない）。null のときは確定した値を表示する
  const [draft, setDraft] = useState<string | null>(null);

  // 入力欄から離れたとき・Enter のときに、範囲内の整数に丸めて確定する（spec.md 20.2）
  const commit = () => {
    if (draft === null) return;
    const parsed = Math.round(Number(draft));
    let next = Number.isFinite(parsed) ? Math.max(1, parsed) : value;
    if (max !== null) next = Math.min(max, next);
    setDraft(null);
    if (next !== value) onChange(next);
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      開始位置（1 人目を置くブロックの番号）:
      <input
        type="number"
        className="w-20 rounded border border-zinc-400 px-2 py-1"
        min={1}
        max={max ?? undefined}
        step={1}
        value={draft ?? String(value)}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      {max !== null && <span className="text-zinc-600">（1〜{max}。最初のページだけ、それより前のブロックを空欄にします）</span>}
    </label>
  );
}
