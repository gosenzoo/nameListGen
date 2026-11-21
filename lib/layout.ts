// ページとブロックの寸法（spec.md 6章・7.1）。単位は px（350dpi）

// ページのピクセル数（B5 + 塗り足し 3mm）
export const PAGE_WIDTH = 2591;
export const PAGE_HEIGHT = 3624;

// 仕上がり線（塗り足し 3mm）と安全領域の、ページ端からの距離
export const TRIM = 41;
export const SAFE = 110;

// 参加者ブロックの大きさ（横 85:縦 57.5）と配置（縦 4 × 横 2）
export const BLOCK_WIDTH = 1130;
export const BLOCK_HEIGHT = 764;
export const BLOCK_XS = [110, 1351];
export const BLOCK_YS = [110, 990, 1870, 2750];

// ブロックの並び順（左上から右へ、次の段へ）での左上座標
export const BLOCK_ORIGINS = BLOCK_YS.flatMap((y) => BLOCK_XS.map((x) => ({ x, y })));
