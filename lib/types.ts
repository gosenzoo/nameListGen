// アプリ全体で使う型定義（spec.md 5.2）

// 参加者 1 人分（CSV の 1 行）
export type Participant = {
  line: number; // CSV 上の行番号（1 始まり。エラー表示用）
  name: string; // 名前
  contact: string; // 連絡先（改行を含みうる）
  afterword: string; // あとがき本文（改行を含みうる）
  icon: string; // アイコン画像の data URL（不正・空なら空文字）
};

// 行番号つきのメッセージ
export type LineMessage = { line: number; message: string };

// CSV 読み込み結果
export type ParseResult = {
  participants: Participant[];
  errors: LineMessage[]; // 描画から外した行
  warnings: LineMessage[]; // 描画はするが注意が必要な行（アイコン不正など）
};

// 1 ページ分
export type Page = {
  pageNumber: number; // 1 始まり（ファイル名に使う）
  participants: (Participant | null)[]; // ブロックの番号順。null は空欄にするブロック（開始位置より前。spec.md 20.3）
};

// はみ出した項目
export type OverflowField = "name" | "contact" | "afterword";

// はみ出し情報（描画エンジンから回収する）
export type OverflowInfo = {
  line: number; // CSV 上の行番号
  name: string;
  field: OverflowField; // はみ出した項目
  droppedLines: number; // 描画されなかった行数
};

// 1 ページ分の描画結果
export type RenderedPage = {
  pageNumber: number;
  svg: SVGSVGElement;
  overflows: OverflowInfo[];
};
