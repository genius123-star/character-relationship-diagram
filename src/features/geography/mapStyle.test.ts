import { describe, expect, it } from "vitest";
import { buildBasemapStyle, levelNameForZoom, levelLabel, zoomForLevel, OFFLINE_OUTLINE_URL } from "./GeographyCanvas";
import { createGraticule } from "./graticule";

type Layer = { id: string; type: string; source?: string; "source-layer"?: string; layout?: Record<string, unknown>; filter?: unknown; minzoom?: number };

describe("map basemap style density budget", () => {
  const style = buildBasemapStyle();
  const layers = style.layers as unknown as Layer[];

  it("only enables coastlines, boundaries, water, places and mountains", () => {
    // 不包含道路、建筑、POI、卫星或等高线
    const ids = layers.map((layer) => layer.id).join(",");
    expect(ids).not.toMatch(/road|building|poi|satellite|contour|transport/i);
    expect(layers.some((layer) => layer.id === "water")).toBe(true);
    expect(layers.some((layer) => layer.id === "boundary-country")).toBe(true);
    expect(layers.some((layer) => layer.id === "place-city")).toBe(true);
  });

  it("adds country/state labels, secondary boundaries and waterways", () => {
    const ids = layers.map((layer) => layer.id);
    expect(ids).toEqual(expect.arrayContaining(["place-country", "place-state", "boundary-admin2", "waterway", "water-river", "water-name-river"]));
    const waterway = layers.find((layer) => layer.id === "waterway");
    expect(waterway?.minzoom).toBe(3);
    const admin2 = layers.find((layer) => layer.id === "boundary-admin2");
    expect(admin2?.minzoom).toBe(10);
  });

  it("turns on collision avoidance and deduplication for every symbol layer", () => {
    const symbolLayers = layers.filter((layer) => layer.type === "symbol");
    expect(symbolLayers.length).toBeGreaterThan(0);
    for (const layer of symbolLayers) {
      expect(layer.layout?.["text-allow-overlap"]).toBe(false);
      expect(layer.layout?.["text-ignore-placement"]).toBe(true);
    }
  });

  it("uses min_zoom to reveal more detail as zoom increases", () => {
    const town = layers.find((layer) => layer.id === "place-town");
    const city = layers.find((layer) => layer.id === "place-city");
    const capital = layers.find((layer) => layer.id === "place-capital");
    expect(town?.minzoom).toBeGreaterThanOrEqual(city?.minzoom ?? 0);
    expect(city?.minzoom).toBeGreaterThanOrEqual(capital?.minzoom ?? 0);
  });

  it("keeps an offline outline source for disconnected fallback, visible until tiles arrive", () => {
    const sources = style.sources as Record<string, { type: string; data?: string }>;
    expect(sources["offline-outline"]?.type).toBe("geojson");
    expect(sources["offline-outline"]?.data).toBe(OFFLINE_OUTLINE_URL);
    // 离线轮廓默认可见：style 就绪但瓦片未到时提供世界轮廓，避免空白；
    // 瓦片就绪后由运行时 syncOfflineOutline 隐藏，避免与真实海岸线形成双重线。
    const outline = layers.find((layer) => layer.id === "offline-outline");
    expect(outline?.layout?.["visibility"]).toBe("visible");
  });

  it("includes a graticule layer for the mercator view", () => {
    expect(layers.some((layer) => layer.id === "graticule")).toBe(true);
    const grid = layers.find((layer) => layer.id === "graticule");
    expect(grid?.source).toBe("graticule");
    expect(grid?.minzoom).toBe(1.5);
  });
});

describe("createGraticule", () => {
  it("generates meridian and parallel lines every 15 degrees", () => {
    const grid = createGraticule();
    const meridians = grid.features.filter((f) => f.properties?.kind === "meridian");
    const parallels = grid.features.filter((f) => f.properties?.kind === "parallel");
    // 经线：-180..180 每 15°（含两端）= 25 条；纬线：-90..90 每 15° = 13 条。
    expect(meridians.length).toBe(25);
    expect(parallels.length).toBe(13);
  });
});

describe("levelNameForZoom", () => {
  it("maps zoom ranges to semantic levels without mutating the camera", () => {
    expect(levelNameForZoom(0.5)).toBe("global");
    expect(levelNameForZoom(1.4)).toBe("global");
    expect(levelNameForZoom(2)).toBe("continent");
    expect(levelNameForZoom(4)).toBe("country");
    expect(levelNameForZoom(7)).toBe("region");
  });

  it("labels levels in Chinese", () => {
    expect(levelLabel("global")).toBe("全球");
    expect(levelLabel("continent")).toBe("洲际");
    expect(levelLabel("country")).toBe("国家");
    expect(levelLabel("region")).toBe("地区或省州");
  });

  it("returns a sensible zoom for each level", () => {
    expect(zoomForLevel("global")).toBe(0.8);
    expect(zoomForLevel("continent")).toBe(2.2);
    expect(zoomForLevel("country")).toBe(4);
    expect(zoomForLevel("region")).toBe(6.5);
  });
});
