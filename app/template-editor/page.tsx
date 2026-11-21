"use client";

// テンプレート編集画面（F-08・F-09。spec.md 14章）
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import EditorCanvas from "./components/EditorCanvas";
import { ConfirmDialog, SaveDialog } from "./components/Dialog";
import PartList from "./components/PartList";
import PropertyPanel from "./components/PropertyPanel";
import {
  buildTemplateSvg,
  createPart,
  parseTemplate,
  type TemplateModel,
  type TemplatePart,
} from "@/lib/templateModel";
import {
  deleteTemplate,
  findTemplateByName,
  insertTemplate,
  isStoreConfigured,
  listTemplates,
  loadTemplateSvg,
  updateTemplate,
  type StoredTemplateSummary,
  type TemplateRef,
} from "@/lib/templateStore";

// 元に戻せる操作の数（spec.md 14.4）
const HISTORY_LIMIT = 50;

// 「開く」の選択欄で組み込みを表す値
const BUILTIN_VALUE = "builtin";

// 画面内の確認ダイアログの内容
type ConfirmState = {
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

// エラーを画面に出す文言にする
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function TemplateEditorPage() {
  const router = useRouter();
  const storeConfigured = isStoreConfigured();

  // 編集中のテンプレート
  const [model, setModel] = useState<TemplateModel | null>(null);
  const [currentRef, setCurrentRef] = useState<TemplateRef>({ kind: "builtin" });
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 元に戻す／やり直しの履歴
  const [past, setPast] = useState<TemplateModel[]>([]);
  const [future, setFuture] = useState<TemplateModel[]>([]);

  // 保存済みテンプレートの一覧と「開く」の選択
  const [templates, setTemplates] = useState<StoredTemplateSummary[]>([]);
  const [openValue, setOpenValue] = useState(BUILTIN_VALUE);

  // 表示・ダイアログ
  const [showFullPage, setShowFullPage] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // テンプレートの SVG（プレビュー・保存に使う）
  const templateSvg = useMemo(() => (model ? buildTemplateSvg(model) : ""), [model]);

  // 保存済みテンプレートの一覧を取り直す
  const refreshTemplates = useCallback(async () => {
    if (!storeConfigured) return;
    try {
      setTemplates(await listTemplates());
    } catch (e) {
      setError(messageOf(e));
    }
  }, [storeConfigured]);

  // テンプレートを開く（編集中の内容は置き換わる）
  const openTemplate = useCallback(async (ref: TemplateRef) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { model: loaded, unsupported } = parseTemplate(await loadTemplateSvg(ref));
      setModel(loaded);
      setCurrentRef(ref);
      setOpenValue(ref.kind === "builtin" ? BUILTIN_VALUE : ref.id);
      setDirty(false);
      setSelectedId(null);
      setPast([]);
      setFuture([]);
      setWarning(
        unsupported > 0
          ? `編集画面で扱えない要素が ${unsupported} 個あり、保存すると失われます`
          : null,
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // 最初は組み込みのテンプレートを開き、保存済みの一覧を取得する
  useEffect(() => {
    (async () => {
      await openTemplate({ kind: "builtin" });
      await refreshTemplates();
    })();
  }, [openTemplate, refreshTemplates]);

  // ---- 編集操作 ----

  // 変更を反映する（record: 元に戻す用に変更前の状態を記録するか）
  const applyModel = useCallback(
    (next: TemplateModel, record = true) => {
      if (!model) return;
      if (record) {
        setPast((p) => [...p, model].slice(-HISTORY_LIMIT));
        setFuture([]);
      }
      setModel(next);
      setDirty(true);
    },
    [model],
  );

  // 1 パーツを置き換える
  const replacePart = useCallback(
    (part: TemplatePart, record = true) => {
      if (!model) return;
      applyModel({ ...model, parts: model.parts.map((p) => (p.id === part.id ? part : p)) }, record);
    },
    [model, applyModel],
  );

  // ドラッグ開始時に、変更前の状態を記録する
  const recordSnapshot = useCallback(() => {
    if (!model) return;
    setPast((p) => [...p, model].slice(-HISTORY_LIMIT));
    setFuture([]);
  }, [model]);

  const undo = useCallback(() => {
    if (!model || past.length === 0) return;
    setFuture((f) => [model, ...f]);
    setModel(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setDirty(true);
  }, [model, past]);

  const redo = useCallback(() => {
    if (!model || future.length === 0) return;
    setPast((p) => [...p, model].slice(-HISTORY_LIMIT));
    setModel(future[0]);
    setFuture((f) => f.slice(1));
    setDirty(true);
  }, [model, future]);

  const selectedIndex = model ? model.parts.findIndex((p) => p.id === selectedId) : -1;
  const selectedPart = model && selectedIndex >= 0 ? model.parts[selectedIndex] : null;

  // 重なり順を 1 つ動かす（offset: +1 で前面へ、-1 で背面へ）
  const movePartOrder = (offset: number) => {
    if (!model || selectedIndex < 0) return;
    const to = selectedIndex + offset;
    if (to < 0 || to >= model.parts.length) return;
    const parts = [...model.parts];
    const [part] = parts.splice(selectedIndex, 1);
    parts.splice(to, 0, part);
    applyModel({ ...model, parts });
  };

  // キーボード操作（矢印キーで移動、Ctrl+Z / Ctrl+Y で元に戻す／やり直し）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 入力欄の操作中やダイアログ表示中は何もしない
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (confirm || saveOpen) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (selectedPart && delta[e.key] && !showFullPage) {
        e.preventDefault();
        const [dx, dy] = delta[e.key];
        replacePart({ ...selectedPart, x: selectedPart.x + dx, y: selectedPart.y + dy });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirm, saveOpen, undo, redo, selectedPart, replacePart, showFullPage]);

  // ---- 開く・保存・削除・戻る ----

  // 未保存の変更があれば確認してから実行する
  const guardUnsaved = (action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    setConfirm({
      message: "保存していない変更があります。破棄してよいですか？",
      confirmLabel: "破棄する",
      danger: true,
      onConfirm: () => {
        setConfirm(null);
        action();
      },
    });
  };

  const handleOpen = () => {
    const found = templates.find((t) => t.id === openValue);
    const ref: TemplateRef = found ? { kind: "stored", id: found.id, name: found.name } : { kind: "builtin" };
    guardUnsaved(() => void openTemplate(ref));
  };

  const handleBack = () => guardUnsaved(() => router.push("/"));

  // 保存後の状態にする
  const afterSaved = async (saved: StoredTemplateSummary) => {
    setCurrentRef({ kind: "stored", id: saved.id, name: saved.name });
    setOpenValue(saved.id);
    setDirty(false);
    setSaveOpen(false);
    setNotice(`「${saved.name}」を保存しました`);
    await refreshTemplates();
  };

  // 保存ダイアログで名前が決まったとき。同じ名前があれば上書きを確認する
  const handleSave = async (name: string) => {
    if (!model) return;
    setBusy(true);
    setError(null);
    try {
      const existing = await findTemplateByName(name);
      if (existing) {
        setConfirm({
          message: `「${name}」はすでにあります。上書きしますか？`,
          confirmLabel: "上書き",
          onConfirm: async () => {
            setConfirm(null);
            setBusy(true);
            try {
              await afterSaved(await updateTemplate(existing.id, templateSvg));
            } catch (e) {
              setError(messageOf(e));
            } finally {
              setBusy(false);
            }
          },
        });
        return;
      }
      await afterSaved(await insertTemplate(name, templateSvg));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  // 今開いている保存済みテンプレートを削除する
  const handleDelete = () => {
    if (currentRef.kind !== "stored") return;
    const target = currentRef;
    setConfirm({
      message: `「${target.name}」を削除します。元に戻せません。よろしいですか？`,
      confirmLabel: "削除する",
      danger: true,
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        setError(null);
        try {
          await deleteTemplate(target.id);
          await refreshTemplates();
          await openTemplate({ kind: "builtin" });
          setNotice(`「${target.name}」を削除しました`);
        } catch (e) {
          setError(messageOf(e));
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const currentName = currentRef.kind === "builtin" ? "標準（組み込み）" : currentRef.name;

  return (
    <main className="flex w-full flex-col gap-4 p-4">
      {/* 上部のバー */}
      <header className="flex flex-col gap-3 border-b border-zinc-300 pb-3">
        <div className="flex items-center gap-4">
          <button type="button" className="rounded border border-zinc-400 px-3 py-1 text-sm hover:bg-zinc-100" onClick={handleBack}>
            ← メイン画面へ
          </button>
          <h1 className="text-xl font-bold">テンプレート編集</h1>
          <span className="text-sm text-zinc-600">
            編集中: {currentName}
            {dirty && "（未保存の変更あり）"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            開く:
            <select
              className="rounded border border-zinc-400 px-2 py-1"
              value={openValue}
              onChange={(e) => setOpenValue(e.target.value)}
              disabled={busy}
            >
              <option value={BUILTIN_VALUE}>標準（組み込み）</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="rounded border border-zinc-400 px-3 py-1 hover:bg-zinc-100 disabled:opacity-50" disabled={busy} onClick={handleOpen}>
            開く
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={busy || !model || !storeConfigured}
            onClick={() => setSaveOpen(true)}
          >
            保存…
          </button>
          <button
            type="button"
            className="rounded border border-red-400 px-3 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
            disabled={busy || currentRef.kind !== "stored" || !storeConfigured}
            onClick={handleDelete}
          >
            削除
          </button>
          <button type="button" className="rounded border border-zinc-400 px-3 py-1 hover:bg-zinc-100 disabled:opacity-50" disabled={past.length === 0} onClick={undo}>
            元に戻す
          </button>
          <button type="button" className="rounded border border-zinc-400 px-3 py-1 hover:bg-zinc-100 disabled:opacity-50" disabled={future.length === 0} onClick={redo}>
            やり直し
          </button>
          {busy && <span>処理中…</span>}
        </div>
        {!storeConfigured && (
          <p className="text-sm text-zinc-600">
            Supabase の接続情報（.env.local）が未設定のため、保存・削除と保存済みテンプレートの読み込みは使えません
          </p>
        )}
        {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        {warning && <p className="rounded border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-900">{warning}</p>}
        {notice && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{notice}</p>}
      </header>

      {model && (
        <div className="grid grid-cols-[220px_minmax(0,1fr)_260px] gap-4">
          {/* パーツ一覧 */}
          <PartList
            parts={model.parts}
            selectedId={selectedId}
            pageBackground={model.pageBackground}
            onSelect={setSelectedId}
            onAdd={(kind) => {
              const part = createPart(kind);
              applyModel({ ...model, parts: [...model.parts, part] });
              setSelectedId(part.id);
            }}
            onPageBackgroundChange={(pageBackground) => applyModel({ ...model, pageBackground })}
          />

          {/* キャンバス */}
          <div className="flex flex-col gap-2">
            <EditorCanvas
              templateSvg={templateSvg}
              parts={model.parts}
              selectedId={selectedId}
              showFullPage={showFullPage}
              onSelect={setSelectedId}
              onDragStart={recordSnapshot}
              onDragChange={(part) => replacePart(part, false)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showFullPage} onChange={(e) => setShowFullPage(e.target.checked)} />
              ページ全体を表示（表示のみ。操作はブロック 1 つの表示で行います）
            </label>
            <p className="text-xs text-zinc-500">
              ドラッグで移動、四隅と辺のハンドルで大きさを変更。矢印キーで 1px（Shift で 10px）移動。Ctrl+Z で元に戻す、Ctrl+Y でやり直し。
            </p>
          </div>

          {/* プロパティ欄 */}
          <PropertyPanel
            part={selectedPart}
            canMoveForward={selectedIndex >= 0 && selectedIndex < model.parts.length - 1}
            canMoveBackward={selectedIndex > 0}
            onChange={(part) => replacePart(part)}
            onMoveForward={() => movePartOrder(1)}
            onMoveBackward={() => movePartOrder(-1)}
            onDelete={() => {
              applyModel({ ...model, parts: model.parts.filter((p) => p.id !== selectedId) });
              setSelectedId(null);
            }}
          />
        </div>
      )}

      {saveOpen && (
        <SaveDialog
          initialName={currentRef.kind === "stored" ? currentRef.name : ""}
          busy={busy}
          onSave={handleSave}
          onCancel={() => setSaveOpen(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </main>
  );
}
