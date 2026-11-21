"use client";

// プロパティ欄の入力部品（数値・色）
import { useState } from "react";

const inputClass = "w-full rounded border border-zinc-400 px-2 py-1 text-sm";

type NumberFieldProps = {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
};

// 数値の入力欄
// 入力中は打ちかけの文字（空欄や "-" など）を保持し、数値として読めたときだけ反映する
export function NumberField({ label, value, min, onChange }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
      {label}
      <input
        type="number"
        className={inputClass}
        value={draft ?? String(value)}
        min={min}
        onFocus={() => setDraft(String(value))}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Math.round(Number(e.target.value));
          if (e.target.value.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n);
        }}
      />
    </label>
  );
}

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

// #rrggbb 形式か（色の選択ボタンはこの形式だけ扱える）
const HEX6 = /^#[0-9a-fA-F]{6}$/;

// 色の入力欄（色の選択ボタン＋文字での入力。#rrggbbaa なども文字で入力できる）
export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
      {label}
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-zinc-400"
          value={HEX6.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className={inputClass}
          value={draft ?? value}
          onFocus={() => setDraft(value)}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim() !== "") onChange(e.target.value.trim());
          }}
        />
      </div>
    </label>
  );
}
