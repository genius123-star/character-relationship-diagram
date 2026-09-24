import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMapInstance, GeoJSONSource } from "maplibre-gl";
import type { JourneyStop, Person, PersonGeo, ProjectDocument, RelationshipKind } from "../../domain/model";
import { getObservationState } from "../../domain/observationProgress";
import { geocodeCandidates, resolveKnownPlace, type GeocodeCandidate, type GeoLocation } from "./geocoding";
import { createGraticule } from "./graticule";
import { screenArrowPolygon } from "./relationshipArrows";

export interface MapKernelHandle {
  /** 只由“适应全部节点”或显式用户操作调用；普通拖动/缩放不得触发。 */
  fitAll(): void;
  fitBoundsTo(bounds: [number, number, number, number]): void;
  getZoom(): number;
  getCenter(): [number, number];
  dispose(): void;
}

export type GeographyViewLevel = "global" | "continent" | "country" | "region";

// 打开地理图时预取 MapLibre 动态分包，缩短"进入地理图→地图可交互"的等待；
// 非地理图项目不会触发下载（保持按需加载）。
export function prefetchMapLibre(graphType?: string): void {
  if (graphType === "geography") {
    void import("maplibre-gl").catch(() => { /* 预取失败不影响正式加载 */ });
  }
}

export function levelNameForZoom(zoom: number): GeographyViewLevel {
  if (zoom < 1.5) return "global";
  if (zoom < 3.2) return "continent";
  if (zoom < 5.5) return "country";
  return "region";
}

export function levelLabel(level: GeographyViewLevel): string {
  return level === "global" ? "全球" : level === "continent" ? "洲际" : level === "country" ? "国家" : "地区或省州";
}

export function zoomForLevel(level: GeographyViewLevel): number {
  return level === "global" ? 0.8 : level === "continent" ? 2.2 : level === "country" ? 4 : 6.5;
}

// 断网/未加载时回退的极简世界轮廓。
export const OFFLINE_OUTLINE_URL = "/map-data/world-outline.geojson";

// 底图矢量瓦片归档（可配置单一端点）。默认 OpenFreeMap 全球底图（TileJSON + MVT，无需 Key）。
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/planet";

// 投影随 zoom 连续插值：3D 球体（vertical-perspective）保持到 zoom 2.6，
// 2.6–3.4 平滑展开为平面（mercator），便于用户在 3D 球上查看跨区域节点分布。
// 端点必须用 vertical-perspective（"globe" 常量端点不会进入 transitionState 插值）。
const PROJECTION_EXPRESSION = [
  "interpolate", ["linear"], ["zoom"],
  2.6, "vertical-perspective",
  3.4, "mercator",
] as unknown as NonNullable<import("maplibre-gl").ProjectionSpecification["type"]>;

// 图层开关分组：只控制样式可见性，绝不改写相机。
const BASEMAP_LAYER_GROUPS = {
  boundaries: ["boundary-country", "boundary-admin1", "boundary-admin2", "boundary-admin3"],
  labels: ["place-country", "place-capital", "place-city-rank", "place-city", "place-state", "place-town", "place-suburb", "water-name", "water-name-river", "mountain-peak"],
  graticule: ["graticule"],
} as const;
const LAYER_VISIBILITY_DEFAULT = { boundaries: true, labels: true, graticule: true };

export type RelationshipKindForStyle = RelationshipKind;

interface LazyMaplibreExports {
  Map: typeof MapLibreMapInstance;
  addProtocol: typeof import("maplibre-gl").addProtocol;
  LngLatBounds: typeof import("maplibre-gl").LngLatBounds;
  setWorkerUrl: typeof import("maplibre-gl").setWorkerUrl;
}

let maplibrePromise: Promise<LazyMaplibreExports> | undefined;

/**
 * 懒加载 maplibre-gl（仅在需要时下载，缓解主 JS chunk 偏大问题）。
 * 首次调用时同步注册 pmtiles 协议，并加载与 maplibre 同一份 bundle。
 */
export function loadMaplibre(): Promise<LazyMaplibreExports> {
  maplibrePromise ??= import("maplibre-gl").then(async (mod) => {
    // 注册 pmtiles 协议（单一端点归档，按 Range 按视口读取），供 `pmtiles://` 底图 URL 使用。
    processPmtilesProtocol(mod.addProtocol);
    // 指向 public/ 下的干净 module worker（worker + 其 shared 依赖），
    // 避免 Vite 开发模式把 @vite/client 注入到 worker 导致 import 报错；生产构建同样复用此副本。
    if (mod.setWorkerUrl) {
      mod.setWorkerUrl("/maplibre-gl-worker.mjs");
    }
    return { Map: mod.Map, addProtocol: mod.addProtocol, LngLatBounds: mod.LngLatBounds, setWorkerUrl: mod.setWorkerUrl };
  });
  return maplibrePromise;
}

/** 注册 PMTiles 矢量协议到 MapLibre，使 `pmtiles://` source URL 生效。 */
function processPmtilesProtocol(addProtocol: (id: string, loadFn: (params: import("maplibre-gl").RequestParameters, abortController: AbortController) => Promise<import("maplibre-gl").GetResourceResponse<unknown>>) => void): void {
  void import("pmtiles").then(({ Protocol }) => {
    const protocol = new Protocol({ metadata: true });
    addProtocol("pmtiles", protocol.tilev4 as never);
  }).catch(() => {
    // 协议注册失败不阻断地图容器（回退到离线轮廓）。
  });
}

/**
 * 组装极简底图样式：只启用海岸线、边界、水系、地名与必要山地图例；
 * 不显示道路、建筑、POI、卫星或等高线。信息密度由 min_zoom/class/rank 过滤，
 * 符号层开启碰撞避让与同名去重，保证标签不覆盖人物节点。
 */
export function buildBasemapStyle(): import("maplibre-gl").StyleSpecification {
  return {
    version: 8,
    // 自托管字形（scripts/fetch-glyphs.mjs 下载到 public/glyphs），避免依赖 demotiles 公共字体服务。
    // 中文字形由 MapLibre 默认 localIdeographFontFamily("sans-serif") 走浏览器本地字体渲染。
    glyphs: "/glyphs/{fontstack}/{range}.pbf",
    // 投影由渲染器每帧插值；运行时按缩放手势锁定/恢复（见 dragstart/zoomstart 逻辑），
    // 避免拖动引起的 zoom 抖动导致球↔平面突变。
    projection: { type: PROJECTION_EXPRESSION },
    sources: {
      openfreemap: {
        type: "vector",
        tiles: ["https://tiles.openfreemap.org/planet/20260802_080001_pt/{z}/{x}/{y}.pbf"],
        maxzoom: 14,
        attribution: "© OpenFreeMap",
      },
      "graticule": {
        type: "geojson",
        data: createGraticule(),
      } as unknown as import("maplibre-gl").GeoJSONSourceSpecification,
      "offline-outline": {
        type: "geojson",
        data: OFFLINE_OUTLINE_URL,
      } as unknown as import("maplibre-gl").GeoJSONSourceSpecification,
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#eef1f6" } },
      // 经纬网（默认开启，仅在墨卡托平面档显示；globe 档由 MapLibre 自带经纬网）
      {
        id: "graticule",
        type: "line",
        source: "graticule",
        minzoom: 1.5,
        layout: { visibility: "visible" },
        paint: { "line-color": "#c6ccd6", "line-width": 1, "line-opacity": 0.6 },
      },
      // 离线世界轮廓：只在断网/未加载时显示（联网后由组件隐藏）。
      {
        id: "offline-outline",
        type: "line",
        source: "offline-outline",
        // 默认可见：style 就绪但瓦片尚未到达时提供世界轮廓，避免空白；瓦片就绪后由
        // syncOfflineOutline 隐藏，消除与真实海岸线的双重线。
        layout: { visibility: "visible" },
        paint: { "line-color": "#cdd3dd", "line-width": 1.5 },
      },
      // 水面（仅海洋与主要水域）
      {
        id: "water",
        type: "fill",
        source: "openfreemap",
        "source-layer": "water",
        filter: ["in", ["get", "class"], ["literal", ["ocean", "lake"]]],
        paint: { "fill-color": "#cfe0ee" },
      },
      // 河流水面（z8 起数据中出现 river 面）
      {
        id: "water-river",
        type: "fill",
        source: "openfreemap",
        "source-layer": "water",
        minzoom: 8,
        filter: ["==", ["get", "class"], "river"],
        paint: { "fill-color": "#bcd7e8" },
      },
      // 河流径流（线状水系，z4 起有 river 数据）
      {
        id: "waterway",
        type: "line",
        source: "openfreemap",
        "source-layer": "waterway",
        minzoom: 3,
        filter: ["in", ["get", "class"], ["literal", ["river", "canal", "stream"]]],
        paint: { "line-color": "#9cc7dd", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.2, 12, 2] },
      },
      {
        id: "water-name",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "water_name",
        minzoom: 2,
        filter: ["in", ["get", "class"], ["literal", ["ocean", "sea", "lake"]]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "symbol-placement": "line", "symbol-avoid-edges": true, "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#7a8ba3", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      {
        id: "water-name-river",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "water_name",
        minzoom: 6,
        filter: ["in", ["get", "class"], ["literal", ["river", "canal"]]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 10, "symbol-placement": "line", "symbol-avoid-edges": true, "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#7a8ba3", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
      },
      // 陆地
      {
        id: "land",
        type: "fill",
        source: "openfreemap",
        "source-layer": "landcover",
        minzoom: 0,
        filter: ["!=", ["get", "class"], "water"],
        paint: { "fill-color": "#f4f6f9" },
      },
      // 行政边界：国界常显，一级/二级按 zoom 渐变
      {
        id: "boundary-country",
        type: "line",
        source: "openfreemap",
        "source-layer": "boundary",
        minzoom: 0,
        filter: ["==", ["get", "admin_level"], 2],
        paint: { "line-color": "#9aa6b8", "line-width": 1.4 },
      },
      {
        id: "boundary-admin1",
        type: "line",
        source: "openfreemap",
        "source-layer": "boundary",
        minzoom: 3.5,
        filter: ["==", ["get", "admin_level"], 4],
        paint: { "line-color": "#c2cbd8", "line-width": 1, "line-dasharray": [2, 2] },
      },
      // 二级行政区边界（z10 起数据中出现 admin_level 6；z12 尝试 admin_level 8）
      {
        id: "boundary-admin2",
        type: "line",
        source: "openfreemap",
        "source-layer": "boundary",
        minzoom: 10,
        filter: ["==", ["get", "admin_level"], 6],
        paint: { "line-color": "#d3dbe5", "line-width": 0.8, "line-dasharray": [2, 3] },
      },
      {
        id: "boundary-admin3",
        type: "line",
        source: "openfreemap",
        "source-layer": "boundary",
        minzoom: 12,
        filter: ["==", ["get", "admin_level"], 8],
        paint: { "line-color": "#dde4ec", "line-width": 0.6, "line-dasharray": [1, 3] },
      },
      // 地名：按 rank（重要性，值越小越重要）分层 + 碰撞避让 + 同名去重
      {
        id: "place-country",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "place",
        minzoom: 0.5,
        filter: ["all", ["==", ["get", "class"], "country"], ["<=", ["get", "rank"], 4]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#4a5568", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      {
        id: "place-capital",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "place",
        minzoom: 0,
        filter: ["all", ["==", ["get", "class"], "city"], ["==", ["get", "capital"], 2]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#4a5568", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      {
        id: "place-city-rank",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "place",
        minzoom: 1,
        filter: ["all", ["==", ["get", "class"], "city"], ["<=", ["get", "rank"], 4]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#5a677a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "place",
        minzoom: 2.5,
        filter: ["all", ["==", ["get", "class"], "city"], [">", ["get", "rank"], 4]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#5a677a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      // 州/省（z4 起数据中出现 state/province，rank 控制密度）
      {
        id: "place-state",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "place",
        minzoom: 4,
        filter: ["all", ["in", ["get", "class"], ["literal", ["state", "province"]]], ["<=", ["get", "rank"], 6]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#5a677a", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "place",
        minzoom: 4.5,
        filter: ["in", ["get", "class"], ["literal", ["town", "village"]]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#66748a", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
      },
      // 市郊/街区（z12 起；数据中存在才显示）
      {
        id: "place-suburb",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "place",
        minzoom: 12,
        filter: ["all", ["in", ["get", "class"], ["literal", ["suburb", "quarter"]]], ["<=", ["get", "rank"], 10]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#748096", "text-halo-color": "#ffffff", "text-halo-width": 1 },
      },
      // 山地图例（symbol，rank 过滤 + 碰撞避让）
      {
        id: "mountain-peak",
        type: "symbol",
        source: "openfreemap",
        "source-layer": "mountain_peak",
        minzoom: 6,
        filter: ["<=", ["get", "rank"], 10],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 9, "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": true },
        paint: { "text-color": "#8a8f9e", "text-halo-color": "#ffffff", "text-halo-width": 1 },
      },
    ],
  };
}

interface GeographyCanvasProps {
  project: ProjectDocument;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onConnect?: (sourcePersonId: string, targetPersonId: string, kind: RelationshipKind) => void;
  onMarqueeSelect?: (personIds: string[], relationshipIds: string[], additive?: boolean) => void;
  relationshipKind?: RelationshipKind;
  onPersonGeoChange?: (personId: string, geo: PersonGeo | undefined) => void;
  focusPersonIds?: string[];
  observationChapter?: number;
  journeyStops?: JourneyStop[];
  selectedStopId?: string;
  onSelectStop?: (stopId: string | undefined) => void;
}

export function GeographyCanvas({
  project,
  selectedId: _selectedId,
  onSelect: _onSelect,
  onConnect: _onConnect,
  onMarqueeSelect: _onMarqueeSelect,
  relationshipKind: _relationshipKind,
  onPersonGeoChange: _onPersonGeoChange,
  focusPersonIds = [],
  observationChapter,
  journeyStops,
  selectedStopId: _selectedStopId,
  onSelectStop: _onSelectStop,
}: GeographyCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const handleRef = useRef<MapKernelHandle | null>(null);
  const connectionSourceIdRef = useRef<string | undefined>(undefined);
  const connectionSourceLocationRef = useRef<[number, number] | undefined>(undefined);
  const latestRef = useRef({ computeBounds: undefined as (() => [number, number, number, number] | undefined) | undefined, onSelect: _onSelect, onConnect: _onConnect, onMarqueeSelect: _onMarqueeSelect, relationshipKind: _relationshipKind, onPersonGeoChange: _onPersonGeoChange, onSelectStop: _onSelectStop });

  const [viewLevel, setViewLevel] = useState<GeographyViewLevel>("global");
  const [zoomLevel, setZoomLevel] = useState(0.8);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [mapInstance, setMapInstance] = useState<MapLibreMapInstance | null>(null);
  const [mapLoadState, setMapLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [mapInitNonce, setMapInitNonce] = useState(0);
  const [layerVisibility, setLayerVisibility] = useState(() => {
    try {
      const raw = localStorage.getItem("character-graph:geography:layers");
      if (raw) return { boundaries: true, labels: true, graticule: true, ...JSON.parse(raw) as Partial<typeof LAYER_VISIBILITY_DEFAULT> };
    } catch { /* 本地图层设置损坏时使用默认值 */ }
    return LAYER_VISIBILITY_DEFAULT;
  });
  const [connectionHintVisible, setConnectionHintVisible] = useState(false);
  const [geoResolveState, setGeoResolveState] = useState<Record<string, "resolving" | "error">>({});
  const [candidatesByPerson, setCandidatesByPerson] = useState<Record<string, GeocodeCandidate[]>>({});
  const [geoRetryNonce, setGeoRetryNonce] = useState(0);
  const geoAttemptedRef = useRef(new Map<string, string>());
  const observationState = useMemo(
    () => (observationChapter === undefined ? undefined : getObservationState(project, observationChapter)),
    [project, observationChapter],
  );
  // 行程站点覆盖物：未到达（chapter 晚于当前观察章节）的站点淡化。
  const stopsGeoJson = useMemo(() => {
    const features = (journeyStops ?? []).map((stop) => ({
      type: "Feature" as const,
      properties: {
        id: stop.id,
        label: stop.label,
        selected: _selectedStopId === stop.id,
        future: observationChapter !== undefined && stop.chapter !== undefined && stop.chapter.value > observationChapter,
      },
      geometry: { type: "Point" as const, coordinates: [stop.longitude, stop.latitude] },
    }));
    return { type: "FeatureCollection", features } as GeoJSON.FeatureCollection;
  }, [journeyStops, observationChapter, _selectedStopId]);

  // 地点解析结果优先使用人物已确认的 geo；未确认时回退到本地已知地点（旧数据兼容）。
  function resolvedLocationFor(person: Person): GeoLocation | undefined {
    if (person.geo) {
      return { label: person.geo.label, longitude: person.geo.longitude, latitude: person.geo.latitude, countryCode: person.geo.countryCode, continent: person.geo.continent };
    }
    return resolveKnownPlace(person.affiliation);
  }

  // computeBounds 定义在 useEffect 同级，供 mapHandle.fitAll 中的闭包引用
  const computeBounds = useCallback((): [number, number, number, number] | undefined => {
    const lons: number[] = [];
    const lats: number[] = [];
    for (const person of project.people) {
      const location = resolvedLocationFor(person);
      if (location) { lons.push(location.longitude); lats.push(location.latitude); }
    }
    if (!lons.length) return undefined;
    return [
      Math.min(...lons), Math.min(...lats),
      Math.max(...lons), Math.max(...lats),
    ];
  }, [project.people]);

  // 每次渲染后把最新回调/计算函数同步到 ref，供 map 的长生命周期监听读取。
  useEffect(() => {
    latestRef.current = { computeBounds, onSelect: _onSelect, onConnect: _onConnect, onMarqueeSelect: _onMarqueeSelect, relationshipKind: _relationshipKind, onPersonGeoChange: _onPersonGeoChange, onSelectStop: _onSelectStop };
  });

  // 右键从空白处拖动：使用屏幕坐标框选地图上的人物；右键点人物仍交给地图的连线处理。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const box = document.createElement("div");
    box.className = "graph-marquee";
    box.style.cssText = "position:absolute;display:none;pointer-events:none;z-index:8;border:1px dashed #6157d8;background:rgb(97 87 216 / 10%)";
    container.append(box);
    let start: { x: number; y: number } | undefined;
    let additive = false;
    const point = (event: PointerEvent) => { const rect = container.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    const suppressContextMenu = (event: MouseEvent) => {
      // Keep MapLibre's own contextmenu event flowing for right-click connections,
      // while disabling Chromium's native context menu.
      event.preventDefault();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 2) return;
      const map = mapRef.current; const next = point(event);
      const hit = map?.queryRenderedFeatures?.([next.x, next.y], { layers: ["geography-people"] }) ?? [];
      if (hit.length) return;
      event.preventDefault(); event.stopPropagation();
      additive = event.ctrlKey;
      start = next; box.style.left = `${next.x}px`; box.style.top = `${next.y}px`; box.style.width = "0px"; box.style.height = "0px"; box.style.display = "block";
    };
    const move = (event: PointerEvent) => {
      if (!start) return;
      const next = point(event); box.style.left = `${Math.min(start.x, next.x)}px`; box.style.top = `${Math.min(start.y, next.y)}px`; box.style.width = `${Math.abs(next.x - start.x)}px`; box.style.height = `${Math.abs(next.y - start.y)}px`;
    };
    const up = (event: PointerEvent) => {
      if (!start) return;
      const end = point(event); const left = Math.min(start.x, end.x); const right = Math.max(start.x, end.x); const top = Math.min(start.y, end.y); const bottom = Math.max(start.y, end.y);
      const moved = Math.hypot(end.x - start.x, end.y - start.y) >= 8; start = undefined; box.style.display = "none";
      if (!moved) { additive = false; return; }
      const map = mapRef.current;
      const personIds = project.people.flatMap((person) => { const location = resolvedLocationFor(person); if (!map || !location) return []; const screen = map.project([location.longitude, location.latitude]); return screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom ? [person.id] : []; });
      const people = new Set(personIds);
      const relationshipIds = project.relationships.filter((relationship) => people.has(relationship.sourcePersonId) && people.has(relationship.targetPersonId)).map((relationship) => relationship.id);
      latestRef.current.onMarqueeSelect?.(personIds, relationshipIds, additive);
      additive = false;
    };
    container.addEventListener("pointerdown", down, true); window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true); document.addEventListener("contextmenu", suppressContextMenu, true);
    return () => { container.removeEventListener("pointerdown", down, true); window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); document.removeEventListener("contextmenu", suppressContextMenu, true); box.remove(); };
  }, [project.people, project.relationships]);
  // 未匹配人物：未提供地点或地点尚不能解析为坐标的人物，都必须在待匹配托盘中可见。
  const unmatchedPeople = useMemo(
    () => project.people.filter((person) => !person.geo && !resolveKnownPlace(person.affiliation)),
    [project.people],
  );

  // 自动解析：已填地区但尚无确认坐标的人物。本地已知地点同步落点（auto）；
  // 未知地点联网解析，唯一结果自动落点（auto），多个同名结果保留候选待确认，
  // 解析失败进入"解析失败·重试"。同一地点文本只解析一次；地点被更正后会重新解析。
  const scheduleGeoResolve = useCallback(() => {
    let cancelled = false;
    for (const person of project.people) {
      if (!person.affiliation || person.geo || geoAttemptedRef.current.get(person.id) === person.affiliation) continue;
      geoAttemptedRef.current.set(person.id, person.affiliation);
      const known = resolveKnownPlace(person.affiliation);
      if (known) {
        latestRef.current.onPersonGeoChange?.(person.id, { ...known, status: "auto" });
        continue;
      }
      void geocodeCandidates(person.affiliation).then((results) => {
        if (cancelled) return;
        setGeoResolveState((current) => {
          const next = { ...current };
          delete next[person.id];
          return next;
        });
        if (results.length === 1) {
          const candidate = results[0];
          latestRef.current.onPersonGeoChange?.(person.id, {
            label: candidate.label,
            longitude: candidate.longitude,
            latitude: candidate.latitude,
            countryCode: candidate.countryCode,
            continent: candidate.continent,
            status: "auto",
          });
        } else if (results.length > 1) {
          setCandidatesByPerson((current) => ({ ...current, [person.id]: results }));
        } else {
          setGeoResolveState((current) => ({ ...current, [person.id]: "error" }));
        }
      }).catch(() => {
        if (!cancelled) setGeoResolveState((current) => ({ ...current, [person.id]: "error" }));
      });
    }
    return () => { cancelled = true; };
  }, [project.people]);
  useEffect(() => scheduleGeoResolve(), [scheduleGeoResolve, geoRetryNonce]);

  const retryResolve = (personId: string) => {
    geoAttemptedRef.current.delete(personId);
    setGeoResolveState((current) => ({ ...current, [personId]: "resolving" }));
    setCandidatesByPerson((current) => {
      const next = { ...current };
      delete next[personId];
      return next;
    });
    setGeoRetryNonce((nonce) => nonce + 1);
  };

  const confirmCandidate = (person: Person, candidate: GeocodeCandidate) => {
    latestRef.current.onPersonGeoChange?.(person.id, {
      label: candidate.label,
      longitude: candidate.longitude,
      latitude: candidate.latitude,
      countryCode: candidate.countryCode,
      continent: candidate.continent,
      status: "confirmed",
    });
    setCandidatesByPerson((current) => {
      const next = { ...current };
      delete next[person.id];
      return next;
    });
    geoAttemptedRef.current.delete(person.id);
  };

  // 图层开关随刷新保留（G2 完成定义：刷新后坐标与图层状态不变）。
  useEffect(() => {
    localStorage.setItem("character-graph:geography:layers", JSON.stringify(layerVisibility));
  }, [layerVisibility]);

  // 地图就绪后应用持久化的图层可见性（初始渲染时 style 全部默认可见）。
  useEffect(() => {
    if (mapLoadState !== "ready") return;
    const maplibreMap = mapRef.current;
    if (!maplibreMap) return;
    for (const [group, visible] of Object.entries(layerVisibility) as Array<[keyof typeof layerVisibility, boolean]>) {
      for (const id of BASEMAP_LAYER_GROUPS[group]) {
        if (maplibreMap.getLayer(id)) {
          maplibreMap.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
        }
      }
    }
  }, [mapLoadState, layerVisibility]);

  useEffect(() => {
    let disposed = false;
    let overlayFrame: number | undefined;
    let maplibreMap: MapLibreMapInstance | null = null;
    const container = containerRef.current;
    if (!container) return;

    void (async () => {
      const { Map, LngLatBounds } = await loadMaplibre();
      if (disposed || !containerRef.current) return;

      maplibreMap = new Map({
        container,
        style: buildBasemapStyle(),
        center: [0, 20],
        zoom: 0.8,
        renderWorldCopies: false,
        attributionControl: true as unknown as false | import("maplibre-gl").AttributionControlOptions | undefined,
      });
      // 暴露地图实例到容器（供 E2E 测试读取相机与覆盖物，与 Cytoscape 的 _cyreg 同理）。
      (container as unknown as { __map?: MapLibreMapInstance }).__map = maplibreMap;

      mapRef.current = maplibreMap;

      maplibreMap.on("load", () => {
        syncOfflineOutline();
        // 投影由 style 顶层 zoom 表达式驱动（见 buildBasemapStyle），无需运行时 setProjection。
        // 预创建连线预览 source/layer（空数据），避免右键时 style 未就绪导致 addLayer 失败。
        try {
          if (!maplibreMap?.getSource("connection-preview")) {
            maplibreMap?.addSource("connection-preview", {
              type: "geojson",
              data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [0, 0]] } },
            });
            maplibreMap?.addLayer({
              id: "connection-preview",
              type: "line",
              source: "connection-preview",
              layout: { visibility: "none" },
              paint: { "line-color": "#e18a22", "line-width": 3, "line-dasharray": [9, 7] },
            });
          }
        } catch {
          /* preview 层创建失败不阻断地图 */
        }
        setMapLoadState("ready");
      });
      // 瓦片级加载错误不回退整图：由 offline-outline 回退并保持地图可用。
      // 只有 WebGL/库初始化失败才会走到下方 catch 并显示"加载失败·重试"。

      // 离线轮廓只在底图瓦片未加载/失败时显示；联网成功（有 tile）后隐藏。
      const syncOfflineOutline = () => {
        if (!maplibreMap || !maplibreMap.getSource("openfreemap")) return;
        const source = maplibreMap.getSource("openfreemap") as unknown as { loaded?: () => boolean; tileID?: unknown };
        const hasTiles = typeof source.loaded === "function" ? source.loaded() : false;
        const visibility = hasTiles ? "none" : "visible";
        if (maplibreMap.getLayer("offline-outline")) {
          maplibreMap.setLayoutProperty("offline-outline", "visibility", visibility);
        }
      };
      maplibreMap.on("sourcedata", syncOfflineOutline);
      maplibreMap.on("idle", syncOfflineOutline);

      const fitBoundsTo = (bounds: [number, number, number, number]) => {
        if (!maplibreMap) return;
        maplibreMap.fitBounds(
          new LngLatBounds(
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ),
          { padding: 60, maxZoom: zoomForLevel("region"), duration: 0 },
        );
      };
      const mapHandle: MapKernelHandle = {
        fitBoundsTo,
        fitAll() {
          const bounds = latestRef.current.computeBounds?.();
          if (bounds) fitBoundsTo(bounds);
        },
        getZoom() {
          return maplibreMap?.getZoom?.() ?? 0.8;
        },
        getCenter(): [number, number] {
          const c = maplibreMap?.getCenter?.();
          return c ? [c.lng, c.lat] : [0, 20];
        },
        dispose() {
          try { maplibreMap?.remove(); } catch { /* jsdom 中 WebGL 不存在，忽略 */
          }
        },
      };
      handleRef.current = mapHandle;
      mapRef.current = maplibreMap;
      setMapInstance(maplibreMap);

      // 相机状态只由 zoom 派生语义分层文案；投影本身由 style 表达式随 zoom 连续插值，
      // 这里不再调用 setProjection（那会触发 style 重载与瓦片重拉，造成空白和"回不去球体"）。
      const syncLevel = () => {
        if (!maplibreMap) return;
        setViewLevel(levelNameForZoom(maplibreMap.getZoom()));
        if (overlayFrame === undefined) {
          overlayFrame = requestAnimationFrame(() => {
            overlayFrame = undefined;
            setCameraRevision((revision) => revision + 1);
          });
        }
      };
      // 散开半径随 zoom 自适应，仅在缩放事件时更新（拖动不改 zoom，不重算覆盖物）。
      const syncZoom = () => {
        if (!maplibreMap) return;
        setViewLevel(levelNameForZoom(maplibreMap.getZoom()));
        setZoomLevel(maplibreMap.getZoom());
      };
      maplibreMap.on("move", syncLevel);
      maplibreMap.on("render", syncLevel);
      maplibreMap.on("moveend", () => setCameraRevision((revision) => revision + 1));
      maplibreMap.on("zoom", syncZoom);
      // 投影只响应缩放手势，不响应拖动：globe 下拖动会改变 zoom，若投影表达式实时跟随，
      // 在过渡阈值附近拖动会看到球↔平面突变。因此拖动开始把投影锁到当前稳定状态，
      // 拖动期间保持；滚轮缩放开始时恢复表达式获得平滑过渡，缩放结束后再锁定。
      let dragging = false;
      const lockProjection = () => {
        if (!maplibreMap) return;
        const current = maplibreMap.getProjection()?.type;
        if (!Array.isArray(current)) return; // 已锁定
        const stable = maplibreMap.getZoom() < 3.0 ? "globe" : "mercator";
        try { maplibreMap.setProjection({ type: stable }); } catch { /* 瞬时失败忽略 */ }
      };
      const restoreProjectionExpression = () => {
        if (!maplibreMap) return;
        const current = maplibreMap.getProjection()?.type;
        if (Array.isArray(current)) return; // 已是表达式
        try { maplibreMap.setProjection({ type: PROJECTION_EXPRESSION }); } catch { /* 瞬时失败忽略 */ }
      };
      maplibreMap.on("dragstart", () => { dragging = true; lockProjection(); });
      maplibreMap.on("dragend", () => { dragging = false; });
      maplibreMap.on("zoomstart", () => { if (!dragging) restoreProjectionExpression(); });
      maplibreMap.on("zoomend", () => { if (!dragging) lockProjection(); });
      // 初始投影在 load 事件里设置（style 加载完成后才可切换），此处只同步语义分层文案。
      setViewLevel(levelNameForZoom(maplibreMap.getZoom()));
      setZoomLevel(maplibreMap.getZoom());
    })().catch(() => {
      if (!disposed) setMapLoadState("error");
    });

    return () => {
      disposed = true;
      if (overlayFrame !== undefined) cancelAnimationFrame(overlayFrame);
      handleRef.current?.dispose();
      handleRef.current = null;
      mapRef.current = null;
    };
  }, [mapInitNonce]);

  // 从项目人物所在地构造覆盖物 GeoJSON（仅本地已确认地点；未匹配人物放待匹配托盘）。
  const { peopleGeoJson, relationshipsGeoJson, leadersGeoJson, resolvedLocationById, renderedPositionById } = useMemo(() => {
    const byId = new Map<string, GeoLocation>();
    const renderedPositionById = new Map<string, [number, number]>();
    const people: GeoJSON.Feature[] = [];
    const leaders: GeoJSON.Feature[] = [];
    // 第一遍统计同坐标人物数量（同坐标节点渲染层散开，避免完全重合遮盖）。
    const countByKey = new Map<string, number>();
    for (const person of project.people) {
      const location = resolvedLocationFor(person) ?? undefined;
      if (location) {
        const key = `${location.longitude.toFixed(5)},${location.latitude.toFixed(5)}`;
        countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
      }
    }
    const indexByKey = new Map<string, number>();
    for (const person of project.people) {
      const location = resolvedLocationFor(person) ?? undefined;
      if (location) byId.set(person.id, location);
      const key = location ? `${location.longitude.toFixed(5)},${location.latitude.toFixed(5)}` : undefined;
      const count = key ? (countByKey.get(key) ?? 1) : 1;
      const index = key ? (indexByKey.get(key) ?? 0) : 0;
      if (key) indexByKey.set(key, index + 1);
      const spread = key && count > 1
        ? spreadPosition(location!, index, count, zoomLevel)
        : location
          ? [location.longitude, location.latitude] as [number, number]
          : undefined;
      if (spread) renderedPositionById.set(person.id, spread);
      if (location && count > 1) {
        leaders.push({
          type: "Feature",
          properties: { id: person.id },
          geometry: {
            type: "LineString",
            coordinates: [[spread![0], spread![1]], [location.longitude, location.latitude]],
          },
        });
      }
      const future = observationState?.futurePersonIds.has(person.id) ?? false;
      people.push({
        type: "Feature",
        properties: {
          id: person.id,
          name: person.name,
          initial: [...person.name][0] ?? "?",
          spread: count > 1,
          matched: Boolean(location),
          future,
          focus: focusPersonIds.includes(person.id),
          longitude: location?.longitude ?? null,
          latitude: location?.latitude ?? null,
          selected: _selectedId === person.id || focusPersonIds.includes(person.id),
        },
        geometry: location
          ? { type: "Point", coordinates: spread ?? [location.longitude, location.latitude] }
          : (null as unknown as GeoJSON.Geometry),
      });
    }
    const relationships: GeoJSON.Feature[] = [];
    for (const relationship of project.relationships) {
      const source = renderedPositionById.get(relationship.sourcePersonId);
      const target = renderedPositionById.get(relationship.targetPersonId);
      if (!source || !target) continue;
      const future = observationState?.futureRelationshipIds.has(relationship.id) ?? false;
      const selected = _selectedId === relationship.id;
      relationships.push({
        type: "Feature",
        properties: {
          id: relationship.id,
          kind: relationship.kind ?? "directed",
          forwardLabel: relationship.forwardLabel,
          future,
          selected,
        },
        geometry: {
          type: "LineString",
          coordinates: [source, target],
        },
      });
    }
    return {
      peopleGeoJson: { type: "FeatureCollection", features: people } as GeoJSON.FeatureCollection,
      leadersGeoJson: { type: "FeatureCollection", features: leaders } as GeoJSON.FeatureCollection,
      relationshipsGeoJson: { type: "FeatureCollection", features: relationships } as GeoJSON.FeatureCollection,
      resolvedLocationById: byId,
      renderedPositionById,
    };
  }, [project.people, project.relationships, _selectedId, focusPersonIds, observationState, zoomLevel]);

  const screenArrows = useMemo(() => {
    void cameraRevision;
    if (!mapInstance || mapLoadState !== "ready" || !mapInstance.getLayer("geography-people")) return [];
    const isEndpointVisible = (personId: string, coordinate: [number, number]) => {
      const point = mapInstance.project(coordinate);
      return mapInstance.queryRenderedFeatures(point, { layers: ["geography-people"] })
        .some((feature) => String(feature.properties?.id ?? "") === personId);
    };
    return project.relationships.flatMap((relationship) => {
      const from = renderedPositionById.get(relationship.sourcePersonId);
      const to = renderedPositionById.get(relationship.targetPersonId);
      const kind = relationship.kind ?? "directed";
      if (!from || !to || (kind !== "directed" && kind !== "bidirectional")) return [];
      const endpoints: Array<"source" | "target"> = kind === "bidirectional" ? ["source", "target"] : ["target"];
      return endpoints.flatMap((endpoint) => {
        const personId = endpoint === "target" ? relationship.targetPersonId : relationship.sourcePersonId;
        const coordinate = endpoint === "target" ? to : from;
        if (!isEndpointVisible(personId, coordinate)) return [];
        return [{
          id: `${relationship.id}-${endpoint}`,
          points: screenArrowPolygon(from, to, endpoint, (position) => mapInstance.project(position)),
          color: observationState?.futureRelationshipIds.has(relationship.id) ? "#aeb1bb" : _selectedId === relationship.id ? "#6157d8" : "#767a8e",
          opacity: observationState?.futureRelationshipIds.has(relationship.id) ? 0.15 : 1,
        }];
      });
    });
  }, [cameraRevision, mapInstance, mapLoadState, observationState, project.relationships, renderedPositionById, _selectedId]);

  // 搜索定位：点击搜索结果后，将地图视野适配到所选人物（用户显式操作，允许改变相机）。
  useEffect(() => {
    if (!focusPersonIds.length || !handleRef.current) return;
    const lons: number[] = [];
    const lats: number[] = [];
    for (const personId of focusPersonIds) {
      const location = resolvedLocationById.get(personId);
      if (location) { lons.push(location.longitude); lats.push(location.latitude); }
    }
    if (!lons.length) return;
    handleRef.current.fitBoundsTo([
      Math.min(...lons), Math.min(...lats),
      Math.max(...lons), Math.max(...lats),
    ]);
  }, [focusPersonIds, resolvedLocationById]);

  // 选中行程站点：把地图视野适配到该站（用户显式操作，允许改变相机）。
  useEffect(() => {
    if (!_selectedStopId || !handleRef.current) return;
    const stop = (journeyStops ?? []).find((item) => item.id === _selectedStopId);
    if (!stop) return;
    handleRef.current.fitBoundsTo([stop.longitude, stop.latitude, stop.longitude, stop.latitude]);
  }, [_selectedStopId, journeyStops]);

  // 把人物/关系覆盖物作为 GeoJSON source/layer 加进地图，与底图同帧对齐。
  useEffect(() => {
    const maplibreMap = mapRef.current;
    if (!maplibreMap || mapLoadState !== "ready") return;
    try {
      if (!maplibreMap.getSource("geography-people")) {
        maplibreMap.addSource("geography-people", {
          type: "geojson",
          data: peopleGeoJson,
        });
        // 人物：先画圆圈，再画首字标签；选中/未匹配用属性样式区分。
        maplibreMap.addLayer({
          id: "geography-people",
          type: "circle",
          source: "geography-people",
          paint: {
            "circle-color": [
              "case",
              ["get", "selected"], "#d9663f",
              ["get", "matched"], "#5a62bf",
              "#b9becb",
            ],
            "circle-radius": ["case", ["get", "selected"], 24, 16],
            "circle-stroke-color": ["case", ["get", "selected"], "#ffffff", "#ffffff"],
            "circle-stroke-width": ["case", ["get", "selected"], 5, 4],
            "circle-opacity": ["case", ["get", "future"], 0.25, 1],
          },
        });
        maplibreMap.addLayer({
          id: "geography-people-label",
          type: "symbol",
          source: "geography-people",
          layout: {
            // 同坐标散开的节点显示全名，其余显示首字。
            "text-field": ["case", ["get", "spread"], ["get", "name"], ["get", "initial"]],
            "text-font": ["Noto Sans Regular"],
            "text-size": 14,
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#ffffff", "text-opacity": ["case", ["get", "future"], 0.25, 1] },
        });
        // 同坐标人物的引线：从散开位置指向真实坐标（低透明度，位于人物节点之下）。
        maplibreMap.addSource("geography-person-leaders", {
          type: "geojson",
          data: leadersGeoJson,
        });
        maplibreMap.addLayer({
          id: "geography-person-leaders",
          type: "line",
          source: "geography-person-leaders",
          paint: {
            "line-color": "#9aa4b2",
            "line-width": 1,
            "line-dasharray": [1, 2],
            "line-opacity": 0.55,
          },
        }, "geography-people");
        // 行程站点：圆形标记 + 名称标签，位于人物节点之下；未到达站淡化。
        maplibreMap.addSource("journey-stops", {
          type: "geojson",
          data: stopsGeoJson,
        });
        maplibreMap.addLayer({
          id: "journey-stops",
          type: "circle",
          source: "journey-stops",
          paint: {
            "circle-color": ["case", ["get", "selected"], "#d98a2b", "#2e7d5b"],
            "circle-radius": ["case", ["get", "selected"], 9, 6],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-opacity": ["case", ["get", "future"], 0.25, 0.9],
          },
        }, "geography-people");
        maplibreMap.addLayer({
          id: "journey-stops-label",
          type: "symbol",
          source: "journey-stops",
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-anchor": "top",
            "text-offset": [0, 0.8],
            "text-allow-overlap": false,
          },
          paint: { "text-color": "#2e5b46", "text-halo-color": "#ffffff", "text-halo-width": 1.2, "text-opacity": ["case", ["get", "future"], 0.25, 1] },
        }, "geography-people");
        maplibreMap.on("click", "journey-stops", (event) => {
          const feature = event.features?.[0];
          if (feature?.properties?.id) latestRef.current.onSelectStop?.(String(feature.properties.id));
        });
        // 关系：按 kind 区分线型；选中加粗高亮。
        maplibreMap.addSource("geography-relationships", {
          type: "geojson",
          data: relationshipsGeoJson,
        });
        // 所有关系共用一条主线；双向关系通过同一条线两端的箭头表达“⮂”。
        maplibreMap.addLayer({
          id: "geography-relationships",
          type: "line",
          source: "geography-relationships",
          paint: {
            "line-color": [
              "case", ["get", "future"], "#aeb1bb",
              ["get", "selected"], "#6157d8",
              "#767a8e",
            ],
            "line-width": ["case", ["get", "selected"], 4, 2],
            "line-dasharray": ["case", ["==", ["get", "kind"], "contact"], ["literal", [2, 2]], ["literal", [1, 0]]],
            "line-opacity": ["case", ["get", "future"], 0.15, 0.85],
          },
        }, "geography-people");
        // 关系类型视觉语义：directed 单箭头（尖端接触目标节点）、bidirectional 两端箭头、
        // undirected 实线无箭头、contact 虚线无箭头。箭头为端点处的 Point feature，
        // 携带旋转角；使用运行时生成的矢量图标（尖端在右缘），样式随 kind 数据实时更新。
        // 点击人物选中。
        maplibreMap.on("click", "geography-people", (event) => {
          const feature = event.features?.[0];
          if (feature?.properties?.id) latestRef.current.onSelect(String(feature.properties.id));
        });
        // 点击关系线选中关系详情。
        maplibreMap.on("click", "geography-relationships", (event) => {
          const feature = event.features?.[0];
          if (feature?.properties?.id) latestRef.current.onSelect(String(feature.properties.id));
        });
        // 点击空白取消选择。
        maplibreMap.on("click", (event) => {
          if (!event.originalEvent?.target) return;
          const hitPeople = maplibreMap?.queryRenderedFeatures(event.point, { layers: ["geography-people", "geography-relationships"] }) ?? [];
          if (hitPeople.length === 0) {
            latestRef.current.onSelect(undefined);
          }
        });
        // 右键连线：A → 预览线 → B。
        maplibreMap.on("contextmenu", "geography-people", (event) => {
          event.originalEvent?.preventDefault();
          event.originalEvent?.stopPropagation();
          const feature = event.features?.[0];
          if (!feature?.properties?.id) return;
          const personId = String(feature.properties.id);
          if (!connectionSourceIdRef.current) {
            connectionSourceIdRef.current = personId;
            setConnectionHintVisible(true);
            // 从 feature properties 读取经纬度，避免依赖闭包中陈旧的 project.people。
            const lon = Number(feature.properties.longitude);
            const lat = Number(feature.properties.latitude);
            connectionSourceLocationRef.current = Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : undefined;
            if (maplibreMap && connectionSourceLocationRef.current && maplibreMap.getLayer("connection-preview")) {
              (maplibreMap.getSource("connection-preview") as GeoJSONSource).setData({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [[lon, lat], [lon, lat]],
                },
              });
              maplibreMap.setLayoutProperty("connection-preview", "visibility", "visible");
            }
          } else if (connectionSourceIdRef.current !== personId) {
            latestRef.current.onConnect?.(connectionSourceIdRef.current, personId, latestRef.current.relationshipKind ?? "directed");
            connectionSourceIdRef.current = undefined;
            connectionSourceLocationRef.current = undefined;
            setConnectionHintVisible(false);
            clearConnectionPreview(maplibreMap);
          } else {
            connectionSourceIdRef.current = undefined;
            connectionSourceLocationRef.current = undefined;
            setConnectionHintVisible(false);
            clearConnectionPreview(maplibreMap);
          }
        });
        // 连线预览跟随鼠标。
        maplibreMap.on("mousemove", (event) => {
          if (!connectionSourceIdRef.current || !maplibreMap) return;
          const sourceLoc = connectionSourceLocationRef.current;
          const targetLoc = maplibreMap.unproject(event.point);
          if (!sourceLoc || !maplibreMap.getLayer("connection-preview")) return;
          (maplibreMap.getSource("connection-preview") as GeoJSONSource).setData({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [[sourceLoc[0], sourceLoc[1]], [targetLoc.lng, targetLoc.lat]],
            },
          });
        });
        // 点击空白 / 右键空白取消连线。
        maplibreMap.on("click", () => {
          if (connectionSourceIdRef.current) {
            connectionSourceIdRef.current = undefined;
            connectionSourceLocationRef.current = undefined;
            setConnectionHintVisible(false);
            clearConnectionPreview(maplibreMap);
          }
        });
      } else {
        (maplibreMap.getSource("geography-people") as GeoJSONSource).setData(peopleGeoJson);
        if (maplibreMap.getSource("geography-person-leaders")) {
          (maplibreMap.getSource("geography-person-leaders") as GeoJSONSource).setData(leadersGeoJson);
        }
        if (maplibreMap.getSource("journey-stops")) {
          (maplibreMap.getSource("journey-stops") as GeoJSONSource).setData(stopsGeoJson);
        }
        (maplibreMap.getSource("geography-relationships") as GeoJSONSource).setData(relationshipsGeoJson);
      }
    } catch {
      /* ignore transient source/layer races */
    }
  }, [peopleGeoJson, relationshipsGeoJson, leadersGeoJson, stopsGeoJson, journeyStops, mapLoadState, project.people]);

  // selectedLocation 计算：供后续选中/高亮使用（用 useMemo 但保留变量避免 lint 警报）
  const selectedLocation = useMemo(
    () => (_selectedId && resolvedLocationById.get(_selectedId)) || undefined,
    [_selectedId, resolvedLocationById],
  );
  void selectedLocation;

  // 图层开关只控制样式可见性，绝不改写相机。
  const toggleLayer = useCallback((group: keyof typeof BASEMAP_LAYER_GROUPS, visible: boolean) => {
    const maplibreMap = mapRef.current;
    if (!maplibreMap || !maplibreMap.getStyle) return;
    setLayerVisibility((current) => ({ ...current, [group]: visible }));
    for (const id of BASEMAP_LAYER_GROUPS[group]) {
      if (maplibreMap.getLayer(id)) {
        maplibreMap.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    }
  }, []);

  return (
    <div className="geography-canvas">
      <div className="geography-view-switch geography-scale-status" aria-label="地图比例尺">
        <span>{levelLabel(viewLevel)}比例尺</span>
        <button type="button" onClick={() => handleRef.current?.fitAll()}>适应全部节点</button>
      </div>
      <div className="geography-layer-controls" aria-label="地图图层">
        <label><input type="checkbox" checked={layerVisibility.boundaries} onChange={(event) => toggleLayer("boundaries", event.target.checked)} />显示边界</label>
        <label><input type="checkbox" checked={layerVisibility.labels} onChange={(event) => toggleLayer("labels", event.target.checked)} />显示地名</label>
        <label><input type="checkbox" checked={layerVisibility.graticule} onChange={(event) => toggleLayer("graticule", event.target.checked)} />显示经纬网</label>
      </div>
      <div className="geography-map-container" ref={containerRef} data-testid="maplibre-map">
        {mapLoadState === "loading" && <div className="map-load-state">正在加载地图…</div>}
        {mapLoadState === "error" && <div className="map-load-state">地图加载失败<button type="button" onClick={() => setMapInitNonce((nonce) => nonce + 1)}>重试</button></div>}
      </div>
      <svg className="geography-arrow-overlay" aria-hidden="true">
        {screenArrows.map((arrow) => <polygon key={arrow.id} points={arrow.points.map((point) => `${point.x},${point.y}`).join(" ")} fill={arrow.color} opacity={arrow.opacity} />)}
      </svg>
      {connectionHintVisible && <div className="connection-hint">右键起点 → 移动鼠标 → 右键终点完成连线；点击空白取消。</div>}
      {unmatchedPeople.length > 0 && (
        <div className="geography-unmatched" aria-label="位置待匹配">
          <span>位置待匹配（{unmatchedPeople.length}）</span>
          <div className="geography-unmatched__list">
            {unmatchedPeople.map((person) => {
              const resolveState = geoResolveState[person.id];
              const candidates = candidatesByPerson[person.id];
              return (
                <div key={person.id} className={`geography-unmatched__item ${_selectedId === person.id ? "is-selected" : ""}`} onClick={() => _onSelect(person.id)}>
                  <span>{person.name}</span>
                  {!person.affiliation && <em>未提供地点；请在人物资料填写地区/势力后自动匹配。</em>}
                  {person.affiliation && resolveState !== "error" && !candidates && <em>解析中…</em>}
                  {person.affiliation && resolveState === "error" && <button className="button button--ghost" type="button" onClick={(event) => { event.stopPropagation(); retryResolve(person.id); }}>重试</button>}
                  {person.affiliation && candidates && <div className="geography-candidates">{candidates.map((candidate) => <button key={`${candidate.longitude},${candidate.latitude},${candidate.displayName ?? candidate.label}`} className="button button--ghost" type="button" onClick={(event) => { event.stopPropagation(); confirmCandidate(person, candidate); }}>{candidate.label}{candidate.displayName ? <span>{candidate.displayName}</span> : null}</button>)}</div>}</div>
              );
            })}
          </div>
        </div>
      )}
      <div className="geography-status">
        <span>● {project.people.length} 个人物节点</span>
        <span>{project.relationships.length} 条关系</span>
        <span>已匹配 {resolvedLocationById.size}</span>
        {resolvedLocationById.size < project.people.length && <span>待匹配 {project.people.length - resolvedLocationById.size}</span>}
      </div>
    </div>
  );
}

function clearConnectionPreview(maplibreMap: MapLibreMapInstance | null): void {
  if (!maplibreMap) return;
  try {
    if (maplibreMap.getLayer("connection-preview")) {
      maplibreMap.setLayoutProperty("connection-preview", "visibility", "none");
    }
  } catch {
    /* ignore */
  }
}

// 同坐标人物的散开位置：以真实坐标为中心环形分布（渲染派生态，不写回事实）。
// 半径随 zoom 自适应：目标屏幕约 22px 的错开距离，低 zoom 用更大度值、高 zoom 用小度值，
// 使全球/洲际/国家档也能看出同点多人错开；限制在 0.008°–1.2° 之间避免低 zoom 离谱、高 zoom 过远。
function spreadRadiusDegrees(zoom: number): number {
  const degreesPerPixel = 360 / (256 * Math.pow(2, zoom));
  return Math.min(1.2, Math.max(0.008, 22 * degreesPerPixel));
}

function spreadPosition(location: GeoLocation, index: number, count: number, zoom: number): [number, number] {
  const radius = spreadRadiusDegrees(zoom);
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const latScale = Math.max(Math.cos(location.latitude * Math.PI / 180), 0.2);
  return [
    location.longitude + (radius / latScale) * Math.cos(angle),
    location.latitude + radius * Math.sin(angle),
  ];
}
