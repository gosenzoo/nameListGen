"use client";

// あとがきリスト生成のメイン画面（spec.md 4章）
// CSV 選択 → プレビュー → ダウンロード。テンプレートの選択と、テンプレート編集画面への遷移もここから行う
import Link from "next/link";
import { useEffect, useState } from "react";
import FileSelector from "./components/FileSelector";
import MessageList from "./components/MessageList";
import PagePreview from "./components/PagePreview";
import PsdSizeDialog from "./components/PsdSizeDialog";
import TemplateSelector, { BUILTIN_VALUE } from "./components/TemplateSelector";
import { parseCsvFile } from "@/lib/csv";
import { exportAllPngs, exportPng } from "@/lib/exportPng";
import { countPsdUnsupported, exportAllPsds, exportPsd, type PsdSize } from "@/lib/exportPsd";
import { paginate } from "@/lib/paginate";
import { renderPages } from "@/lib/render";
import {
  isStoreConfigured,
  listTemplates,
  loadTemplateSvg,
  type StoredTemplateSummary,
  type TemplateRef,
} from "@/lib/templateStore";
import type { Page, Participant, ParseResult, RenderedPage } from "@/lib/types";

// 選んだテンプレートを覚えておく localStorage のキー
const TEMPLATE_STORAGE_KEY = "nameListGen.templateId";

// localStorage の読み書き（使えない環境でも動くよう、失敗は無視する）
function readSavedTemplate(): string {
  try {
    return localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? BUILTIN_VALUE;
  } catch {
    return BUILTIN_VALUE;
  }
}
function writeSavedTemplate(value: string) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, value);
  } catch {
    // 保存できなくても選択自体は使える
  }
}

export default function Home() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  // 作成中の表示（「PNG を作成中…」「PSD を作成中…（2 / 5 ページ）」など）
  const [exportStatus, setExportStatus] = useState("");
  // PSD 書き出し用に、描画に使ったテンプレートとページ割りを覚えておく（F-11）
  const [renderedTemplate, setRenderedTemplate] = useState("");
  const [pageData, setPageData] = useState<Page[]>([]);
  // PSD のキャンバスサイズの入力ダイアログ（target: 保存するページ番号。"all" はすべて）
  const [psdTarget, setPsdTarget] = useState<number | "all" | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // テンプレートの選択（F-07）
  const [templateValue, setTemplateValue] = useState(BUILTIN_VALUE);
  const [templates, setTemplates] = useState<StoredTemplateSummary[]>([]);
  const [storeMessage, setStoreMessage] = useState<string | null>(null);

  // 保存済みテンプレートの一覧を取得し、前回選んだテンプレートを復元する
  useEffect(() => {
    (async () => {
      const saved = readSavedTemplate();
      if (!isStoreConfigured()) {
        setStoreMessage("Supabase の接続情報が未設定のため、標準（組み込み）のテンプレートだけを使えます");
        return;
      }
      try {
        const list = await listTemplates();
        setTemplates(list);
        // 前回のテンプレートが削除されていたら組み込みに戻す
        setTemplateValue(list.some((t) => t.id === saved) ? saved : BUILTIN_VALUE);
      } catch (e) {
        setStoreMessage(
          `Supabase に接続できなかったため、標準（組み込み）のテンプレートだけを使えます（${e instanceof Error ? e.message : String(e)}）`,
        );
      }
    })();
  }, []);

  // 選択欄の値をテンプレートの参照に変換する
  const toTemplateRef = (value: string): TemplateRef => {
    const found = templates.find((t) => t.id === value);
    return found ? { kind: "stored", id: found.id, name: found.name } : { kind: "builtin" };
  };

  // 参加者をページ割りし、テンプレートで描画する
  const render = async (participants: Participant[], value: string) => {
    const templateSvg = await loadTemplateSvg(toTemplateRef(value));
    const paged = paginate(participants);
    setPages(await renderPages(paged, templateSvg));
    setRenderedTemplate(templateSvg);
    setPageData(paged);
  };

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
      await render(result.participants, templateValue);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // テンプレートを選び直したら、読み込み済みの CSV を描画し直す
  const handleTemplateChange = async (value: string) => {
    setTemplateValue(value);
    writeSavedTemplate(value);
    if (!parseResult) return;
    setLoading(true);
    setError(null);
    try {
      await render(parseResult.participants, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // PNG・PSD 書き出し（1 ページ／全ページ）。失敗したら画面に表示する
  const runExport = async (status: string, task: () => Promise<void>) => {
    setExporting(true);
    setExportStatus(status);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
      setExportStatus("");
    }
  };

  // キャンバスサイズが決まったら PSD を作る（F-11。spec.md 17章）
  const handlePsdSave = (size: PsdSize) => {
    const target = psdTarget;
    setPsdTarget(null);
    if (target === "all") {
      void runExport("PSD を作成中…", () =>
        exportAllPsds(renderedTemplate, pageData, size, (done, total) =>
          setExportStatus(`PSD を作成中…（${done} / ${total} ページ）`),
        ),
      );
    } else if (target !== null) {
      const page = pageData.find((p) => p.pageNumber === target);
      if (page) void runExport("PSD を作成中…", () => exportPsd(renderedTemplate, page, size));
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

      {/* テンプレート編集画面への遷移と、PNG 生成に使うテンプレートの選択 */}
      <div className="flex flex-col items-start gap-3">
        <Link
          href="/template-editor"
          className="rounded border border-blue-600 px-4 py-2 text-blue-700 hover:bg-blue-50"
        >
          テンプレート編集
        </Link>
        <TemplateSelector
          value={templateValue}
          templates={templates}
          disabled={loading || exporting}
          onChange={handleTemplateChange}
        />
        {storeMessage && <p className="text-sm text-zinc-600">{storeMessage}</p>}
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
              onClick={() => runExport("PNG を作成中…", () => exportAllPngs(pages))}
            >
              すべて保存
            </button>
            <button
              type="button"
              className="rounded border border-green-600 px-4 py-2 text-green-700 hover:bg-green-50 disabled:opacity-50"
              disabled={exporting}
              onClick={() => setPsdTarget("all")}
            >
              すべて PSD で保存
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} />
              ガイド表示（赤: 仕上がり線 ／ 青: 安全領域 ／ 緑: ブロック枠）
            </label>
            {exporting && <span className="text-sm">{exportStatus}</span>}
          </div>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
            {pages.map((p) => (
              <PagePreview
                key={p.pageNumber}
                pageNumber={p.pageNumber}
                svg={p.svg}
                showGuide={showGuide}
                disabled={exporting}
                onSave={() => runExport("PNG を作成中…", () => exportPng(p.svg, p.pageNumber))}
                onSavePsd={() => setPsdTarget(p.pageNumber)}
              />
            ))}
          </div>
        </section>
      )}

      {psdTarget !== null && (
        <PsdSizeDialog
          title={psdTarget === "all" ? "すべてのページを PSD で保存" : `${psdTarget} ページを PSD で保存`}
          unsupported={countPsdUnsupported(renderedTemplate)}
          onSave={handlePsdSave}
          onCancel={() => setPsdTarget(null)}
        />
      )}
    </main>
  );
}
