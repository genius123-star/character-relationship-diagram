import type { ProjectDocument, RelationshipKind } from "../domain/model";
import { validateProject } from "../domain/validation";
import type { StoredAsset } from "./assetRepository";
import { ASSET_STORE, openDatabase, PROJECT_STORE, requestResult, transactionComplete } from "./database";

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

type ImageMimeType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface ExportAsset {
  id: string;
  mimeType: ImageMimeType;
  fileName: string;
  dataUrl: string;
}

export interface ExportBundle {
  format: "character-graph";
  schemaVersion: 1;
  exportedAt: string;
  project: ProjectDocument;
  assets: ExportAsset[];
}

export interface ParsedImport {
  project: ProjectDocument;
  assets: StoredAsset[];
}

export type ImportErrorCode =
  | "FILE_TOO_LARGE"
  | "INVALID_JSON"
  | "DANGEROUS_KEY"
  | "UNSUPPORTED_VERSION"
  | "INVALID_STRUCTURE"
  | "BROKEN_REFERENCE"
  | "INVALID_AVATAR"
  | "ID_CONFLICT";

export class ImportValidationError extends Error {
  constructor(public readonly code: ImportErrorCode, message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

export async function buildExportBundle(project: ProjectDocument, assets: StoredAsset[]): Promise<ExportBundle> {
  const referencedIds = new Set(project.people.flatMap((person) => person.avatarAssetId ? [person.avatarAssetId] : []));
  const relevantAssets = assets.filter((asset) => asset.projectId === project.id && referencedIds.has(asset.id));
  const missing = [...referencedIds].find((id) => !relevantAssets.some((asset) => asset.id === id));
  if (missing) throw new ImportValidationError("INVALID_AVATAR", `头像资源不存在：${missing}`);
  return {
    format: "character-graph",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project,
    assets: await Promise.all(relevantAssets.map(async (asset) => ({
      id: asset.id,
      mimeType: assertImageMimeType(asset.mimeType),
      fileName: asset.fileName,
      dataUrl: await blobToDataUrl(asset.blob, assertImageMimeType(asset.mimeType)),
    }))),
  };
}

export async function parseImportFile(file: Pick<File, "size" | "text">): Promise<ParsedImport> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportValidationError("FILE_TOO_LARGE", "导入文件不能超过 50 MB");
  }
  return parseImportText(await readBlobAsText(file as File));
}

export async function parseImportText(text: string): Promise<ParsedImport> {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) {
    throw new ImportValidationError("FILE_TOO_LARGE", "导入文件不能超过 50 MB");
  }
  let unknownValue: unknown;
  try {
    unknownValue = JSON.parse(text, (key, value: unknown) => {
      if (DANGEROUS_KEYS.has(key)) throw new ImportValidationError("DANGEROUS_KEY", `导入文件包含危险字段：${key}`);
      return value;
    });
  } catch (error) {
    if (error instanceof ImportValidationError) throw error;
    throw new ImportValidationError("INVALID_JSON", "文件不是有效的 JSON");
  }
  const bundle = validateBundleShape(unknownValue);
  const projectErrors = validateProject(bundle.project);
  if (projectErrors.length) {
    const message = projectErrors[0];
    const code = message.includes("不存在") ? "BROKEN_REFERENCE" : "INVALID_STRUCTURE";
    throw new ImportValidationError(code, message);
  }
  validateProjectReferences(bundle.project);
  const assetIds = new Set<string>();
  const assets = bundle.assets.map((asset) => {
    if (assetIds.has(asset.id)) throw new ImportValidationError("INVALID_AVATAR", `头像资源 ID 重复：${asset.id}`);
    assetIds.add(asset.id);
    return decodeAsset(asset, bundle.project.id);
  });
  for (const person of bundle.project.people) {
    if (person.avatarAssetId && !assetIds.has(person.avatarAssetId)) {
      throw new ImportValidationError("INVALID_AVATAR", `头像资源不存在：${person.avatarAssetId}`);
    }
  }
  return { project: bundle.project, assets };
}

export async function importBundleAtomically(parsed: ParsedImport): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([PROJECT_STORE, ASSET_STORE], "readwrite");
    const projects = transaction.objectStore(PROJECT_STORE);
    const assets = transaction.objectStore(ASSET_STORE);
    const existingProject = await requestResult<ProjectDocument | undefined>(projects.get(parsed.project.id));
    if (existingProject) {
      transaction.abort();
      throw new ImportValidationError("ID_CONFLICT", `项目 ID 已存在：${parsed.project.id}`);
    }
    for (const asset of parsed.assets) {
      if (await requestResult<StoredAsset | undefined>(assets.get(asset.id))) {
        transaction.abort();
        throw new ImportValidationError("ID_CONFLICT", `头像资源 ID 已存在：${asset.id}`);
      }
    }
    projects.add(parsed.project);
    for (const asset of parsed.assets) assets.add(asset);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

function validateBundleShape(value: unknown): ExportBundle {
  if (!isRecord(value) || value.format !== "character-graph") {
    throw new ImportValidationError("INVALID_STRUCTURE", "不是人物关系图谱导出文件");
  }
  if (value.schemaVersion !== 1) {
    throw new ImportValidationError("UNSUPPORTED_VERSION", `不支持的格式版本：${String(value.schemaVersion)}`);
  }
  if (typeof value.exportedAt !== "string" || !isRecord(value.project) || !Array.isArray(value.assets)) {
    throw new ImportValidationError("INVALID_STRUCTURE", "导入文件缺少项目或资源数据");
  }
  validateProjectShape(value.project);
  const assets = value.assets.map(validateAssetShape);
  return { format: "character-graph", schemaVersion: 1, exportedAt: value.exportedAt, project: value.project as unknown as ProjectDocument, assets };
}

function validateProjectShape(project: Record<string, unknown>): void {
  if (project.schemaVersion !== 1 || !hasStrings(project, ["id", "name", "createdAt", "updatedAt"]) ||
      !isRecord(project.timeline) || project.timeline.kind !== "chapter" ||
      !Array.isArray(project.people) || !Array.isArray(project.relationships) || !Array.isArray(project.categories) || !isRecord(project.layout)) {
    throw new ImportValidationError("INVALID_STRUCTURE", "项目结构或必填字段无效");
  }
  for (const person of project.people) {
    if (!isRecord(person) || !hasStrings(person, ["id", "name", "createdAt", "updatedAt"]) ||
        !Array.isArray(person.aliases) || !person.aliases.every(isString) || !Array.isArray(person.personalityTags) || !person.personalityTags.every(isString) ||
        !Array.isArray(person.identityTags) || !person.identityTags.every(isString) || !isRecord(person.categoryValues) || !Array.isArray(person.events)) {
      throw new ImportValidationError("INVALID_STRUCTURE", "人物结构或必填字段无效");
    }
    for (const event of person.events) {
      if (!isRecord(event) || !hasStrings(event, ["id", "title"])) throw new ImportValidationError("INVALID_STRUCTURE", "人物事件结构无效");
      validateOptionalPosition(event.position, "人物事件章节");
    }
    validateOptionalPosition(person.firstAppearance, "人物首次出场章节");
    if (person.geo != null) {
      const geo = person.geo;
      if (!isRecord(geo) || typeof geo.label !== "string" || typeof geo.longitude !== "number" || typeof geo.latitude !== "number" ||
          (geo.status !== "auto" && geo.status !== "confirmed") ||
          (geo.countryCode !== undefined && typeof geo.countryCode !== "string") ||
          (geo.continent !== undefined && typeof geo.continent !== "string")) {
        throw new ImportValidationError("INVALID_STRUCTURE", "人物地理匹配字段无效");
      }
    }
  }
  for (const relationship of project.relationships) {
    if (!isRecord(relationship) || !hasStrings(relationship, ["id", "sourcePersonId", "targetPersonId", "forwardLabel", "createdAt", "updatedAt"]) || typeof relationship.symmetric !== "boolean") {
      throw new ImportValidationError("INVALID_STRUCTURE", "关系结构或必填字段无效");
    }
    if (relationship.kind !== undefined && !(["directed", "bidirectional", "undirected", "contact"] satisfies RelationshipKind[]).includes(relationship.kind as RelationshipKind)) {
      throw new ImportValidationError("INVALID_STRUCTURE", "关系类型无效");
    }
    validateOptionalPosition(relationship.startsAt, "关系开始章节");
    validateOptionalPosition(relationship.endsAt, "关系结束章节");
  }
  if (project.journey != null) {
    if (!isRecord(project.journey) || !Array.isArray(project.journey.stops)) {
      throw new ImportValidationError("INVALID_STRUCTURE", "行程结构无效");
    }
    for (const stop of project.journey.stops) {
      if (!isRecord(stop) || typeof stop.label !== "string" || typeof stop.longitude !== "number" || typeof stop.latitude !== "number" ||
          !Array.isArray(stop.personIds) || !stop.personIds.every(isString) || !Array.isArray(stop.eventIds) || !stop.eventIds.every(isString)) {
        throw new ImportValidationError("INVALID_STRUCTURE", "行程站点结构无效");
      }
      validateOptionalPosition(stop.chapter, "行程站点章节");
    }
  }
  for (const category of project.categories) {
    if (!isRecord(category) || !hasStrings(category, ["id", "name"]) || !Array.isArray(category.values)) throw new ImportValidationError("INVALID_STRUCTURE", "颜色归类结构无效");
    for (const item of category.values) if (!isRecord(item) || !hasStrings(item, ["id", "name", "color"])) throw new ImportValidationError("INVALID_STRUCTURE", "归类值结构无效");
  }
  for (const layout of Object.values(project.layout)) {
    if (!isRecord(layout) || typeof layout.x !== "number" || !Number.isFinite(layout.x) || typeof layout.y !== "number" || !Number.isFinite(layout.y) || typeof layout.fixed !== "boolean") {
      throw new ImportValidationError("INVALID_STRUCTURE", "节点布局结构无效");
    }
  }
}

function validateProjectReferences(project: ProjectDocument): void {
  const people = new Set(project.people.map((person) => person.id));
  const dimensions = new Map(project.categories.map((dimension) => [dimension.id, new Set(dimension.values.map((value) => value.id))]));
  for (const id of Object.keys(project.layout)) if (!people.has(id)) throw new ImportValidationError("BROKEN_REFERENCE", `布局引用的人物不存在：${id}`);
  for (const person of project.people) {
    for (const [dimensionId, values] of Object.entries(person.categoryValues)) {
      const allowed = dimensions.get(dimensionId);
      if (!allowed) throw new ImportValidationError("BROKEN_REFERENCE", `人物引用的归类维度不存在：${dimensionId}`);
      if (!Array.isArray(values) || values.some((id) => typeof id !== "string" || !allowed.has(id))) throw new ImportValidationError("BROKEN_REFERENCE", `人物引用的归类值不存在：${person.id}`);
    }
  }
}

function validateAssetShape(value: unknown): ExportAsset {
  if (!isRecord(value) || !hasStrings(value, ["id", "fileName", "mimeType", "dataUrl"])) throw new ImportValidationError("INVALID_AVATAR", "头像资源结构无效");
  return { id: value.id as string, fileName: value.fileName as string, mimeType: assertImageMimeType(value.mimeType as string), dataUrl: value.dataUrl as string };
}

function decodeAsset(asset: ExportAsset, projectId: string): StoredAsset {
  const prefix = `data:${asset.mimeType};base64,`;
  if (!asset.dataUrl.startsWith(prefix)) throw new ImportValidationError("INVALID_AVATAR", `头像数据类型不匹配：${asset.id}`);
  const encoded = asset.dataUrl.slice(prefix.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ImportValidationError("INVALID_AVATAR", `头像数据损坏：${asset.id}`);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  } catch {
    throw new ImportValidationError("INVALID_AVATAR", `头像数据损坏：${asset.id}`);
  }
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw new ImportValidationError("INVALID_AVATAR", `头像文件不能超过 5 MB：${asset.id}`);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return { id: asset.id, projectId, fileName: asset.fileName, mimeType: asset.mimeType, blob: new Blob([buffer], { type: asset.mimeType }) };
}

function assertImageMimeType(value: string): ImageMimeType {
  if (!ALLOWED_IMAGE_TYPES.includes(value as ImageMimeType)) throw new ImportValidationError("INVALID_AVATAR", `不支持的头像格式：${value}`);
  return value as ImageMimeType;
}

async function blobToDataUrl(blob: Blob, mimeType: ImageMimeType): Promise<string> {
  if (blob.size > MAX_AVATAR_BYTES) throw new ImportValidationError("INVALID_AVATAR", "头像文件不能超过 5 MB");
  const bytes = new Uint8Array(await readBlob(blob));
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob, "utf-8");
  });
}

function validateOptionalPosition(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!isRecord(value) || value.kind !== "chapter" || typeof value.value !== "number" || !Number.isInteger(value.value) || value.value <= 0) throw new ImportValidationError("INVALID_STRUCTURE", `${label}无效`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string { return typeof value === "string"; }

function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === "string");
}
