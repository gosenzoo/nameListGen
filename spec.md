# spec.md — name-list-gen 仕様書

> 機能追加・変更・バグ修正の際は、コード修正の前にこのファイルを更新し、承認を得ること（CLAUDE.md「開発フロー」参照）。
> 「★要確認」は未決定の項目。提案値を書いてあるが、承認を得るまで確定ではない。

## 1. 概要

- **目的**: 合同誌の参加者のあとがきリストを、入稿用の PNG 画像（複数枚）として生成する。
- **想定ユーザー**: 合同誌の主催者（ローカル環境で利用する）
- **主なユースケース**:
  1. 参加者情報をまとめた CSV ファイルをブラウザで選ぶ
  2. ページ割りされたあとがきリストをプレビューで確認する
  3. PNG をダウンロードして入稿データに使う

## 2. 技術スタック

| 項目 | 内容 |
| --- | --- |
| フレームワーク | Next.js 14.4.6（App Router） |
| UI | React 19.3.0 |
| 言語 | TypeScript 5（流用する描画エンジンは JavaScript のまま。`tsconfig.json` の `allowJs: true` で読み込む） |
| スタイル | Tailwind CSS 4.3.3 |
| リント | ESLint 9 + eslint-config-next |
| 描画エンジン | trainLCD プロジェクトの lcdParts 描画エンジン（`public/Drawer/src/`）を流用 |
| PNG 書き出し | trainLCD プロジェクトの `public/js/lcdCapture.js` を流用 |
| 追加ライブラリ | `@supabase/supabase-js`（テンプレートの保管。13章） |
| テンプレートの保管先 | Supabase（PostgreSQL のテーブル。13章） |

- CSV と参加者のデータ（名前・連絡先・あとがき・アイコン）の処理はすべてブラウザ内で完結し、サーバーへ送信しない（個人情報保護）。
- Supabase へ送るのはテンプレート（レイアウトの SVG）だけで、参加者のデータは含まない。

## 3. 機能一覧

| ID | 機能名 | 概要 | 状態 |
| --- | --- | --- | --- |
| F-01 | CSV 読み込み | ファイル選択で CSV を読み込み、参加者リストに変換する | 実装済み |
| F-02 | ページ割り | 参加者を CSV の順に 8 人ずつページに割り当てる | 実装済み |
| F-03 | SVG 描画 | テンプレートと描画エンジンで各ページを SVG として描画する | 実装済み |
| F-04 | プレビュー | 描画したページを画面に一覧表示する | 実装済み |
| F-05 | PNG 書き出し | 各ページを B5・350dpi・塗り足し 3mm の PNG で保存する | 実装済み |
| F-06 | はみ出し警告 | 枠に収まらず切れたテキストがあれば、該当の参加者を画面に表示する | 実装済み |
| F-07 | テンプレート選択 | メイン画面で、PNG 生成に使うテンプレートを選ぶ（組み込み＋Supabase に保存したもの） | 実装済み |
| F-08 | テンプレート編集 | 参加者ブロックのパーツを、画面上の図形操作と数値入力で編集する | 実装済み |
| F-09 | テンプレートの保存・読み込み・削除 | 名前を付けて Supabase に保存する。同じ名前は確認のうえ上書き。不要なものは削除できる | 実装済み |

## 4. 画面・ルーティング

| パス | ファイル | 内容 |
| --- | --- | --- |
| `/` | `app/page.tsx` | メイン画面。CSV 選択 → プレビュー → ダウンロード |
| `/template-editor` | `app/template-editor/page.tsx` | テンプレート編集画面（14章） |

メイン画面の構成（上から）:

1. **ファイル選択**: CSV ファイルを選ぶボタン（`<input type="file" accept=".csv">`）
   - その下に **「テンプレート編集」ボタン**。テンプレート編集画面（`/template-editor`）へ遷移する。
   - その下に **テンプレートの選択欄（F-07）**。「標準（組み込み）」と、Supabase に保存したテンプレートの名前を並べる。初期値は「標準（組み込み）」。選び直すと、読み込み済みの CSV をそのテンプレートで描画し直す。
   - 選んだテンプレートはブラウザに覚えておき（`localStorage`）、次に開いたときも選ばれた状態にする。そのテンプレートが削除されていたら「標準（組み込み）」に戻す。
   - Supabase に接続できない場合は、選択欄に「標準（組み込み）」だけを出し、接続できなかったことを表示する（PNG 生成は組み込みで続けられる）。
2. **読み込み結果**: 参加者数・ページ数を表示する。
   - **CSV エラー**: 列不足の行など。行番号と内容を表示する。
   - **はみ出し警告（F-06）**: 枠に収まらなかったテキスト。行番号・名前・項目名（名前／連絡先／あとがき）・切れた行数を表示する。
3. **プレビュー**: 各ページを縮小表示する。「ガイド表示」をオンにすると、仕上がり線・安全領域・ブロック枠を重ねて表示する（ガイドは PNG には含めない）。
4. **ダウンロード**: ページごとの「保存」ボタンと、「すべて保存」ボタン（全ページを順番にダウンロードする）。

## 5. データモデル

### 5.1 入力 CSV

- **ファイル名**: 任意（資料では `input.csv`）。ブラウザのファイル選択で受け取る。
- **ヘッダー行**: なし。1 行目から参加者データ。
- **1 行 = 参加者 1 人**。列の順番は以下で固定。

| 列 | 内容 | 備考 |
| --- | --- | --- |
| 1 | 名前 | |
| 2 | 連絡先 | 改行を含むことがある |
| 3 | あとがき本文 | 改行を含むことがある |
| 4 | アイコン画像 | `data:image/png;base64,...` 形式の data URL |

- **書式**: RFC 4180 準拠。改行・カンマ・ダブルクォートを含む値はダブルクォートで囲み、値の中のダブルクォートは `""` と二重にする。
- **改行コード**: CRLF / LF のどちらも受け付ける。値の中の改行は LF に統一する。
- **文字コード**: 自動判定する。まず UTF-8（BOM の有無を問わない）として厳密にデコードし、失敗したら Shift_JIS としてデコードする。
- **行順**: CSV の行順のままリストに並べる（並べ替えはしない）。
- **空行**: 読み飛ばす。
- **列不足**: その行をエラーとして画面に表示し、描画からは外す。5 列目以降は無視する。
- **アイコン**: `data:image/` で始まらない値は不正とみなし、アイコンなしで描画する（エラーではなく警告として表示する）。

### 5.2 型定義

```ts
// 参加者 1 人分（CSV の 1 行）
type Participant = {
  line: number;      // CSV 上の行番号（1 始まり。エラー表示用）。値の中の改行も 1 行と数えた、そのレコードが始まる行
  name: string;      // 名前
  contact: string;   // 連絡先（改行を含みうる）
  afterword: string; // あとがき本文（改行を含みうる）
  icon: string;      // アイコン画像の data URL（不正・空なら空文字）
};

// CSV 読み込み結果
type ParseResult = {
  participants: Participant[];
  errors: { line: number; message: string }[];   // 描画から外した行
  warnings: { line: number; message: string }[]; // 描画はするが注意が必要な行（アイコン不正など）
};

// 1 ページ分
type Page = {
  pageNumber: number;           // 1 始まり（ファイル名に使う）
  participants: Participant[];  // 最大 8 人
};

// はみ出し情報（描画エンジンから回収する）
type OverflowInfo = {
  line: number;                               // CSV 上の行番号
  name: string;
  field: 'name' | 'contact' | 'afterword';    // はみ出した項目
  droppedLines: number;                       // 描画されなかった行数
};
```

### 5.3 描画エンジンへ渡すデータ（drawParams）

```ts
// テンプレートの #{...} / lcd-arg から参照される
type PageDrawParams = {
  entries: {
    line: number;      // はみ出し情報の回収に使う
    name: string;
    contact: string;
    afterword: string;
    icon: string;      // 空文字ならアイコンを描画しない
  }[];                 // 最大 8 件。8 件未満のページは、足りない枠を空欄にする
};
```

## 6. 出力 PNG

| 項目 | 値 |
| --- | --- |
| 仕上がりサイズ | B5（182 × 257 mm） |
| 塗り足し | 上下左右 3mm |
| 塗り足し込みのサイズ | 188 × 263 mm |
| 解像度 | 350dpi |
| ピクセル数 | 2591 × 3624 px（188mm, 263mm × 350 ÷ 25.4 を四捨五入） |
| 仕上がり線の位置 | 各辺から 41px（3mm） |
| 安全領域 | 仕上がり線から内側 5mm（69px）。各辺から 110px |
| 解像度情報 | PNG に `pHYs` チャンクを書き込み、350dpi（13780 ピクセル/m）として扱われるようにする |
| 背景 | 白（塗り足し部分も含む） |
| ファイル名 | `afterword_01.png`, `afterword_02.png` …（ページ番号を 2 桁でゼロ埋め） |
| すべて保存 | ページごとの PNG を順番にダウンロードする（ZIP にはしない） |

- 「すべて保存」では Chrome から「複数ファイルのダウンロードを許可しますか」と聞かれることがある。初回に許可する。

## 7. レイアウト（詳細）

単位は px（350dpi）。座標はページ左上（塗り足しの外側の角）が原点。

### 7.1 ページ

- 縦 4 × 横 2 の 8 ブロックを、安全領域（x: 110〜2481、y: 110〜3514）の中に配置する。
- ページ番号・タイトルは入れない。
- **ブロックの並び順**: 左上から右へ、次の段へ（1 段目左 → 1 段目右 → 2 段目左 …）。★要確認
- 8 人に満たない最後のページは、残りの枠を空欄にする。

| 項目 | 値 |
| --- | --- |
| ブロックの大きさ | 幅 1130 × 高さ 764（横:縦 = 85:57.5。1130 × 57.5 ÷ 85 = 764.4 を切り捨て） |
| 横の間隔 | 111（ブロック 1130 × 2 + 111 = 2371 = 安全領域の幅） |
| 縦の間隔 | 116（ブロック 764 × 4 + 116 × 3 = 3404 = 安全領域の高さ） |
| 列の x 座標 | 左 110、右 1351 |
| 段の y 座標 | 110, 990, 1870, 2750 |

### 7.2 参加者ブロック（仮のデザイン）

ブロック内の相対座標（ブロック左上が原点）:

```
(0,0)
┌───────────────────────────────────────────┐
│┌───────┐  名前（12pt 相当・1 行）            │
││ icon  │                                    │
││345×345│  連絡先（9pt 相当・複数行）         │
│└───────┘                                    │
│あとがき本文（9pt 相当・複数行・折り返し）   │
│                                             │
└───────────────────────────────────────────┘
                                      (1130,764)
```

| 要素 | 部品 | 位置・大きさ（x, y, 幅, 高さ） | 備考 |
| --- | --- | --- | --- |
| アイコン | `<image lcdParts="static">` | 0, 0, 345, 345 | 25mm 角の四角に内接する円（直径 345）で表示する。`preserveAspectRatio="xMidYMid slice"` で正方形に切り抜いたうえで、`clip-path` で円形に切り抜く |
| 名前 | `lcdParts="text"` | 375, 0, 755, 60 | 1 行ぶんの高さの枠。文字の高さ 50（12pt 相当） |
| 連絡先 | `lcdParts="text"` | 375, 90, 755, 255 | 文字の高さ 38（9pt 相当）、行間 22 → 4 行まで |
| あとがき本文 | `lcdParts="text"` | 0, 375, 1130, 389 | 文字の高さ 38（9pt 相当）、行間 22 → 6 行まで |

- **すべてのテキスト**は、流用元の `infoMessage.svg` のメッセージボックスと同じ `lcdParts="text"`（`TextBlockObj`）で描画する。指定は `breakType="1"`（幅を超えたら折り返す）、`lcd-holAlign="left"`、`lcd-verAlign="top"`。
- **折り返し**: 流用元のまま（文字単位。禁則処理なし）。
- **はみ出し**: 流用元のまま、枠の下端を超える行は描画しない。切れた行ははみ出し警告（F-06）で画面に表示する。
- **フォント**: BIZ UDGothic（名前は太字 700、ほかは 400）。
- **文字の大きさの指定方法**: 描画エンジンは「文字の高さ」（textLine の height）からフォントサイズを逆算する。上の「文字の高さ」は目安で、実装時に 9pt / 12pt に近くなるよう調整する。
- **収まる文字数の目安**: あとがき本文は 1 行約 28 文字 × 6 行（約 170 文字）。これより長いあとがきは切れる。★要確認（長い人が多い場合は、文字の大きさかブロック内の配置を見直す）

### 7.3 テンプレート（`public/templates/page.svg`）

ブロックは関数入力（`lcd-funcDef`）で 1 つだけ定義し、`lcd-funcCall` で 8 回呼び出して複製する。各呼び出しには `lcd-arg` で何番目の参加者かを渡す。

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2591 3624" width="2591" height="3624">
  <defs>
    <!-- アイコンを円形に切り抜く。objectBoundingBox 指定なので、画像自身の四角に内接する円になる -->
    <clipPath id="iconClip" clipPathUnits="objectBoundingBox">
      <circle cx="0.5" cy="0.5" r="0.5" />
    </clipPath>
  </defs>

  <!-- 背景（塗り足し込みで白） -->
  <rect lcdParts="static" x="0" y="0" width="2591" height="3624" fill="#ffffff" />

  <!-- 参加者ブロックの定義（関数入力）。funcArea の左上が呼び出し側 rect の左上に合わせられる -->
  <g lcd-funcDef="entryBlock">
    <rect lcdParts="funcArea" x="0" y="0" width="1130" height="764" fill="#80808033" />
    <image lcdParts="static" isDraw="$entry.icon" lcd-href="#{$entry.icon}"
           x="0" y="0" width="345" height="345" preserveAspectRatio="xMidYMid slice"
           clip-path="url(#iconClip)" />
    <g lcdParts="text" lcdText="#{$entry.name}" lcd-overflow="name"
       lcd-holAlign="left" lcd-verAlign="top" breakType="1">
      <rect lcdParts="textArea" x="375" y="0" width="755" height="60" fill="#00a00033" />
      <rect lcdParts="textLine" x="375" y="0" width="755" height="50" fill="#ff800033"
            data-style='{"fontFamily": "BIZ UDGothic", "fontWeight": "700"}' />
    </g>
    <g lcdParts="text" lcdText="#{$entry.contact}" lcd-overflow="contact"
       lcd-holAlign="left" lcd-verAlign="top" interval="22" breakType="1">
      <rect lcdParts="textArea" x="375" y="90" width="755" height="255" fill="#00a00033" />
      <rect lcdParts="textLine" x="375" y="90" width="755" height="38" fill="#ff800033"
            data-style='{"fontFamily": "BIZ UDGothic", "fontWeight": "400"}' />
    </g>
    <g lcdParts="text" lcdText="#{$entry.afterword}" lcd-overflow="afterword"
       lcd-holAlign="left" lcd-verAlign="top" interval="22" breakType="1">
      <rect lcdParts="textArea" x="0" y="375" width="1130" height="389" fill="#00a00033" />
      <rect lcdParts="textLine" x="0" y="375" width="1130" height="38" fill="#ff800033"
            data-style='{"fontFamily": "BIZ UDGothic", "fontWeight": "400"}' />
    </g>
  </g>

  <!-- 8 ブロックの呼び出し（並び順は 7.1） -->
  <rect lcd-funcCall="entryBlock" lcd-arg="entry:entries[0]" x="110"  y="110"  width="1130" height="764" fill="#0000ff33" />
  <rect lcd-funcCall="entryBlock" lcd-arg="entry:entries[1]" x="1351" y="110"  width="1130" height="764" fill="#0000ff33" />
  <rect lcd-funcCall="entryBlock" lcd-arg="entry:entries[2]" x="110"  y="990"  width="1130" height="764" fill="#0000ff33" />
  <!-- …entries[7] まで -->
</svg>
```

- 流用元の関数入力は、呼び出し側 rect の属性（`lcd-arg` など）を、展開したブロック内の各要素へコピーする。各要素は自分に付いた `lcd-arg` から `$entry` を受け取る。

#### アイコンの円形の切り抜き

- 切り抜きの形（`clipPath`）はテンプレートの `<defs>` に 1 つだけ定義し、8 ブロックのアイコンで共有する。
- `clipPathUnits="objectBoundingBox"` にすると、円の位置と大きさが画像自身の四角（x, y, 幅, 高さ）に対する割合になる。関数呼び出しでブロックを別の位置に複製しても、それぞれのアイコンの四角に内接する円で切り抜かれる。
- `<defs>` は描画エンジンがページの SVG にそのまま複製する（流用元の仕組み）。PNG 書き出しも同じ SVG を使うため、プレビューと PNG の両方が円形になる。
- 描画エンジンとアプリのコードは変更しない（テンプレートだけの変更）。

#### 配置の目印（透明度 0.2）

- 関数呼び出し（`lcd-funcCall`）・`funcArea`・`textArea`・`textLine` の rect に、透明度 0.2 の塗りを付ける。テンプレートを SVG エディタやブラウザで直接開いたときに、各パーツの配置が見えるようにするための目印（trainLCD のテンプレートと同じ書き方）。
- これらの rect には `lcdParts="static"` がないため、描画エンジンは描画しない。プレビューと PNG には出ない。
- 透明度は `fill` の 8 桁カラーコードの末尾 2 桁（`33` = 0.2）で指定する。`opacity` / `fill-opacity` 属性は使わない。関数入力の展開では、呼び出し側 rect の属性のうち `x`・`y`・`width`・`height`・`fill` 以外が展開後の全要素にコピーされるため、`opacity` を付けるとブロック全体が薄く描画されてしまう。

| パーツ | 色（透明度 0.2） |
| --- | --- |
| 関数呼び出し（`lcd-funcCall`） | 青 `#0000ff33` |
| `funcArea` | 灰 `#80808033` |
| `textArea` | 緑 `#00a00033` |
| `textLine` | 橙 `#ff800033` |

## 8. 描画エンジンの流用（詳細）

### 8.1 方針

- trainLCD の `public/Drawer/src/` から必要なファイルだけをコピーし、`lib/drawer/` に置いて改造する。
- 元のファイルは `<script>` タグで読み込むグローバルクラス方式なので、ファイル先頭に `import`、末尾に `export` を足して ES モジュールにする。描画ロジックは、8.4 の改造点以外は変えない。
- 流用元: `C:\document\dev\trainLCD_claude\trainLCD_claude`（参照のみ。変更しない）
- 流用したファイルの先頭に、流用元のパスを日本語コメントで書く。

### 8.2 コピーするファイル

| コピー元（`public/` 以下） | コピー先 | 用途 |
| --- | --- | --- |
| `Drawer/src/main/Drawer.js` | `lib/drawer/Drawer.js` | 入口。関数入力の展開、テンプレートの解析と描画 |
| `Drawer/src/objects/LcdPartsObj.js` | `lib/drawer/LcdPartsObj.js` | 部品の基底。`#{...}` の差し込み |
| `Drawer/src/objects/GObj.js` | `lib/drawer/GObj.js` | `<g>` 系部品の基底 |
| `Drawer/src/objects/GroupObj.js` | `lib/drawer/GroupObj.js` | ルート `<svg>` |
| `Drawer/src/objects/StaticObj.js` | `lib/drawer/StaticObj.js` | 背景・アイコン画像 |
| `Drawer/src/objects/TextBlockObj.js` | `lib/drawer/TextBlockObj.js` | 複数行テキスト（全テキスト） |
| `Drawer/src/utility/TextDrawer.js` | `lib/drawer/TextDrawer.js` | 文字の計測と描画 |
| `Drawer/src/utility/ExprParser.js` | `lib/drawer/ExprParser.js` | `isDraw` などの式の評価 |
| `js/lcdCapture.js` | `lib/drawer/lcdCapture.js` | SVG → PNG 変換とフォントの埋め込み |

- 使わない部品（`ArrangeObj`, `SlotObj`, `TextBoxObj`, `NumIconObj`, `GenerateObj`, `generators/*`, `MulShadowUtil`, `Animator`, `NumIconDrawer`, `IconDrawer`）はコピーしない。`Drawer.js` から、それらを使う分岐を削除する。

### 8.3 Drawer の呼び出し方（簡略化後）

```ts
const drawer = new Drawer();
drawer.load(templateSvg);                 // 関数入力の展開まで済ませて保持する
const fragment = drawer.draw(drawParams); // ページ 1 枚分の SVG 要素（DocumentFragment）を返す
const overflows = drawer.getOverflows();  // 直前の draw で切れたテキストの一覧
```

- 流用元の「ヘッダーとボディの 2 枚を重ねる」構造と、`drawParams.page` によるボディの切り替えをなくし、テンプレート 1 枚を描画する形にする。

### 8.4 改造点

| # | 対象 | 内容 | 理由 |
| --- | --- | --- | --- |
| 1 | `Drawer` | トップレベル（ルート `<svg>` 直下）の要素に `lcd-arg="名前:パス"` があれば、その値を `args` として部品に渡す。値が配列の場合は流用元の arrange と同じく要素ごとに複製し、配列でない場合（`entries[3]` など）はそのまま 1 つ渡す。値が `undefined`（そのページの人数が足りない）なら、その要素を描画しない | 流用元はトップレベルで `args` を常に空で渡しており、関数入力で複製したブロックに何番目の参加者かを渡せないため |
| 2 | `Drawer` | `isDraw` の評価に、1 の `args` を使う | `isDraw="$entry.icon"` でアイコンなしを判定するため |
| 3 | `StaticObj` | `lcd-href` 属性を `#{...}` の差し込み後の値で `href` に設定する。値が空なら `href` を付けない | 流用元には画像の参照先を差し込む仕組みがないため |
| 4 | `TextBlockObj` | 枠の下端を超えて描画しなかった行数を記録する。`lcd-overflow` 属性（項目名）と `$entry.line` とあわせて `Drawer` が回収できるようにする | はみ出し警告（F-06）のため。描画結果は変えない |
| 5 | `TextDrawer` | アイコン辞書がない（`null`）場合は、`:キー:` によるアイコン埋め込みの処理に入らず、普通の文字列として描画する | 連絡先の URL（`https://…`）などに含まれる `:` がアイコン記法と解釈されるのを防ぐため |
| 6 | `lcdCapture` | 背景の塗りを黒から白に変える。PNG に `pHYs` チャンク（350dpi）を書き込む関数を追加する | 入稿用 |
| 7 | 全体 | `window.lcdAnimator` などのグローバル変数と `console.log` のデバッグ出力をなくす | ES モジュール化と、個人情報をコンソールに出さないため |

## 9. 処理の流れ

```
[ファイル選択]
   │ File
   ▼
lib/csv.ts         parseCsv(file) → ParseResult
   │                 ・ArrayBuffer を読み、UTF-8（厳密）→ Shift_JIS の順にデコード
   │                 ・RFC 4180 で行と列に分ける（自前実装）
   │                 ・列不足はエラー、不正なアイコンは警告
   ▼
lib/paginate.ts    paginate(participants) → Page[]
   │                 ・CSV の順に 8 人ずつ区切る
   ▼
lib/render.ts      renderPages(pages) → { svg: SVGSVGElement, overflows: OverflowInfo[] }[]
   │                 ・選ばれたテンプレート（組み込みは fetch、保存済みは Supabase から取得）の SVG を
   │                   DOMParser で読み込み、Drawer.load（テンプレートごとに 1 回）
   │                 ・document.fonts.load で BIZ UDGothic（400 / 700）の読み込みを待つ
   │                 ・ページごとに <svg> を作り、Drawer.draw(drawParams) の結果を入れる
   ▼
app/page.tsx       プレビュー表示・警告表示
   │
   ▼ 「保存」／「すべて保存」
lib/exportPng.ts   exportPng(svg, pageNumber)
                     ・lcdCapture.capture(svg, { width: 2591, height: 3624 }) で PNG の Blob を作る
                     ・pHYs チャンクを書き込む
                     ・<a download="afterword_01.png"> でダウンロード
                     ・「すべて保存」は 1 枚ずつ順番に実行する
```

- フォントは Google Fonts の BIZ UDGothic を使う。画面表示用に `app/layout.tsx` で読み込み、PNG には `lcdCapture` の仕組み（使っている文字を含むフォントデータを SVG に埋め込む）で入れる。
- 描画エンジンは DOM と canvas を使うため、描画と PNG 書き出しはブラウザ側（Client Component）だけで行う。

## 10. ファイル構成

| パス | 内容 |
| --- | --- |
| `app/page.tsx` | 画面（Client Component）。状態管理と各処理の呼び出し |
| `app/layout.tsx` | フォントの読み込みを追加 |
| `app/components/FileSelector.tsx` | CSV ファイル選択 |
| `app/components/MessageList.tsx` | CSV エラー・警告・はみ出し警告の表示 |
| `app/components/PagePreview.tsx` | 1 ページ分のプレビュー（ガイド表示・保存ボタンつき） |
| `lib/types.ts` | 5.2 の型定義 |
| `lib/csv.ts` | CSV の読み込み |
| `lib/paginate.ts` | ページ割り |
| `lib/render.ts` | テンプレートと描画エンジンで SVG を作る |
| `lib/exportPng.ts` | PNG 書き出し・ダウンロード |
| `lib/pngDpi.ts` | PNG に pHYs チャンクを書き込む |
| `lib/drawer/` | 流用した描画エンジン（8.2） |
| `public/templates/page.svg` | ページのテンプレート（7.3） |
| `scripts/makeTestData.mjs` | 試験用 CSV を生成するスクリプト（Node.js 標準機能だけで単色のアイコン PNG を作る） |
| `testdata/test.csv` | 試験用のダミーデータ（スクリプトで生成） |
| `app/components/TemplateSelector.tsx` | メイン画面のテンプレート選択欄（F-07） |
| `app/template-editor/page.tsx` | テンプレート編集画面（F-08, F-09） |
| `app/template-editor/components/` | 編集画面の部品（キャンバス・パーツ一覧・プロパティ欄・保存ダイアログ・確認ダイアログ） |
| `lib/templateStore.ts` | Supabase への読み書き（13章） |
| `lib/templateModel.ts` | テンプレートの SVG と編集用データの相互変換（14.6） |
| `lib/sampleData.ts` | 編集画面のプレビュー用のダミーの参加者データ |
| `supabase/templates.sql` | テーブル作成の SQL（13.2） |

## 11. 非機能要件

- **対応ブラウザ**: デスクトップ版 Chrome（最新版）
- **レスポンシブ対応**: 不要（PC での利用を前提とする）
- **データの保存先**: なし。読み込んだデータはブラウザのメモリ上だけで扱い、保存も送信もしない。
- **フォント**: 文字の計測前にフォントの読み込みを待つ（描画エンジンが文字の高さを実測するため）。

## 12. 開発上の取り決め

- **個人情報保護**: 開発中は実データを使わない。試験用のダミーデータ（`testdata/test.csv`）だけを使う。実データの CSV をリポジトリに置かない（`.gitignore` に `input.csv` を追加する）。
- **試験用データ**: 架空の名前・連絡先・あとがきと、単色のアイコンで作る。次のケースを含める。
  - 改行・カンマ・ダブルクォートを含む値
  - URL（`:` を含む）の連絡先
  - 枠からはみ出す長いあとがき
  - アイコンなし・不正なアイコン
  - 列不足の行
  - 8 の倍数でない人数（最後のページに空欄ができる）
- **git**: ローカルリポジトリだけで管理し、remote には push しない。

## 13. テンプレートの保管（Supabase）

### 13.1 接続設定

- Supabase のプロジェクトはユーザーが用意済み。接続情報はユーザーが `.env.local`（または `.env`）に設定する（リポジトリには含めない。`.gitignore` の `.env*` で除外済み）。
- `NEXT_PUBLIC_SUPABASE_URL` はプロジェクトの URL だけを書く（`https://<プロジェクト>.supabase.co`）。`/rest/v1/` などのパスを付けると「Invalid path specified in request URL」で接続に失敗する。

```
NEXT_PUBLIC_SUPABASE_URL=https://<プロジェクト>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key または publishable key>
```

- 接続はブラウザから `@supabase/supabase-js` で行う（`lib/templateStore.ts`）。
- 環境変数が設定されていない場合は、Supabase を使う機能（選択欄の保存済みテンプレート、編集画面の保存・読み込み・削除）を無効にし、その旨を表示する。

### 13.2 テーブル

テーブル作成の SQL を `supabase/templates.sql` に置き、ユーザーが Supabase の SQL Editor で実行する。

```sql
create table public.templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,          -- テンプレート名（保存時に決める）
  svg        text not null,                 -- テンプレートの SVG（7.3 の形式）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ログインなしで使うため、anon ロールに読み書きを許可する
alter table public.templates enable row level security;
create policy "templates_all_anon" on public.templates
  for all to anon using (true) with check (true);
```

- **★要確認（セキュリティ）**: ログイン機能を作らないため、anon key を知っている人は誰でもテンプレートの読み書き・削除ができる。anon key はブラウザに渡るため、アプリを公開すると誰でも取り出せる。ローカルでだけ使う前提とする。テンプレートには個人情報が入らないため、漏れても参加者の情報は出ない。

### 13.3 操作

| 操作 | 内容 |
| --- | --- |
| 一覧 | `id, name, updated_at` を名前順で取得する |
| 読み込み | `id` を指定して `svg` を取得する |
| 保存（新規） | `name, svg` を挿入する |
| 保存（上書き） | 同じ `name` の行の `svg, updated_at` を更新する |
| 削除 | `id` を指定して削除する |

- **組み込みテンプレート**（`public/templates/page.svg`）は Supabase には入れず、読み込み専用として扱う。編集画面で開いて変更したものは、名前を付けて保存する。

## 14. テンプレート編集画面（`/template-editor`）

### 14.1 編集できる範囲

| 対象 | 編集できること |
| --- | --- |
| ページ | 背景色 |
| 参加者ブロック（関数入力 `entryBlock` の中身） | パーツの追加・削除・移動・大きさ変更・重なり順・各パーツの属性（14.3） |
| ブロックの大きさ・ページ内の配置 | 編集しない（7.1 の 4 × 2・1130 × 764 で固定） |

- 8 つのブロックはすべて同じ定義（関数入力）から複製されるので、1 つのブロックを編集すると全ブロックに反映される。

### 14.2 画面構成

```
┌───────────────────────────────────────────────────────────────┐
│ [← メイン画面へ]  テンプレート編集                              │
│ 開く: [標準（組み込み）▼] [開く]   [保存…] [削除]               │
├──────────────┬──────────────────────────────┬────────────────┤
│ パーツ一覧     │ キャンバス（ブロック 1 つを拡大表示）│ プロパティ       │
│ ・塗り         │ ┌──────────────────────────┐ │ 種類: テキスト   │
│ ・アイコン     │ │ ○  名前                   │ │ 内容: [名前▼]   │
│ ・名前         │ │    連絡先                 │ │ x [375] y [0]   │
│ ・連絡先       │ │ あとがき本文…             │ │ 幅 [755] 高さ…  │
│ ・あとがき     │ └──────────────────────────┘ │ 文字の高さ [50] │
│ [+塗り]        │ [□ ページ全体を表示]               │ 太さ [700▼] …  │
│ [+テキスト]    │                                    │ [前面へ][背面へ]│
│ [+アイコン]    │                                    │ [削除]          │
│ ページ背景色[■]│                                    │                 │
└──────────────┴──────────────────────────────┴────────────────┘
```

- **開く**: 「標準（組み込み）」と Supabase に保存したテンプレートから選んで開く。最初は「標準（組み込み）」を開いた状態。
- **キャンバス**: ブロック 1 つ（1130 × 764）を描画エンジンで実際に描画して表示する（ダミーの参加者 1 人分で描画。参加者の実データは使わない）。その上に、各パーツの枠と操作用のハンドルを重ねる。
- **ページ全体を表示**: オンにすると、ページ全体（8 ブロック・ダミー 8 人分）を描画して確認できる（このときは表示だけで、操作はできない）。
- **未保存の変更**: 変更がある状態で「開く」や「メイン画面へ」を押したときは、破棄してよいか確認する（画面内の確認ダイアログ。ブラウザの `confirm` は使わない）。

### 14.3 パーツ

| 種類 | テンプレート上の形 | 編集できる属性 |
| --- | --- | --- |
| 塗り | `<rect lcdParts="static">` | x, y, 幅, 高さ, 色 |
| アイコン | `<image lcdParts="static" lcd-href="#{$entry.icon}">` | x, y, 大きさ（正方形の一辺）, 円形に切り抜く（オン／オフ） |
| テキスト | `<g lcdParts="text">`（textArea・textLine） | 内容（名前／連絡先／あとがき／固定の文字列）, x, y, 幅, 高さ（textArea）, 文字の高さ（textLine の height）, 行間（interval）, 太さ（400／700）, 文字色, 揃え（左／中央／右） |

- テキストの「内容」が名前・連絡先・あとがきのときは、`lcdText` に `#{$entry.name}` などを入れ、はみ出し警告用の `lcd-overflow` を付ける。固定の文字列のときは、入力した文字をそのまま `lcdText` に入れる（見出しなどに使う）。
- 文字色は textLine の `data-style` の `fill` に入れる（描画エンジンが文字の `style` に反映する）。
- アイコンの円形の切り抜きは、7.3 の `iconClip` を使う。

### 14.4 図形操作

- **選択**: パーツをクリックすると選択する（パーツ一覧のクリックでも選べる）。重なっている場合は前面のパーツが選ばれる。
- **移動**: 選択中のパーツをドラッグする。矢印キーで 1px、Shift＋矢印キーで 10px 動く。
- **大きさ変更**: 選択中のパーツの四隅と各辺の中央のハンドルをドラッグする。アイコンは正方形を保つ。
- **座標の丸め**: ドラッグ中の座標・大きさは整数に丸める。
- **ブロックの外**: パーツはブロックの外にはみ出して置ける（表示はブロックの範囲だけ）。
- **数値入力との連動**: ドラッグの結果はプロパティ欄にすぐ反映され、プロパティ欄の入力はキャンバスにすぐ反映される。
- **元に戻す／やり直し**: Ctrl+Z ／ Ctrl+Y（直近 50 操作）。★要確認（不要なら外す）

### 14.5 保存・削除

- **保存…**: 名前の入力欄つきのダイアログを開く。今開いているテンプレートが保存済みなら、その名前を初期値にする（組み込みを開いている場合は空欄）。
  - 同じ名前のテンプレートがあれば「上書きしますか」と確認し、「上書き」で上書き保存する。
  - 名前は前後の空白を除いて 1〜50 文字。空の場合は保存できない。
- **削除**: 今開いているテンプレート（保存済みのもの）を、確認のうえ Supabase から削除する。組み込みのテンプレートは削除できない（ボタンを無効にする）。削除後は「標準（組み込み）」を開いた状態に戻る。
- 保存・削除・読み込みに失敗した場合は、画面にエラーを表示する（編集中の内容は消さない）。

### 14.6 テンプレートの読み書き（編集用のデータ構造）

- 編集画面は、テンプレートの SVG を読み込んで編集用のデータ（14.3 のパーツの配列とページ背景色）に変換し、保存時にそのデータから SVG を組み立て直す（`lib/templateModel.ts`）。
- 組み立てる SVG は 7.3 の形式（`defs` の `iconClip`、背景、`entryBlock` の関数入力、8 つの関数呼び出し、透明度 0.2 の配置の目印）とする。
- 読み込み時に 14.3 にない要素（パーツとして解釈できない要素）があれば、「編集画面で扱えない要素があり、保存すると失われます」と表示する。

```ts
// 編集用のデータ
type TemplateModel = {
  pageBackground: string; // ページの背景色
  parts: TemplatePart[];  // 描画順（後ろほど前面）
};

type TemplatePart =
  | { id: string; kind: "rect"; x: number; y: number; width: number; height: number; fill: string }
  | { id: string; kind: "icon"; x: number; y: number; size: number; circle: boolean }
  | {
      id: string; kind: "text";
      content: "name" | "contact" | "afterword" | "fixed";
      fixedText: string;     // content が "fixed" のときの文字列
      x: number; y: number; width: number; height: number; // textArea
      lineHeight: number;    // 文字の高さ（textLine の height）
      interval: number;      // 行間
      fontWeight: "400" | "700";
      color: string;
      align: "left" | "center" | "right";
    };
```

## 15. 未決事項・メモ

- ★要確認: ブロックの並び順（7.1）、あとがき本文の収まる文字数（7.2）、Supabase のセキュリティ（13.2）、元に戻す／やり直しの要否（14.4）

## 16. 変更履歴

| 日付 | 内容 |
| --- | --- |
| 2026-11-10 | 仕様書のひな形を作成 |
| 2026-11-10 | 資料（input/input1.txt）と回答をもとに、入力・出力・描画エンジンの流用・ページ割りの仕様を記載 |
| 2026-11-10 | 1 ページ 4 × 2 ブロック固定、全テキストを複数行テキスト部品で描画、関数入力によるブロックの複製に変更し、詳細設計を追加 |
| 2026-11-10 | F-01〜F-06 を実装。行番号の数え方を明記 |
| 2026-11-11 | ブロックの比率を横 85:縦 57.5 に変更（1130 × 764）。テンプレートの各パーツに透明度 0.2 の配置の目印を追加 |
| 2026-11-11 | アイコンを四角に内接する円形で表示するよう変更 |
| 2026-11-11 | テンプレートの選択・編集・Supabase への保存（F-07〜F-09）の仕様を追加 |
| 2026-11-11 | F-07〜F-09 を実装。接続情報の URL の書き方を明記 |
