// テンプレートの保管（Supabase。spec.md 13章）
// 参加者のデータは扱わない。読み書きするのはテンプレートの SVG だけ
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// テンプレート一覧の 1 件
export type StoredTemplateSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

// 開いている・選んでいるテンプレートの参照
export type TemplateRef = { kind: "builtin" } | { kind: "stored"; id: string; name: string };

// 組み込みテンプレートの置き場所（読み込み専用）
const BUILTIN_TEMPLATE_URL = "/templates/page.svg";

const TABLE = "templates";

// 接続情報（.env.local でユーザーが設定する。spec.md 13.1）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

// 接続情報が設定されているか
export function isStoreConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

// Supabase のクライアントを返す（未設定なら例外）
function getClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase の接続情報（.env.local）が設定されていません");
  }
  if (!client) {
    // ログインは使わないので、セッションの保存はしない
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  }
  return client;
}

// Supabase のエラーを、画面に出す文言の例外に変換する
function toError(action: string, error: { message: string }): Error {
  return new Error(`テンプレートの${action}に失敗しました: ${error.message}`);
}

// 一覧（名前順）
export async function listTemplates(): Promise<StoredTemplateSummary[]> {
  const { data, error } = await getClient().from(TABLE).select("id, name, updated_at").order("name");
  if (error) throw toError("一覧の取得", error);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at }));
}

// 保存済みテンプレートの SVG を読み込む
export async function loadStoredTemplateSvg(id: string): Promise<string> {
  const { data, error } = await getClient().from(TABLE).select("svg").eq("id", id).single();
  if (error) throw toError("読み込み", error);
  return data.svg as string;
}

// 組み込みテンプレートの SVG を読み込む
export async function loadBuiltinTemplateSvg(): Promise<string> {
  const res = await fetch(BUILTIN_TEMPLATE_URL);
  if (!res.ok) throw new Error(`組み込みテンプレートを読み込めませんでした（${res.status}）`);
  return res.text();
}

// 参照に応じてテンプレートの SVG を読み込む
export function loadTemplateSvg(ref: TemplateRef): Promise<string> {
  return ref.kind === "builtin" ? loadBuiltinTemplateSvg() : loadStoredTemplateSvg(ref.id);
}

// 名前でテンプレートを探す（なければ null）
export async function findTemplateByName(name: string): Promise<StoredTemplateSummary | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("id, name, updated_at")
    .eq("name", name)
    .maybeSingle();
  if (error) throw toError("確認", error);
  return data ? { id: data.id, name: data.name, updatedAt: data.updated_at } : null;
}

// 新規保存（同じ名前があると、テーブルの unique 制約でエラーになる）
export async function insertTemplate(name: string, svg: string): Promise<StoredTemplateSummary> {
  const { data, error } = await getClient()
    .from(TABLE)
    .insert({ name, svg })
    .select("id, name, updated_at")
    .single();
  if (error) throw toError("保存", error);
  return { id: data.id, name: data.name, updatedAt: data.updated_at };
}

// 上書き保存（id を指定して SVG と更新日時を書き換える）
export async function updateTemplate(id: string, svg: string): Promise<StoredTemplateSummary> {
  const { data, error } = await getClient()
    .from(TABLE)
    .update({ svg, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, updated_at")
    .single();
  if (error) throw toError("上書き保存", error);
  return { id: data.id, name: data.name, updatedAt: data.updated_at };
}

// 削除
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await getClient().from(TABLE).delete().eq("id", id);
  if (error) throw toError("削除", error);
}
