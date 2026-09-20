import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createPerson, createProject, createRelationship } from "../domain/model";
import { getAsset, saveAsset, type StoredAsset } from "./assetRepository";
import { getProject, saveProject } from "./projectRepository";
import {
  ImportValidationError,
  MAX_IMPORT_BYTES,
  buildExportBundle,
  importBundleAtomically,
  parseImportFile,
  parseImportText,
} from "./importExport";

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("character-graph");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function projectWithAvatar() {
  const project = createProject("在路上", "project-road");
  const sal = createPerson("萨尔", "person-sal");
  sal.avatarAssetId = "asset-sal";
  sal.aliases = ["主人公"];
  sal.events = [{ id: "event-denver", title: "抵达丹佛", location: "丹佛" }];
  sal.geo = { label: "丹佛", longitude: -104.9903, latitude: 39.7392, countryCode: "us", continent: "north-america", status: "confirmed" };
  const dean = createPerson("迪安", "person-dean");
  project.people = [sal, dean];
  project.relationships = [createRelationship({
    id: "relationship-friend",
    sourcePersonId: sal.id,
    targetPersonId: dean.id,
    forwardLabel: "朋友",
    symmetric: true,
  })];
  project.layout = {
    [sal.id]: { x: 120, y: 80, fixed: true },
    [dean.id]: { x: 360, y: 220, fixed: false },
  };
  project.journey = {
    stops: [
      { id: "stop-denver", label: "丹佛", longitude: -104.9903, latitude: 39.7392, chapter: { kind: "chapter", value: 1 }, personIds: ["person-sal"], eventIds: ["event-denver"], },
    ],
  };
  const asset: StoredAsset = {
    id: "asset-sal",
    projectId: project.id,
    fileName: "sal.png",
    mimeType: "image/png",
    blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
  };
  return { project, asset };
}

describe("JSON project exchange", () => {
  beforeEach(deleteTestDatabase);

  it("round-trips the complete project and avatar", async () => {
    const { project, asset } = projectWithAvatar();
    const bundle = await buildExportBundle(project, [asset]);
    const parsed = await parseImportText(JSON.stringify(bundle));

    expect(parsed.project).toEqual(project);
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]).toMatchObject({
      id: asset.id,
      projectId: project.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    });
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(parsed.assets[0].blob);
    });
    expect([...bytes]).toEqual([137, 80, 78, 71]);
  });

  it.each([
    ["unsupported version", { format: "character-graph", schemaVersion: 2, exportedAt: new Date().toISOString(), project: {}, assets: [] }, "不支持的格式版本"],
    ["dangling relationship", (() => { const { project } = projectWithAvatar(); project.relationships[0].targetPersonId = "missing"; return { format: "character-graph", schemaVersion: 1, exportedAt: new Date().toISOString(), project, assets: [] }; })(), "关系终点不存在"],
    ["missing avatar", (() => { const { project } = projectWithAvatar(); return { format: "character-graph", schemaVersion: 1, exportedAt: new Date().toISOString(), project, assets: [] }; })(), "头像资源不存在"],
    ["corrupt avatar", (() => { const { project } = projectWithAvatar(); return { format: "character-graph", schemaVersion: 1, exportedAt: new Date().toISOString(), project, assets: [{ id: "asset-sal", fileName: "sal.png", mimeType: "image/png", dataUrl: "data:image/png;base64,%%%" }] }; })(), "头像数据损坏"],
    ["invalid person geo", (() => { const { project } = projectWithAvatar(); project.people[0].geo = { label: "丹佛", longitude: -104.9903, latitude: 39.7392, status: "pending" as never }; return { format: "character-graph", schemaVersion: 1, exportedAt: new Date().toISOString(), project, assets: [] }; })(), "人物地理匹配字段无效"],
    ["invalid journey stop", (() => { const { project } = projectWithAvatar(); project.journey!.stops[0] = { id: "bad", label: 7 as never, longitude: 1, latitude: 2, personIds: [], eventIds: [] }; return { format: "character-graph", schemaVersion: 1, exportedAt: new Date().toISOString(), project, assets: [] }; })(), "行程站点结构无效"],
  ])("rejects %s", async (_name, value, message) => {
    await expect(parseImportText(JSON.stringify(value))).rejects.toThrow(message);
  });

  it("rejects dangerous object keys before parsing into application data", async () => {
    await expect(parseImportText('{"format":"character-graph","schemaVersion":1,"__proto__":{},"project":{},"assets":[]}')).rejects.toThrow("危险字段");
  });

  it("rejects files larger than 50 MB before reading them", async () => {
    const file = { size: MAX_IMPORT_BYTES + 1, text: async () => "{}" } as File;
    await expect(parseImportFile(file)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("writes project and avatars together after validation", async () => {
    const { project, asset } = projectWithAvatar();
    const parsed = await parseImportText(JSON.stringify(await buildExportBundle(project, [asset])));
    await importBundleAtomically(parsed);

    expect(await getProject(project.id)).toEqual(project);
    expect(await getAsset(asset.id)).toMatchObject({ id: asset.id, projectId: project.id });
  });

  it("does not overwrite an existing project or asset on id conflict", async () => {
    const existing = createProject("现有项目", "project-road");
    await saveProject(existing);
    await saveAsset({ id: "asset-sal", projectId: existing.id, fileName: "old.png", mimeType: "image/png", blob: new Blob(["old"], { type: "image/png" }) });
    const { project, asset } = projectWithAvatar();
    const parsed = await parseImportText(JSON.stringify(await buildExportBundle(project, [asset])));

    await expect(importBundleAtomically(parsed)).rejects.toBeInstanceOf(ImportValidationError);
    expect(await getProject(existing.id)).toEqual(existing);
    expect((await getAsset("asset-sal"))?.fileName).toBe("old.png");
  });
});
