import type { Feature, FeatureCollection, LineString } from "geojson";

/**
 * 生成常用经纬线（graticule）GeoJSON：经线 0°、±15°…±180°（每 15° 一条，共 24 条），
 * 纬线 0°、±15°…±90°（每 15° 一条，共 13 条）。每条线按 15° 步进加密取样，
 * 使墨卡托投影下经线呈弧线而非直线。
 */
export function createGraticule(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (let lon = -180; lon <= 180; lon += 15) {
    const coordinates: [number, number][] = [];
    for (let lat = -90; lat <= 90; lat += 15) coordinates.push([lon, lat]);
    features.push({ type: "Feature", properties: { kind: "meridian" }, geometry: { type: "LineString", coordinates } });
  }
  for (let lat = -90; lat <= 90; lat += 15) {
    const coordinates: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 15) coordinates.push([lon, lat]);
    features.push({ type: "Feature", properties: { kind: "parallel" }, geometry: { type: "LineString", coordinates } });
  }
  return { type: "FeatureCollection", features };
}
