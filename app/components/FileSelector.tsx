"use client";

// CSV ファイル選択（spec.md 4章）
type Props = {
  disabled: boolean;
  onSelect: (file: File) => void;
};

export default function FileSelector({ disabled, onSelect }: Props) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3">
      <span className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 has-[:disabled]:opacity-50">
        CSV ファイルを選ぶ
        <input
          type="file"
          accept=".csv"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelect(file);
            // 同じファイルを選び直しても読み込めるよう、選択を解除しておく
            e.target.value = "";
          }}
        />
      </span>
    </label>
  );
}
