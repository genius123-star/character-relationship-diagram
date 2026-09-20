import type { ProjectDocument } from "../domain/model";

export type SaveStatus = "saving" | "saved" | "failed";

interface AutosaveOptions {
  save: (project: ProjectDocument) => Promise<void>;
  onStatusChange?: (status: SaveStatus) => void;
  delayMs?: number;
}

export interface AutosaveController {
  schedule: (project: ProjectDocument) => void;
  flush: () => Promise<void>;
  dispose: () => void;
}

export function createAutosaveController({
  save,
  onStatusChange,
  delayMs = 300,
}: AutosaveOptions): AutosaveController {
  let pending: ProjectDocument | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = Promise.resolve();

  const persist = async (project: ProjectDocument): Promise<void> => {
    onStatusChange?.("saving");
    try {
      await save(project);
      onStatusChange?.("saved");
    } catch {
      onStatusChange?.("failed");
    }
  };

  const savePending = (): Promise<void> => {
    const project = pending;
    pending = undefined;
    timer = undefined;
    if (!project) {
      return inFlight;
    }
    inFlight = inFlight.then(() => persist(project));
    return inFlight;
  };

  return {
    schedule(project) {
      pending = project;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => void savePending(), delayMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await savePending();
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
      pending = undefined;
    },
  };
}
