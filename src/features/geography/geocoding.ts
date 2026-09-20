export interface GeoLocation {
  label: string;
  longitude: number;
  latitude: number;
  countryCode?: string;
  continent?: string;
}

export interface GeocodeCandidate extends GeoLocation {
  /** Nominatim 完整展示名（用于歧义候选区分），本地已知地点无此字段。 */
  displayName?: string;
}

export const knownPlaces: Array<GeoLocation & { terms: string[] }> = [
  { label: "北京", longitude: 116.4074, latitude: 39.9042, countryCode: "cn", continent: "asia", terms: ["北京", "北京市", "beijing"] },
  { label: "上海", longitude: 121.4737, latitude: 31.2304, countryCode: "cn", continent: "asia", terms: ["上海", "上海市", "shanghai"] },
  { label: "绵阳", longitude: 104.6796, latitude: 31.4675, countryCode: "cn", continent: "asia", terms: ["绵阳", "绵阳市", "mianyang"] },
  { label: "成都", longitude: 104.0665, latitude: 30.5728, countryCode: "cn", continent: "asia", terms: ["成都", "成都市", "chengdu"] },
  { label: "东京", longitude: 139.6917, latitude: 35.6895, countryCode: "jp", continent: "asia", terms: ["东京", "tokyo"] },
  { label: "柏林", longitude: 13.405, latitude: 52.52, countryCode: "de", continent: "europe", terms: ["柏林", "berlin"] },
  { label: "纽约", longitude: -74.006, latitude: 40.7128, countryCode: "us", continent: "north-america", terms: ["纽约", "纽约市", "new york", "new york city"] },
  { label: "开罗", longitude: 31.2357, latitude: 30.0444, countryCode: "eg", continent: "africa", terms: ["开罗", "cairo"] },
  { label: "内华达州", longitude: -116.4194, latitude: 38.8026, countryCode: "us", continent: "north-america", terms: ["内华达", "内华达州", "nevada"] },
  { label: "旧金山", longitude: -122.4194, latitude: 37.7749, countryCode: "us", continent: "north-america", terms: ["旧金山", "圣弗朗西斯科", "san francisco"] },
  { label: "洛杉矶", longitude: -118.2437, latitude: 34.0522, countryCode: "us", continent: "north-america", terms: ["洛杉矶", "los angeles"] },
  { label: "盐湖城", longitude: -111.891, latitude: 40.7608, countryCode: "us", continent: "north-america", terms: ["盐湖城", "salt lake city"] },
  { label: "拉斯维加斯", longitude: -115.1398, latitude: 36.1699, countryCode: "us", continent: "north-america", terms: ["拉斯维加斯", "las vegas"] },
  { label: "丹佛", longitude: -104.9903, latitude: 39.7392, countryCode: "us", continent: "north-america", terms: ["丹佛", "denver"] },
  { label: "西雅图", longitude: -122.3321, latitude: 47.6062, countryCode: "us", continent: "north-america", terms: ["西雅图", "seattle"] },
  { label: "菲尼克斯", longitude: -112.074, latitude: 33.4484, countryCode: "us", continent: "north-america", terms: ["菲尼克斯", "凤凰城", "phoenix"] },
  // 中国主要城市（本地词表命中，避免依赖 Nominatim 网络解析）。
  { label: "兰州", longitude: 103.8341, latitude: 36.0611, countryCode: "cn", continent: "asia", terms: ["兰州", "兰州市", "lanzhou"] },
  { label: "郑州", longitude: 113.6254, latitude: 34.7466, countryCode: "cn", continent: "asia", terms: ["郑州", "郑州市", "zhengzhou"] },
  { label: "长沙", longitude: 112.9388, latitude: 28.2282, countryCode: "cn", continent: "asia", terms: ["长沙", "长沙市", "changsha"] },
  { label: "香港", longitude: 114.1694, latitude: 22.3193, countryCode: "hk", continent: "asia", terms: ["香港", "香港特别行政区", "hong kong"] },
  { label: "广州", longitude: 113.2644, latitude: 23.1291, countryCode: "cn", continent: "asia", terms: ["广州", "广州市", "guangzhou"] },
  { label: "深圳", longitude: 114.0579, latitude: 22.5431, countryCode: "cn", continent: "asia", terms: ["深圳", "深圳市", "shenzhen"] },
  { label: "杭州", longitude: 120.1551, latitude: 30.2741, countryCode: "cn", continent: "asia", terms: ["杭州", "杭州市", "hangzhou"] },
  { label: "南京", longitude: 118.7969, latitude: 32.0603, countryCode: "cn", continent: "asia", terms: ["南京", "南京市", "nanjing"] },
  { label: "武汉", longitude: 114.3054, latitude: 30.5931, countryCode: "cn", continent: "asia", terms: ["武汉", "武汉市", "wuhan"] },
  { label: "西安", longitude: 108.9402, latitude: 34.3416, countryCode: "cn", continent: "asia", terms: ["西安", "西安市", "xian", "xi'an"] },
  { label: "重庆", longitude: 106.5516, latitude: 29.563, countryCode: "cn", continent: "asia", terms: ["重庆", "重庆市", "chongqing"] },
  { label: "天津", longitude: 117.1908, latitude: 39.1256, countryCode: "cn", continent: "asia", terms: ["天津", "天津市", "tianjin"] },
  { label: "青岛", longitude: 120.3826, latitude: 36.0671, countryCode: "cn", continent: "asia", terms: ["青岛", "青岛市", "qingdao"] },
  { label: "大连", longitude: 121.6147, latitude: 38.914, countryCode: "cn", continent: "asia", terms: ["大连", "大连市", "dalian"] },
  { label: "厦门", longitude: 118.0894, latitude: 24.4798, countryCode: "cn", continent: "asia", terms: ["厦门", "厦门市", "xiamen"] },
  { label: "昆明", longitude: 102.8329, latitude: 24.8801, countryCode: "cn", continent: "asia", terms: ["昆明", "昆明市", "kunming"] },
  { label: "贵阳", longitude: 106.6302, latitude: 26.647, countryCode: "cn", continent: "asia", terms: ["贵阳", "贵阳市", "guiyang"] },
  { label: "南宁", longitude: 108.3669, latitude: 22.817, countryCode: "cn", continent: "asia", terms: ["南宁", "南宁市", "nanning"] },
  { label: "哈尔滨", longitude: 126.534, latitude: 45.8038, countryCode: "cn", continent: "asia", terms: ["哈尔滨", "哈尔滨市", "harbin"] },
  { label: "长春", longitude: 125.3235, latitude: 43.8171, countryCode: "cn", continent: "asia", terms: ["长春", "长春市", "changchun"] },
  { label: "沈阳", longitude: 123.4315, latitude: 41.8057, countryCode: "cn", continent: "asia", terms: ["沈阳", "沈阳市", "shenyang"] },
  { label: "石家庄", longitude: 114.5149, latitude: 38.0428, countryCode: "cn", continent: "asia", terms: ["石家庄", "石家庄市", "shijiazhuang"] },
  { label: "太原", longitude: 112.5492, latitude: 37.8706, countryCode: "cn", continent: "asia", terms: ["太原", "太原市", "taiyuan"] },
  { label: "济南", longitude: 117.0009, latitude: 36.6512, countryCode: "cn", continent: "asia", terms: ["济南", "济南市", "jinan"] },
  { label: "合肥", longitude: 117.2272, latitude: 31.8206, countryCode: "cn", continent: "asia", terms: ["合肥", "合肥市", "hefei"] },
  { label: "南昌", longitude: 115.8579, latitude: 28.682, countryCode: "cn", continent: "asia", terms: ["南昌", "南昌市", "nanchang"] },
  { label: "福州", longitude: 119.2965, latitude: 26.0745, countryCode: "cn", continent: "asia", terms: ["福州", "福州市", "fuzhou"] },
  { label: "乌鲁木齐", longitude: 87.6168, latitude: 43.8256, countryCode: "cn", continent: "asia", terms: ["乌鲁木齐", "乌鲁木齐市", "urumqi"] },
  { label: "拉萨", longitude: 91.1409, latitude: 29.6456, countryCode: "cn", continent: "asia", terms: ["拉萨", "拉萨市", "lhasa"] },
  { label: "西宁", longitude: 101.7782, latitude: 36.6171, countryCode: "cn", continent: "asia", terms: ["西宁", "西宁市", "xining"] },
  { label: "银川", longitude: 106.2309, latitude: 38.4872, countryCode: "cn", continent: "asia", terms: ["银川", "银川市", "yinchuan"] },
  { label: "呼和浩特", longitude: 111.7492, latitude: 40.8426, countryCode: "cn", continent: "asia", terms: ["呼和浩特", "呼和浩特市", "hohhot"] },
  { label: "澳门", longitude: 113.5439, latitude: 22.1987, countryCode: "mo", continent: "asia", terms: ["澳门", "澳门特别行政区", "macau", "macao"] },
  { label: "台北", longitude: 121.5654, latitude: 25.033, countryCode: "tw", continent: "asia", terms: ["台北", "台北市", "taipei"] },
  { label: "洛阳", longitude: 112.454, latitude: 34.6197, countryCode: "cn", continent: "asia", terms: ["洛阳", "洛阳市", "luoyang"] },
  { label: "开封", longitude: 114.3074, latitude: 34.7973, countryCode: "cn", continent: "asia", terms: ["开封", "开封市", "kaifeng"] },
];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[，,;；|]/g, "/");
}

export function resolveKnownPlace(query?: string): GeoLocation | undefined {
  if (!query?.trim()) return undefined;
  const normalized = normalize(query);
  const match = knownPlaces.find((place) => place.terms.some((term) => normalized.includes(normalize(term))));
  return match && { label: match.label, longitude: match.longitude, latitude: match.latitude, countryCode: match.countryCode, continent: match.continent };
}

const continentByCountry: Record<string, string> = {
  cn: "asia", hk: "asia", mo: "asia", tw: "asia", jp: "asia", kr: "asia", in: "asia", id: "asia", th: "asia", vn: "asia", ph: "asia",
  de: "europe", fr: "europe", gb: "europe", es: "europe", it: "europe", pt: "europe", ru: "europe",
  us: "north-america", ca: "north-america", mx: "north-america",
  br: "south-america", ar: "south-america", cl: "south-america", pe: "south-america",
  eg: "africa", za: "africa", ng: "africa", ke: "africa", ma: "africa",
  au: "oceania", nz: "oceania",
};

const cacheKey = "character-graph:geocoding:";

// 地点解析服务端点：默认使用"镜像地球"的 Nominatim 镜像（国内网络可直接访问，CORS 全开，
// 数据来自 OpenStreetMap，ODbL 许可）。若该镜像不可用，可改回官方端点
// "https://nominatim.openstreetmap.org/search"（国内网络通常不可达）。
const GEOCODING_ENDPOINT = "https://api.mirror-earth.com/nominatim/search";

// Nominatim 使用规范：限频 1 req/s。模块级时间戳保证连续请求间隔至少 1 秒。
let lastGeocodeRequestAt = 0;
async function rateLimitGeocode(): Promise<void> {
  const elapsed = Date.now() - lastGeocodeRequestAt;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastGeocodeRequestAt = Date.now();
}

/**
 * 解析地点候选：本地已知地点优先且视为唯一；未知地点联网解析（Nominatim 镜像：镜像地球），
 * 唯一结果可自动放置，多个同名结果由调用方展示候选供用户确认。
 */
export async function geocodeCandidates(query: string, limit = 5): Promise<GeocodeCandidate[]> {
  const known = resolveKnownPlace(query);
  if (known) return [{ ...known }];
  const normalized = normalize(query);
  const cached = localStorage.getItem(`${cacheKey}${normalized}`);
  if (cached) return [JSON.parse(cached) as GeocodeCandidate];
  await rateLimitGeocode();
  const parameters = new URLSearchParams({ q: query, format: "jsonv2", limit: String(limit), addressdetails: "1", "accept-language": "zh-CN" });
  // 8 秒超时：Nominatim 不可达时快速失败（调用方显示"重试"），避免长期挂起在"解析中"。
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${GEOCODING_ENDPOINT}?${parameters}`, {
      headers: { "User-Agent": "character-graph/0.1 (local-first relationship graph)" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const results = await response.json() as Array<{ display_name: string; lon: string; lat: string; address?: { country_code?: string } }>;
    const candidates = results.map((result) => {
      const countryCode = result.address?.country_code?.toLowerCase();
      return {
        label: result.display_name.split(",")[0],
        longitude: Number(result.lon),
        latitude: Number(result.lat),
        countryCode,
        continent: countryCode ? continentByCountry[countryCode] : undefined,
        displayName: result.display_name,
      };
    });
    if (candidates.length === 1) {
      localStorage.setItem(`${cacheKey}${normalized}`, JSON.stringify(candidates[0]));
    }
    return candidates;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
