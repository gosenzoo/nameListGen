"use client";

// 編集画面の確認ダイアログと保存ダイアログ（spec.md 14.2・14.5）
// ブラウザの confirm / prompt は使わず、画面内に表示する
import { useState, type ReactNode } from "react";

// 画面全体を覆う背景と、中央の枠
function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex w-[420px] max-w-[90vw] flex-col gap-4 rounded bg-white p-5 shadow-lg">{children}</div>
    </div>
  );
}

type ConfirmProps = {
  message: string;
  confirmLabel: string;
  danger?: boolean; // 削除など、取り消せない操作のときは赤いボタンにする
  onConfirm: () => void;
  onCancel: () => void;
};

// 確認ダイアログ
export function ConfirmDialog({ message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal>
      <p className="whitespace-pre-wrap">{message}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded border border-zinc-400 px-3 py-1 hover:bg-zinc-100" onClick={onCancel}>
          キャンセル
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// テンプレート名の長さの上限（spec.md 14.5）
export const TEMPLATE_NAME_MAX = 50;

type SaveProps = {
  initialName: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
};

// 保存ダイアログ（名前を入力する）
export function SaveDialog({ initialName, busy, onSave, onCancel }: SaveProps) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= TEMPLATE_NAME_MAX;

  return (
    <Modal>
      <h2 className="font-bold">テンプレートを保存</h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onSave(trimmed);
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          名前（1〜{TEMPLATE_NAME_MAX} 文字）
          <input
            autoFocus
            className="rounded border border-zinc-400 px-2 py-1"
            value={name}
            maxLength={TEMPLATE_NAME_MAX + 20}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {trimmed.length > TEMPLATE_NAME_MAX && (
          <p className="text-sm text-red-700">名前は {TEMPLATE_NAME_MAX} 文字以内にしてください</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-zinc-400 px-3 py-1 hover:bg-zinc-100" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!valid || busy}
          >
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}
