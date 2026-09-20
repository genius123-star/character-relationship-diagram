// 下载自托管地图字形：把 MapLibre glyph 服务依赖从 demotiles.maplibre.org
// 收敛到 public/glyphs（避免公共字体服务不可达时标签缺字形）。
// 只下载拉丁/符号常用块；CJK 由 MapLibre localIdeographFontFamily 走浏览器本地字体渲染。
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FONT_STACK = "Noto Sans Regular";
const BASE = "https://demotiles.maplibre.org/font";
// 块 0-17（U+0000-U+46FF：拉丁、希腊、西里尔、谚文等）+ 块 32/33（通用标点、箭头）+ 块 48（CJK 标点、假名）。
const BLOCKS = [...Array.from({ length: 18 }, (_, index) => index), 32, 33, 48];
const OUT_DIR = path.resolve("public/glyphs", FONT_STACK);

for (const block of BLOCKS) {
  const begin = block * 256;
  const end = begin + 255;
  const name = `${begin}-${end}.pbf`;
  const url = `${BASE}/${encodeURIComponent(FONT_STACK)}/${name}`;
  const response = await fetch(url, { headers: { "User-Agent": "character-graph/0.1 (local-first relationship graph)" } });
  if (!response.ok) {
    console.warn(`skip ${name}: HTTP ${response.status}`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, name), bytes);
  console.log(`downloaded ${name} (${bytes.length} bytes)`);
}

console.log(`done -> ${OUT_DIR}`);
