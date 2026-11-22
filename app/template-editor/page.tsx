"use client";

// テンプレート編集画面（F-08・F-09・F-13。spec.md 14章・18章）
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import EditorCanvas, { type BlockLabel, type CanvasItem } from "./components/EditorCanvas";
import { ConfirmDialog, SaveDialog } from "./components/Dialog";
import PartList, { type AddButton } from "./components/PartList";
import PropertyPanel from "./components/PropertyPanel";
import SettingsPanel from "./components/SettingsPanel";
import { partLabel } from "./partLabel";
import { PAGE_HEIGHT, PAGE_WIDTH } from "@/lib/layout";
import {
  buildTemplateSvg,
  createImagePart,
  createPageItem,
  createPart,
  parseTemplate,
  type PageItem,
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
import { loadImageFile } from "@/lib/imageFile";

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

  // 編集する範囲（「ページ」か「ブロックの中身」か。spec.md 18.6）
  const [editMode, setEditMode] = useState<"page" | "block">("page");
  // ダイアログ
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

  // 編集中の範囲の要素（「ページ」ならページ上の要素、「ブロックの中身」ならブロックの中のパーツ）
  const items: CanvasItem[] = useMemo(
    () => (model ? (editMode === "page" ? model.pageItems : model.parts) : []),
    [model, editMode],
  );

  // 編集中の範囲の要素を置き換えたモデルを返す
  const withItems = useCallback(
    (base: TemplateModel, next: CanvasItem[]): TemplateModel =>
      editMode === "page" ? { ...base, pageItems: next as PageItem[] } : { ...base, parts: next as TemplatePart[] },
    [editMode],
  );

  // 1 パーツを置き換える
  const replacePart = useCallback(
    (part: CanvasItem, record = true) => {
      if (!model) return;
      applyModel(withItems(model, items.map((p) => (p.id === part.id ? part : p))), record);
    },
    [model, items, withItems, applyModel],
  );

  // 編集中の範囲の最後（最前面）にパーツを追加して選ぶ
  const addItem = (part: CanvasItem) => {
    if (!model) return;
    applyModel(withItems(model, [...items, part]));
    setSelectedId(part.id);
  };

  // ブロックの番号（ページ上の要素のうちブロックだけを描画順に数える。spec.md 18.2）
  const blockLabels = useMemo(() => {
    const labels = new Map<string, BlockLabel>();
    if (!model) return labels;
    let n = 0;
    for (const item of model.pageItems) {
      if (item.kind !== "block") continue;
      n += 1;
      labels.set(item.id, { number: n, drawn: n <= model.entriesPerPage });
    }
    return labels;
  }, [model]);

  // パーツ一覧・プロパティ欄の表示名（ブロックは番号つき。spec.md 18.6）
  const labelOf = (part: CanvasItem): string => {
    const label = blockLabels.get(part.id);
    if (part.kind === "block" && label) return `ブロック ${label.number}${label.drawn ? "" : "（描画なし）"}`;
    return partLabel(part);
  };

  // キャンバスに描くテンプレートと表示範囲
  // 「ブロックの中身」では、基準サイズのブロック 1 つだけを (0, 0) に置いたテンプレートで描く
  const canvasView = useMemo(() => {
    if (!model) return null;
    if (editMode === "page") {
      return {
        previewSvg: templateSvg,
        area: { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT },
        sampleCount: model.entriesPerPage,
      };
    }
    const single: TemplateModel = {
      ...model,
      entriesPerPage: 1,
      pageItems: [{ id: "preview", kind: "block", x: 0, y: 0, width: model.blockWidth, height: model.blockHeight, keepAspect: true }],
    };
    return {
      previewSvg: buildTemplateSvg(single),
      area: { x: 0, y: 0, width: model.blockWidth, height: model.blockHeight },
      sampleCount: 1,
    };
  }, [model, editMode, templateSvg]);

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

  // 選択中のパーツ（編集中の範囲の中で探す）
  const selectedIndex = items.findIndex((p) => p.id === selectedId);
  const selectedPart = selectedIndex >= 0 ? items[selectedIndex] : null;

  // 「＋画像」で選んだ画像ファイルからパーツを追加する（spec.md 14.3.1）
  const addImage = async (file: File) => {
    if (!model) return;
    setError(null);
    try {
      addItem(createImagePart(await loadImageFile(file)));
    } catch (e) {
      setError(messageOf(e));
    }
  };

  // 選択中の画像（固定）を差し替える。位置と「縦横比を保つ」はそのまま、大きさは新しい画像の元の大きさにする
  const replaceImage = async (file: File) => {
    if (!selectedPart || selectedPart.kind !== "image") return;
    setError(null);
    try {
      const { href, width, height } = await loadImageFile(file);
      replacePart({ ...selectedPart, href, width, height });
    } catch (e) {
      setError(messageOf(e));
    }
  };

  // 重なり順を 1 つ動かす（offset: +1 で前面へ、-1 で背面へ）
  const movePartOrder = (offset: number) => {
    if (!model || selectedIndex < 0) return;
    const to = selectedIndex + offset;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [part] = next.splice(selectedIndex, 1);
    next.splice(to, 0, part);
    applyModel(withItems(model, next));
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
      if (selectedPart && delta[e.key]) {
        e.preventDefault();
        const [dx, dy] = delta[e.key];
        replacePart({ ...selectedPart, x: selectedPart.x + dx, y: selectedPart.y + dy });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirm, saveOpen, undo, redo, selectedPart, replacePart]);

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

      {model && canvasView && (
        <div className="grid grid-cols-[240px_minmax(0,1fr)_260px] gap-4">
          <div className="flex flex-col gap-4">
            {/* 編集する範囲の切り替え（spec.md 18.6） */}
            <section className="flex flex-col gap-1 text-sm">
              <h2 className="font-bold">編集する範囲</h2>
              {(
                [
                  ["page", "ページ"],
                  ["block", "ブロックの中身"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="editMode"
                    checked={editMode === value}
                    onChange={() => {
                      setEditMode(value);
                      setSelectedId(null);
                    }}
                  />
                  {label}
                </label>
              ))}
            </section>

            {/* パーツ一覧 */}
            <PartList
              entries={items.map((p) => ({ id: p.id, label: labelOf(p) }))}
              selectedId={selectedId}
              addButtons={
                editMode === "page"
                  ? ([
                      { label: "＋ブロック", onClick: () => addItem(createPageItem("block", model)) },
                      { label: "＋塗り", onClick: () => addItem(createPageItem("rect", model)) },
                      { label: "＋テキスト", onClick: () => addItem(createPageItem("text", model)) },
                    ] satisfies AddButton[])
                  : ([
                      { label: "＋塗り", onClick: () => addItem(createPart("rect")) },
                      { label: "＋テキスト", onClick: () => addItem(createPart("text")) },
                      { label: "＋アイコン", onClick: () => addItem(createPart("icon")) },
                    ] satisfies AddButton[])
              }
              onSelect={setSelectedId}
              onAddImage={(file) => void addImage(file)}
            />

            {/* 設定欄（spec.md 18.5） */}
            <SettingsPanel model={model} onChange={(next) => applyModel(next)} />
          </div>

          {/* キャンバス */}
          <div className="flex flex-col gap-2">
            <EditorCanvas
              previewSvg={canvasView.previewSvg}
              area={canvasView.area}
              sampleCount={canvasView.sampleCount}
              items={items}
              blockLabels={editMode === "page" ? blockLabels : new Map()}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDragStart={recordSnapshot}
              onDragChange={(part) => replacePart(part, false)}
            />
            <p className="text-xs text-zinc-500">
              ドラッグで移動、四隅と辺のハンドルで大きさを変更。矢印キーで 1px（Shift で 10px）移動。Ctrl+Z で元に戻す、Ctrl+Y でやり直し。
              {editMode === "page" && " ブロックの左上の数字は、各ページの何人目の参加者を描くかを表します。"}
            </p>
          </div>

          {/* プロパティ欄 */}
          <PropertyPanel
            part={selectedPart}
            label={selectedPart ? labelOf(selectedPart) : ""}
            blockLabel={selectedPart ? (blockLabels.get(selectedPart.id) ?? null) : null}
            fixedTextOnly={editMode === "page"}
            canMoveForward={selectedIndex >= 0 && selectedIndex < items.length - 1}
            canMoveBackward={selectedIndex > 0}
            onChange={(part) => replacePart(part)}
            onMoveForward={() => movePartOrder(1)}
            onMoveBackward={() => movePartOrder(-1)}
            onReplaceImage={(file) => void replaceImage(file)}
            onDelete={() => {
              applyModel(withItems(model, items.filter((p) => p.id !== selectedId)));
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
