// 流用元: C:\document\dev\trainLCD_claude\trainLCD_claude\public\js\lcdCapture.js（ES モジュール化して改造。spec.md 8章）
// 改造内容: 背景を白にした。プレビューのポップアップ・カメラボタン・作成中の表示を削除した。
// ============================================================
// LcdCapture
// LCD表示の画像保存（7.65節）。表示中の LCD の SVG を、決まった解像度の PNG 画像にする。
//   - フォント: 表示を開いたときに、テンプレートが使う Web フォントを取得して埋め込み形式（data URL）にし、
//               メモリに置いておく（preloadFonts）。画像にするときはこれを SVG に入れるだけなので、オフラインでも使える
//   - 画像: SVG の中のファイル参照の画像は、画像にするときに埋め込み形式にする
//   - （流用元にあったプレビューのポップアップとカメラボタンは削除した）
// ============================================================

// 事前に取得するフォント（テンプレートが使うもの）
const CAPTURE_FONT_SOURCES = {
    // Google Fonts の CSS。日本語フォントは文字の範囲（unicode-range）ごとのファイルに分かれている
    googleCss: 'https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&display=swap',
    // サイトに置いているフォント（このプロジェクトでは使わない）
    local: [],
};

// 同時に取得するファイル数（取得が表示の邪魔にならないよう絞る）
const CAPTURE_FONT_FETCH_CONCURRENCY = 4;

class LcdCapture {
    constructor() {
        // 埋め込み形式にしたフォント: { family, weight, style, ranges: [[from, to], ...] | null, dataUrl, format }
        this._fontFaces = [];
        this._fontsReady = false;
    }

    // ============================================================
    // フォントの事前取得
    // ============================================================

    /** 表示を開いたときに呼ぶ。裏でフォントを取得して埋め込み形式にしておく（失敗しても例外は出さない） */
    async preloadFonts() {
        const faces = [];
        try {
            const css = await (await fetch(CAPTURE_FONT_SOURCES.googleCss)).text();
            faces.push(...this._parseFontFaces(css));
        } catch (e) {
            // 取得できなかった場合、画像では端末のフォントを使う
        }
        CAPTURE_FONT_SOURCES.local.forEach(f => faces.push({ family: f.family, weight: f.weight, style: 'normal', ranges: null, url: f.url, format: f.format }));

        // 少しずつ取得して埋め込み形式にする
        const queue = [...faces];
        const worker = async () => {
            while (queue.length > 0) {
                const face = queue.shift();
                try {
                    const blob = await (await fetch(face.url)).blob();
                    face.dataUrl = await this._blobToDataUrl(blob);
                    this._fontFaces.push(face);
                } catch (e) {
                    // 取得できなかったファイルは使わない（その文字は端末のフォントになる）
                }
            }
        };
        await Promise.all(Array.from({ length: CAPTURE_FONT_FETCH_CONCURRENCY }, worker));
        this._fontsReady = true;
    }

    /** CSS の @font-face を読み取る（family・weight・style・unicode-range・woff2 の URL） */
    _parseFontFaces(css) {
        const faces = [];
        const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
        blocks.forEach(block => {
            const get = (prop) => (block.match(new RegExp(prop + '\\s*:\\s*([^;]+);')) || [])[1]?.trim();
            const url = (block.match(/url\(([^)]+)\)\s*format\(['"]?(\w+)['"]?\)/) || []);
            if (!url[1]) return;
            const ranges = get('unicode-range')
                ? get('unicode-range').split(',').map(r => {
                    const m = r.trim().replace(/^U\+/i, '').split('-');
                    const from = parseInt(m[0].replace(/\?/g, '0'), 16);
                    const to = m[1] ? parseInt(m[1], 16) : parseInt(m[0].replace(/\?/g, 'F'), 16);
                    return [from, to];
                })
                : null;
            faces.push({
                family: (get('font-family') || '').replace(/['"]/g, ''),
                weight: get('font-weight') || '400',
                style: get('font-style') || 'normal',
                ranges,
                url: url[1].replace(/['"]/g, ''),
                format: url[2] || 'woff2',
            });
        });
        return faces;
    }

    _blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ============================================================
    // 画像化
    // ============================================================

    /** 表示中の LCD を PNG の Blob にする */
    async capture(svgEl, size) {
        // 押した時点の状態を複製する（以降の表示の変化の影響を受けない）
        const clone = svgEl.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        clone.setAttribute('width', String(size.width));
        clone.setAttribute('height', String(size.height));
        clone.style.width = '';
        clone.style.height = '';

        await this._inlineImages(clone);
        this._embedFonts(clone);

        const svgText = new XMLSerializer().serializeToString(clone);
        const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
        try {
            const img = await new Promise((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = reject;
                im.src = svgUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            const ctx = canvas.getContext('2d');
            // 入稿用のため背景は白にする（spec.md 8.4 の 6）
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, size.width, size.height);
            ctx.drawImage(img, 0, 0, size.width, size.height);
            return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        } finally {
            URL.revokeObjectURL(svgUrl);
        }
    }

    /** SVG の中のファイル参照の画像を埋め込み形式にする（取得できない画像は外す） */
    async _inlineImages(svg) {
        const images = Array.from(svg.querySelectorAll('image'));
        await Promise.all(images.map(async (el) => {
            const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
            if (!href || href.startsWith('data:')) return;
            try {
                const blob = await (await fetch(new URL(href, document.baseURI))).blob();
                const dataUrl = await this._blobToDataUrl(blob);
                el.setAttribute('href', dataUrl);
                el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
            } catch (e) {
                el.remove();
            }
        }));
    }

    /** 画面に出ている文字を含むフォントだけを @font-face として SVG に入れる */
    _embedFonts(svg) {
        if (this._fontFaces.length === 0) return;
        const codePoints = new Set();
        for (const ch of svg.textContent || '') codePoints.add(ch.codePointAt(0));
        const used = this._fontFaces.filter(face =>
            !face.ranges || face.ranges.some(([from, to]) => {
                for (const cp of codePoints) if (cp >= from && cp <= to) return true;
                return false;
            })
        );
        const css = used.map(face =>
            `@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};` +
            `src:url(${face.dataUrl}) format("${face.format}");` +
            (face.ranges ? `unicode-range:${face.ranges.map(([a, b]) => `U+${a.toString(16)}-${b.toString(16)}`).join(',')};` : '') + '}'
        ).join('\n');
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = css;
        svg.insertBefore(style, svg.firstChild);
    }

}

export default LcdCapture;
