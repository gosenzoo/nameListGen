// 流用元: C:\document\dev\trainLCD_claude\trainLCD_claude\public\Drawer\src\main\Drawer.js（ES モジュール化して改造。spec.md 8章）
// 改造内容:
//   - ヘッダー／ボディの 2 枚重ねと drawParams.page によるページ切り替えをなくし、テンプレート 1 枚を描画する形にした
//   - 使わない部品（arrange / slot / textBox / numbering / generate / mulShadow）の分岐を削除した
//   - トップレベル要素の lcd-arg を解決して args として部品に渡す（spec.md 8.4 の 1, 2）
//   - TextBlockObj のはみ出し情報を回収する（spec.md 8.4 の 4）
import ExprParser from './ExprParser';
import GroupObj from './GroupObj';
import LcdPartsObj from './LcdPartsObj';
import StaticObj from './StaticObj';
import TextBlockObj from './TextBlockObj';
import TextDrawer from './TextDrawer';

class Drawer {
    constructor() {
        this._drawParams = null;
        this._templateSVG = null;
        this.textDrawer = null;
        this.exprParser = new ExprParser();
        this._overflows = [];
    }

    // 初期化。テンプレートの<svg>要素を受け取り、funcDef/funcCallを事前展開して保持する
    load(templateSVG) {
        this._normalizeSVGDefsRefs(templateSVG);
        this._resolveFuncCalls(templateSVG);
        this._templateSVG = templateSVG;
        // アイコン辞書は使わない（null にすると :キー: のアイコン埋め込みが無効になる）
        this.textDrawer = new TextDrawer(null, null, null);
    }

    // SVG内のlcd-funcDefを収集し、lcd-funcCallをインライン展開する（buildTree前の事前処理）
    // funcDef <g> は収集後にDOMから除去し、funcCall <rect> は展開済み <g> に置換する
    _resolveFuncCalls(svgElement) {
        // ステップ1: トップレベルの lcd-funcDef <g> を収集してDOMから除去
        const funcDefMap = {}; // 関数名 → { areaX, areaY, areaWidth, areaHeight, contentNodes[] }
        for (const child of Array.from(svgElement.children)) {
            const funcName = child.getAttribute ? child.getAttribute('lcd-funcDef') : null;
            if (!funcName) continue;

            // funcArea rectとコンテンツノードを分離
            let areaRect = null;
            const contentNodes = [];
            for (const node of Array.from(child.childNodes)) {
                if (
                    node.nodeType === Node.ELEMENT_NODE &&
                    node.getAttribute && node.getAttribute('lcdParts') === 'funcArea'
                ) {
                    areaRect = node;
                } else {
                    contentNodes.push(node);
                }
            }

            if (areaRect) {
                funcDefMap[funcName] = {
                    areaX:      parseFloat(areaRect.getAttribute('x')      || '0'),
                    areaY:      parseFloat(areaRect.getAttribute('y')      || '0'),
                    areaWidth:  parseFloat(areaRect.getAttribute('width')  || '0'),
                    areaHeight: parseFloat(areaRect.getAttribute('height') || '0'),
                    contentNodes,
                };
            }
            // funcDef <g> 自体はレンダリング不要なのでDOMから除去
            svgElement.removeChild(child);
        }

        // funcDefが1件もなければ即return（querySelectorAll不要）
        if (Object.keys(funcDefMap).length === 0) return;

        // ステップ2: 各funcDefのcontentNodes内のfuncCallを展開する（ネストfuncCall対応）
        // 全funcDef収集後に実行するため、funcDef同士の相互参照が可能
        for (const def of Object.values(funcDefMap)) {
            // contentNodesを一時<g>に格納してquerySelectorAllを使えるようにする
            const tempG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            for (const node of def.contentNodes) tempG.appendChild(node);
            this._expandFuncCallsInContainer(tempG, funcDefMap);
            def.contentNodes = Array.from(tempG.childNodes);
        }

        // ステップ3: SVG全体のlcd-funcCallを展開する
        this._expandFuncCallsInContainer(svgElement, funcDefMap);
    }

    // コンテナ内のすべてのlcd-funcCall rectを展開する（スケール・属性コピー・DOM置換）
    _expandFuncCallsInContainer(container, funcDefMap) {
        // 除外する属性セット（位置・形状・funcCall名はコピー対象外）
        const SKIP_ATTRS = new Set(['lcd-funcCall', 'x', 'y', 'width', 'height', 'fill']);

        for (const rect of Array.from(container.querySelectorAll('[lcd-funcCall]'))) {
            const funcName = rect.getAttribute('lcd-funcCall');
            const def = funcDefMap[funcName];
            if (!def) continue;

            const cx = parseFloat(rect.getAttribute('x')      || '0');
            const cy = parseFloat(rect.getAttribute('y')      || '0');
            const cw = parseFloat(rect.getAttribute('width')  || '0');
            const ch = parseFloat(rect.getAttribute('height') || '0');

            // 非均等スケール（x・y独立）を計算
            const sx = def.areaWidth  > 0 ? cw / def.areaWidth  : 1;
            const sy = def.areaHeight > 0 ? ch / def.areaHeight : 1;
            // funcAreaの左上をcallRectの左上に合わせるtranslateを計算
            const tx = cx - def.areaX * sx;
            const ty = cy - def.areaY * sy;

            // 呼び出し元rectからコピーする追加属性を収集する
            const extraAttrs = Array.from(rect.attributes)
                .filter(a => !SKIP_ATTRS.has(a.name))
                .map(a => ({ name: a.name, value: a.value }));

            // コンテンツのdeepCloneを座標属性直接書き換えでスケールし、
            // ラッパーを挟まず親要素にインライン展開してrectと置換する
            // （ラッパー<g>で包むとlcdPartsなし要素になりArrangeObjにスキップされるため）
            const parent = rect.parentNode;
            for (const node of def.contentNodes) {
                const cloned = node.cloneNode(true);
                if (cloned.nodeType === Node.ELEMENT_NODE) {
                    this._scaleNode(cloned, sx, sy, tx, ty);
                    // 呼び出し元の追加属性をトップレベルクローン要素にコピーする（既存属性は上書き）
                    for (const { name, value } of extraAttrs) {
                        cloned.setAttribute(name, value);
                    }
                }
                parent.insertBefore(cloned, rect);
            }
            parent.removeChild(rect);
        }
    }

    // SVG要素の座標属性を直接書き換えてスケール・移動を適用する（再帰）
    // transformではなく属性値を変換するため、filter等の効果がスケール後座標に正しく適用される
    // translate(a,b) 形式のtransform属性はbake-inして除去する
    // 解析困難なtransform（rotate等）はtranslate+scaleを前合成して終了（子再帰不要）
    _scaleNode(el, sx, sy, tx, ty) {
        const existingTransform = el.getAttribute ? el.getAttribute('transform') : null;
        let csx = sx, csy = sy, ctx = tx, cty = ty;

        if (existingTransform !== null) {
            // translate(a,b) のみ解析してtx/tyにbake-in、transformを除去して子再帰へ
            const m = existingTransform.trim().match(/^translate\(\s*([-\d.e+]+)[,\s]\s*([-\d.e+]+)\s*\)$/);
            if (m) {
                ctx = parseFloat(m[1]) * sx + tx;
                cty = parseFloat(m[2]) * sy + ty;
                el.removeAttribute('transform');
            } else {
                // 解析困難なtransformはスケール変換を前合成してリターン（子はtransform管理）
                el.setAttribute('transform', `translate(${tx},${ty}) scale(${sx},${sy}) ${existingTransform}`);
                return;
            }
        }

        const tag = (el.tagName || '').replace(/^svg:/, '').toLowerCase();
        const sa  = (name, fn) => { const v = el.getAttribute(name); if (v !== null && v !== '') el.setAttribute(name, fn(parseFloat(v))); };
        const scX = v => v * csx + ctx;
        const scY = v => v * csy + cty;
        const scW = v => v * csx;
        const scH = v => v * csy;

        if (tag === 'rect' || tag === 'image' || tag === 'foreignobject') {
            sa('x', scX); sa('y', scY); sa('width', scW); sa('height', scH);
        } else if (tag === 'circle') {
            sa('cx', scX); sa('cy', scY);
            sa('r', v => v * Math.min(csx, csy));
        } else if (tag === 'ellipse') {
            sa('cx', scX); sa('cy', scY); sa('rx', scW); sa('ry', scH);
        } else if (tag === 'line') {
            sa('x1', scX); sa('y1', scY); sa('x2', scX); sa('y2', scY);
        } else if (tag === 'text' || tag === 'tspan') {
            sa('x', scX); sa('y', scY); sa('dx', scW); sa('dy', scH);
        } else if (tag === 'use') {
            sa('x', scX); sa('y', scY); sa('width', scW); sa('height', scH);
        } else if (tag === 'polygon' || tag === 'polyline') {
            const pts = el.getAttribute('points');
            if (pts) {
                const nums = pts.trim().split(/[\s,]+/).map(parseFloat);
                el.setAttribute('points', nums.map((v, i) => i % 2 === 0 ? v * csx + ctx : v * csy + cty).join(' '));
            }
        } else if (tag === 'path') {
            const d = el.getAttribute('d');
            if (d) el.setAttribute('d', this._scalePath(d, csx, csy, ctx, cty));
        }

        // lcdParts="text" の行間（interval）も縦の倍率で拡大縮小する（spec.md 8.4 の 8）
        if (el.getAttribute && el.getAttribute('lcdParts') === 'text') sa('interval', scH);

        // 子要素に再帰（<g>等コンテナ向け）
        for (const child of Array.from(el.children)) {
            this._scaleNode(child, csx, csy, ctx, cty);
        }
    }

    // SVGパスのd属性を非均等スケール変換する
    // 絶対コマンドはsx/sy+tx/tyを適用し、相対コマンドはsx/syのみ適用する
    _scalePath(d, sx, sy, tx, ty) {
        const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:[0-9]*\.)?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || [];
        const out = [];
        let i = 0;
        const isNum = () => i < tokens.length && /^[-+]?[0-9.]/.test(tokens[i]);
        const n    = () => parseFloat(tokens[i++]);
        const raw  = () => tokens[i++]; // フラグ等スケールしない値をそのまま取得

        while (i < tokens.length) {
            const cmd = tokens[i++];
            switch (cmd) {
                // 絶対 x,y ペア×N
                case 'M': case 'L': case 'T':
                    out.push(cmd);
                    while (isNum()) out.push(`${n()*sx+tx},${n()*sy+ty}`);
                    break;
                // 相対 dx,dy ペア×N
                case 'm': case 'l': case 't':
                    out.push(cmd);
                    while (isNum()) out.push(`${n()*sx},${n()*sy}`);
                    break;
                case 'H': out.push(cmd); while (isNum()) out.push(n()*sx+tx); break;
                case 'h': out.push(cmd); while (isNum()) out.push(n()*sx);    break;
                case 'V': out.push(cmd); while (isNum()) out.push(n()*sy+ty); break;
                case 'v': out.push(cmd); while (isNum()) out.push(n()*sy);    break;
                // 絶対 C: x1,y1 x2,y2 x,y ×N
                case 'C':
                    out.push(cmd);
                    while (isNum()) out.push(`${n()*sx+tx},${n()*sy+ty} ${n()*sx+tx},${n()*sy+ty} ${n()*sx+tx},${n()*sy+ty}`);
                    break;
                case 'c':
                    out.push(cmd);
                    while (isNum()) out.push(`${n()*sx},${n()*sy} ${n()*sx},${n()*sy} ${n()*sx},${n()*sy}`);
                    break;
                // 絶対 S,Q: xy×2 ×N
                case 'S': case 'Q':
                    out.push(cmd);
                    while (isNum()) out.push(`${n()*sx+tx},${n()*sy+ty} ${n()*sx+tx},${n()*sy+ty}`);
                    break;
                case 's': case 'q':
                    out.push(cmd);
                    while (isNum()) out.push(`${n()*sx},${n()*sy} ${n()*sx},${n()*sy}`);
                    break;
                // 絶対 A: rx ry xRot largeArcFlag sweepFlag x y ×N
                case 'A':
                    out.push(cmd);
                    while (isNum()) {
                        const rx = n()*sx, ry = n()*sy;
                        const rot = raw(), laf = raw(), sf = raw();
                        out.push(`${rx},${ry} ${rot} ${laf},${sf} ${n()*sx+tx},${n()*sy+ty}`);
                    }
                    break;
                case 'a':
                    out.push(cmd);
                    while (isNum()) {
                        const rx = n()*sx, ry = n()*sy;
                        const rot = raw(), laf = raw(), sf = raw();
                        out.push(`${rx},${ry} ${rot} ${laf},${sf} ${n()*sx},${n()*sy}`);
                    }
                    break;
                case 'Z': case 'z': out.push(cmd); break;
                default: out.push(cmd);
            }
        }
        return out.join(' ');
    }

    // url(./defs.svg#id) をローカル参照 url(#id) に変換する（後方互換のため維持）
    _normalizeSVGDefsRefs(svgElement) {
        const pattern = /url\(\.\/defs\.svg#([^)]+)\)/g;
        svgElement.querySelectorAll('*').forEach(el => {
            for (const attr of Array.from(el.attributes)) {
                if (attr.value.includes('./defs.svg#')) {
                    el.setAttribute(attr.name, attr.value.replace(pattern, 'url(#$1)'));
                }
            }
        });
    }

    // テンプレートのdefsを複製した<defs>要素を返す
    _collectDefs() {
        const defsEl = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const defs = this._templateSVG.querySelector('defs');
        if (defs) {
            for (const child of Array.from(defs.children)) defsEl.appendChild(child.cloneNode(true));
        }
        return defsEl;
    }

    // オブジェクトツリーを構築し、<defs>とコンテンツ<g>をまとめたDocumentFragmentを返す
    draw(drawParams) {
        this._drawParams = drawParams;
        this._overflows = [];
        const defsEl = this._collectDefs();

        // オブジェクトツリーを構築してgetElementで描画
        this.buildTree();
        const resolveValue = name => this._resolveValue(name);
        // overflowSink: TextBlockObj がはみ出した行を報告する先
        const ctx = { resolveValue, exprParser: this.exprParser, overflowSink: this._overflows };

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const rootEl = this.root.getElement(ctx);
        if (rootEl) g.appendChild(rootEl);

        // <defs>とコンテンツ<g>をDocumentFragmentにまとめて返す
        const fragment = document.createDocumentFragment();
        fragment.appendChild(defsEl);
        fragment.appendChild(g);
        return fragment;
    }

    // 直前の draw で、枠に収まらず描画されなかったテキストの一覧を返す
    // 各要素: { field: lcd-overflow の値, args: その部品に渡された args, droppedLines: 行数 }
    getOverflows() {
        return this._overflows;
    }

    // テンプレートSVGからオブジェクトツリーを構築してthis.rootに設定する
    buildTree() {
        this.root = new GroupObj(null);
        const childArr = Array.from(this._templateSVG.children).filter(c => c.getAttribute);
        for (const child of childArr) {
            // defs要素はオブジェクト化しない
            if (child.tagName && child.tagName.toLowerCase() === 'defs') continue;

            // トップレベル要素の lcd-arg="引数名:パス" を解決する
            const lcdArg = child.getAttribute('lcd-arg');
            if (lcdArg && lcdArg.includes(':')) {
                const colonIdx = lcdArg.indexOf(':');
                const argName  = lcdArg.slice(0, colonIdx).trim();
                const varName  = lcdArg.slice(colonIdx + 1).trim();
                const value    = LcdPartsObj.resolveDrawParam(varName, this._drawParams);
                // 値がない（そのページの人数が足りない等）場合は描画しない
                if (value === undefined || value === null) continue;
                // 配列なら要素ごとに複製し、配列でなければそのまま 1 つ渡す
                const values = Array.isArray(value) ? value : [value];
                for (const v of values) {
                    const node = this._buildNode(child, { [argName]: v });
                    if (node) this.root.addChild(node);
                }
                continue;
            }

            const node = this._buildNode(child, {});
            if (node) this.root.addChild(node);
        }
    }

    // SVG要素をlcdPartsに応じてオブジェクトに変換する。
    // lcdPartsなし → null（子孫ごとスキップ）
    // args: lcd-arg で渡された引数（#{$名前...} や isDraw="$名前..." から参照される）
    _buildNode(element, args) {
        // isDraw属性が静的評価でfalseならツリーに追加しない（argsも参照できるようにする）
        const isDrawAttr = element.getAttribute ? element.getAttribute('isDraw') : null;
        if (isDrawAttr !== null) {
            const resolveValue = LcdPartsObj.makeResolveValue(this._drawParams, args);
            if (!this.exprParser.eval(isDrawAttr, resolveValue)) return null;
        }

        const lcdParts = element.getAttribute ? element.getAttribute('lcdParts') : null;
        const tagName  = element.tagName ? element.tagName.toLowerCase() : '';

        if (tagName === 'svg' || lcdParts === 'group') {
            // グループとして子要素を再帰的にオブジェクト化（argsは子へ引き継ぐ）
            const group = new GroupObj(element);
            for (const child of Array.from(element.children).filter(c => c.getAttribute)) {
                const node = this._buildNode(child, args);
                if (node) group.addChild(node);
            }
            return group;
        } else if (lcdParts === 'static') {
            return new StaticObj(element, this._drawParams, null, args);
        } else if (lcdParts === 'text') {
            // lcdParts="text" → TextBlockObj（改行対応テキストブロック）
            return new TextBlockObj(element, this._drawParams, args, this.textDrawer);
        }
        // lcdPartsなし（またはunknown値）: 子孫ごとスキップ
        return null;
    }

    // drawParamsからドット記法で値を解決し、生の値を返す（true/false リテラルにも対応）
    _resolveValue(token) {
        token = token.trim();
        if (token === 'true')  return true;
        if (token === 'false') return false;
        // 数値定数
        const num = Number(token);
        if (token !== '' && !isNaN(num)) return num;
        // ドット記法でdrawParamsを辿る
        const keys = token.split('.');
        let val = this._drawParams;
        for (const key of keys) {
            if (val === null || val === undefined) return undefined;
            val = val[key];
        }
        return val;
    }
}

export default Drawer;
