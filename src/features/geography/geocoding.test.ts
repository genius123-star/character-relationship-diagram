import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeCandidates, resolveKnownPlace } from "./geocoding";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("resolveKnownPlace", () => {
  it.each([
    ["北京", 116.4074, 39.9042],
    ["上海", 121.4737, 31.2304],
    ["纽约", -74.006, 40.7128],
    ["开罗", 31.2357, 30.0444],
    ["内华达州", -116.4194, 38.8026],
    ["兰州", 103.8341, 36.0611],
    ["郑州", 113.6254, 34.7466],
    ["长沙", 112.9388, 28.2282],
    ["香港", 114.1694, 22.3193],
    ["西安", 108.9402, 34.3416],
  ])("resolves %s to geographic coordinates", (query, longitude, latitude) => {
    expect(resolveKnownPlace(query)).toMatchObject({ longitude, latitude });
  });

  it("normalizes surrounding text and reports unknown places", () => {
    expect(resolveKnownPlace("  北京市 / 某学派  ")?.label).toBe("北京");
    expect(resolveKnownPlace("马孔多")).toBeUndefined();
  });
});

describe("geocodeCandidates", () => {
  it("returns a single candidate for local known places without network", async () => {
    const candidates = await geocodeCandidates("洛杉矶");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ label: "洛杉矶", longitude: -118.2437, latitude: 34.0522 });
  });

  it("resolves a unique network result into one candidate and caches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: "马德里, 西班牙", lon: "-3.7038", lat: "40.4168", address: { country_code: "es" } }],
    });
    vi.stubGlobal("fetch", fetchMock);
    const candidates = await geocodeCandidates("马德里");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ label: "马德里", longitude: -3.7038, latitude: 40.4168, countryCode: "es", continent: "europe" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/api\.mirror-earth\.com\/nominatim\/search\?/),
      expect.anything(),
    );
    expect(localStorage.getItem("character-graph:geocoding:马德里")).toContain("马德里");
  });

  it("returns multiple candidates for ambiguous names without auto-caching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { display_name: "华盛顿, 哥伦比亚特区, 美国", lon: "-77.0369", lat: "38.9072", address: { country_code: "us" } },
        { display_name: "华盛顿州, 美国", lon: "-120.5", lat: "47.0", address: { country_code: "us" } },
      ],
    }));
    const candidates = await geocodeCandidates("华盛顿");
    expect(candidates).toHaveLength(2);
    expect(localStorage.getItem("character-graph:geocoding:华盛顿")).toBeNull();
  });

  it("returns empty candidates when the service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
    expect(await geocodeCandidates("马孔多")).toEqual([]);
  });
});
