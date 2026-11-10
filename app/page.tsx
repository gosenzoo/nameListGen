"use client";

// あとがきリスト生成の画面（spec.md 4章）
// CSV 選択 → プレビュー → ダウンロード の単一画面
import { useState } from "react";
import FileSelector from "./components/FileSelector";
import MessageList from "./components/MessageList";
import PagePreview from "./components/PagePreview";
import { parseCsvFile } from "@/lib/csv";
import { exportAllPngs, exportPng } from "@/lib/exportPng";
import { paginate } from "@/lib/paginate";
import { renderPages } from "@/lib/render";
import type { ParseResult, RenderedPage } from "@/lib/types";

export default function Home() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV を読み込み、ページ割りと描画まで行う
  const handleSelect = async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    setParseResult(null);
    setPages([]);
    try {
      const result = await parseCsvFile(file);
      setParseResult(result);
      setPages(await renderPages(paginate(result.participants)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // PNG 書き出し（1 ページ／全ページ）。失敗したら画面に表示する
  const runExport = async (task: () => Promise<void>) => {
    setExporting(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const overflows = pages.flatMap((p) => p.overflows);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">あとがきリスト生成</h1>

      {/* ファイル選択 */}
      <div className="flex flex-wrap items-center gap-4">
        <FileSelector disabled={loading || exporting} onSelect={handleSelect} />
        {fileName && <span className="text-sm text-zinc-600">{fileName}</span>}
        {loading && <span className="text-sm">読み込み中…</span>}
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {/* 読み込み結果 */}
      {parseResult && (
        <section className="flex flex-col gap-3">
          <p>
            参加者 {parseResult.participants.length} 人 ／ {pages.length} ページ
          </p>
          <MessageList errors={parseResult.errors} warnings={parseResult.warnings} overflows={overflows} />
        </section>
      )}

      {/* プレビューとダウンロード */}
      {pages.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
              disabled={exporting}
              onClick={() => runExport(() => exportAllPngs(pages))}
            >
              すべて保存
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} />
              ガイド表示（赤: 仕上がり線 ／ 青: 安全領域 ／ 緑: ブロック枠）
            </label>
            {exporting && <span className="text-sm">PNG を作成中…</span>}
          </div>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
            {pages.map((p) => (
              <PagePreview
                key={p.pageNumber}
                pageNumber={p.pageNumber}
                svg={p.svg}
                showGuide={showGuide}
                disabled={exporting}
                onSave={() => runExport(() => exportPng(p.svg, p.pageNumber))}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
