import {
  ASSET_STORE,
  openDatabase,
  requestResult,
  transactionComplete,
} from "./database";

export interface StoredAsset {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
}

export async function saveAsset(asset: StoredAsset): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    transaction.objectStore(ASSET_STORE).put(asset);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function getAsset(id: string): Promise<StoredAsset | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const asset = await requestResult<StoredAsset | undefined>(
      transaction.objectStore(ASSET_STORE).get(id),
    );
    await transactionComplete(transaction);
    return asset;
  } finally {
    database.close();
  }
}

export async function listProjectAssets(projectId: string): Promise<StoredAsset[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const assets = await requestResult<StoredAsset[]>(
      transaction.objectStore(ASSET_STORE).index("projectId").getAll(projectId),
    );
    await transactionComplete(transaction);
    return assets;
  } finally {
    database.close();
  }
}

export async function deleteAsset(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    transaction.objectStore(ASSET_STORE).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
