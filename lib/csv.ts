// CSV の読み込み（spec.md 5.1）
// ヘッダーなし・列は「名前, 連絡先, あとがき本文, アイコン画像」の順
import type { LineMessage, ParseResult, Participant } from "./types";

// 必要な列数
const COLUMN_COUNT = 4;

// ファイルを読み込み、参加者リストに変換する
export async function parseCsvFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  return parseCsvText(decodeText(buffer));
}

// 文字コードを自動判定してデコードする
// UTF-8（BOM の有無を問わない）として厳密にデコードし、失敗したら Shift_JIS として読み直す
export function decodeText(buffer: ArrayBuffer): string {
  try {
    // ignoreBOM: false（既定）なので、先頭の BOM は取り除かれる
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

// CSV の 1 レコード（行番号つき）
type CsvRecord = { line: number; fields: string[] };

// RFC 4180 に従って、テキストをレコードと列に分ける
// ダブルクォートで囲まれた値の中の改行・カンマ・"" に対応する
export function splitCsv(text: string): CsvRecord[] {
  // 改行コードを LF に統一する（値の中の改行も LF になる）
  const src = text.replace(/\r\n?/g, "\n");
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1; // 現在読んでいる物理行
  let recordLine = 1; // 現在のレコードが始まった物理行

  // 現在のレコードを確定する
  const pushRecord = () => {
    fields.push(field);
    records.push({ line: recordLine, fields });
    fields = [];
    field = "";
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          // "" は値の中のダブルクォート 1 文字
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else if (ch === "\n") {
      pushRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  // 末尾に改行がない場合の最終レコード
  if (field !== "" || fields.length > 0) pushRecord();

  return records;
}

// CSV テキストを参加者リストに変換する
export function parseCsvText(text: string): ParseResult {
  const participants: Participant[] = [];
  const errors: LineMessage[] = [];
  const warnings: LineMessage[] = [];

  for (const { line, fields } of splitCsv(text)) {
    // 空行は読み飛ばす
    if (fields.every((f) => f.trim() === "")) continue;

    // 列不足はエラーとして描画から外す（5 列目以降は無視する）
    if (fields.length < COLUMN_COUNT) {
      errors.push({
        line,
        message: `列が足りません（${fields.length} 列。${COLUMN_COUNT} 列必要です）`,
      });
      continue;
    }

    const [name, contact, afterword, rawIcon] = fields;
    let icon = rawIcon.trim();
    // data:image/ で始まらない値は不正とみなし、アイコンなしで描画する
    if (icon !== "" && !icon.startsWith("data:image/")) {
      warnings.push({ line, message: "アイコン画像の形式が不正なため、アイコンなしで描画します" });
      icon = "";
    }

    participants.push({ line, name, contact, afterword, icon });
  }

  return { participants, errors, warnings };
}
