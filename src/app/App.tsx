import { useCallback, useEffect, useMemo, useState } from "react";
import { createFolder, createProject, type GraphType, type ProjectDocument, type ProjectFolder } from "../domain/model";
import { addMembersToView, materializeProjectView, mergeProjectIntoLibrary, permanentlyRemovePerson, permanentlyRemoveRelationship, removePersonFromView, removeRelationshipFromView, type FolderLibrary } from "../domain/folderLibrary";
import { GraphWorkspace } from "../features/graph/GraphWorkspace";
import { prefetchMapLibre } from "../features/geography/GeographyCanvas";
import { ProjectHome } from "../features/projects/ProjectHome";
import { TrashPreview } from "../features/projects/TrashPreview";
import { createAutosaveController } from "../storage/autosave";
import {
  deleteProject,
  getProject,
  listProjects,
  saveProject,
  moveProjectToTrash,
  restoreProject,
} from "../storage/projectRepository";
import { listProjectAssets } from "../storage/assetRepository";
import { buildExportBundle, importBundleAtomically, parseImportFile } from "../storage/importExport";
import type { GraphExportFormat, GraphImageExporter } from "../features/graph/graphImageExport";
import { createBenchmarkProject } from "../test/sampleProject";
import { deleteFolder, listFolders, moveFolderToTrash, restoreFolder, saveFolder } from "../storage/folderRepository";
import { listTrash, purgeExpiredTrash, type TrashContents } from "../storage/trashRepository";
import { getOrCreateFolderLibrary, loadProjectWithFolderLibrary, saveProjectWithFolderLibrary } from "../storage/folderLibraryRepository";

export interface ExtensionParseTask {
  requestId: string;
  text: string;
}

export function App() {
  const [projects, setProjects] = useState<ProjectDocument[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [trash, setTrash] = useState<TrashContents>({ projects: [], folders: [] });
  const [currentProject, setCurrentProject] = useState<ProjectDocument>();
  const [currentFolderLibrary, setCurrentFolderLibrary] = useState<FolderLibrary>();
  const [trashPreview, setTrashPreview] = useState<ProjectDocument>();
  const [past, setPast] = useState<ProjectDocument[]>([]);
  const [future, setFuture] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [extensionParseTask, setExtensionParseTask] = useState<ExtensionParseTask>();
  const librarySession = useMemo(() => new FolderLibrarySession(), []);
  const autosave = useMemo(() => createAutosaveController({
    save: (project) => librarySession.save(project),
  }), [librarySession]);
  const consumeExtensionParseTask = useCallback((requestId: string) => {
    setExtensionParseTask((current) => current?.requestId === requestId ? undefined : current);
    window.parent.postMessage({ type: "parse-selection-consumed", requestId }, "*");
  }, []);

  const openProject = async (project: ProjectDocument) => {
    if (project.graphType === "journey") {
      setError("旅程图当前已冻结，数据已保留但不提供前端访问。");
      return;
    }
    prefetchMapLibre(project.graphType);
    const loaded = project.folderId ? await loadProjectWithFolderLibrary(project.id) : undefined;
    librarySession.setCurrent(loaded?.library);
    setCurrentFolderLibrary(loaded?.library);
    setPast([]);
    setFuture([]);
    setCurrentProject(loaded?.project ?? project);
  };

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await listProjects());
      setFolders(await listFolders());
      setTrash(await listTrash());
      setError(undefined);
    } catch {
      setError("无法读取本地项目，请刷新页面重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    purgeExpiredTrash().then(() => Promise.all([listProjects(), listFolders(), listTrash()]))
      .then(([storedProjects, storedFolders, storedTrash]) => {
        if (active) { setProjects(storedProjects); setFolders(storedFolders); setTrash(storedTrash); }
      })
      .catch(() => {
        if (active) setError("无法读取本地项目，请刷新页面重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const receiveExtensionTask = (event: MessageEvent) => {
      const task = event.data;
      if (task?.type !== "parse-selection-task" || typeof task.requestId !== "string" || typeof task.text !== "string" || !task.text.trim()) return;
      setExtensionParseTask({ requestId: task.requestId, text: task.text.trim() });
    };
    window.addEventListener("message", receiveExtensionTask);
    window.parent.postMessage({ type: "parse-bridge-ready" }, "*");
    return () => window.removeEventListener("message", receiveExtensionTask);
  }, []);

  useEffect(() => {
    const flush = () => void autosave.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      autosave.dispose();
    };
  }, [autosave]);

  const createAndOpen = async (name: string, folderId: string, graphType: GraphType) => {
    if (graphType === "journey") {
      setError("旅程图当前已冻结，无法新建。");
      return;
    }
    prefetchMapLibre(graphType);
    const project = createProject(name.trim(), crypto.randomUUID(), folderId, graphType);
    const library = mergeProjectIntoLibrary(await getOrCreateFolderLibrary(folderId), project);
    await saveProjectWithFolderLibrary(project, library);
    librarySession.setCurrent(library);
    setCurrentFolderLibrary(library);
    setProjects((existing) => [project, ...existing]);
    setPast([]);
    setFuture([]);
    setCurrentProject(project);
  };

  const createNewFolder = async (name: string) => { await saveFolder(createFolder(name)); await refreshProjects(); };
  const renameFolder = async (folder: ProjectFolder, name: string) => { await saveFolder({ ...folder, name, updatedAt: new Date().toISOString() }); await refreshProjects(); };
  const removeFolder = async (folder: ProjectFolder) => { if (projects.some((project) => project.folderId === folder.id)) { window.alert("请先移动或删除文件夹中的图谱"); return; } if (window.confirm(`将文件夹“${folder.name}”移入回收站？本地保留 7 天。`)) { await moveFolderToTrash(folder); await refreshProjects(); } };
  const moveProject = async (project: ProjectDocument, folderId: string) => { await saveProject({ ...project, folderId, updatedAt: new Date().toISOString() }); await refreshProjects(); };

  const rename = async (project: ProjectDocument, name: string) => {
    const updated = {
      ...project,
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    };
    await saveProject(updated);
    await refreshProjects();
  };

  const remove = async (project: ProjectDocument) => {
    if (!window.confirm(`将《${project.name}》移入回收站？本地保留 7 天。`)) {
      return;
    }
    await moveProjectToTrash(project);
    await refreshProjects();
  };

  const importProject = async (file: File) => {
    const parsed = await parseImportFile(file);
    if (!parsed.project.folderId) {
      const folder = createFolder(parsed.project.name);
      parsed.project.folderId = folder.id;
      parsed.project.graphType = parsed.project.graphType ?? "people";
      await saveFolder(folder);
    }
    await importBundleAtomically(parsed);
    setProjects((existing) => [parsed.project, ...existing]);
    await openProject(parsed.project);
  };

  const createAndOpenBenchmark = async () => {
    const benchmark = createBenchmarkProject();
    const benchmarkFolder = createFolder("性能测试", "folder-benchmark");
    await saveFolder(benchmarkFolder);
    benchmark.folderId = benchmarkFolder.id;
    benchmark.graphType = "people";
    const existing = await getProject(benchmark.id);
    if (!existing) await saveProject(benchmark);
    const project = existing ?? benchmark;
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    await openProject(project);
  };

  const changeCurrentProject = (next: ProjectDocument) => {
    setCurrentProject((current) => {
      if (!current) return next;
      setPast((items) => [...items, current].slice(-50));
      setFuture([]);
      return next;
    });
    if (next.folderId && currentFolderLibrary?.folderId === next.folderId) {
      const merged = mergeProjectIntoLibrary(currentFolderLibrary, next);
      librarySession.setCurrent(merged);
      setCurrentFolderLibrary(merged);
    }
    autosave.schedule(next);
  };

  // 提交语义的写入：与 changeCurrentProject 相同，但立即落库（用于句子解析写入，
  // 避免 300ms 防抖在用户立刻刷新/关闭页面时丢数据）。
  const commitCurrentProject = async (next: ProjectDocument) => {
    changeCurrentProject(next);
    await autosave.flush();
  };

  const applyFolderLibrary = async (nextLibrary: FolderLibrary) => {
    if (!currentProject) return;
    await autosave.flush();
    const nextProject = materializeProjectView({ ...currentProject, updatedAt: new Date().toISOString() }, nextLibrary);
    librarySession.setCurrent(nextLibrary);
    setCurrentFolderLibrary(nextLibrary);
    setPast((items) => [...items, currentProject].slice(-50));
    setFuture([]);
    setCurrentProject(nextProject);
    await saveProjectWithFolderLibrary(nextProject, nextLibrary);
  };

  const undoCurrentProject = () => {
    setPast((items) => {
      const previous = items.at(-1);
      if (!previous) return items;
      setCurrentProject((current) => {
        if (current) setFuture((entries) => [current, ...entries]);
        autosave.schedule(previous);
        return previous;
      });
      return items.slice(0, -1);
    });
  };

  const redoCurrentProject = () => {
    setFuture((items) => {
      const [next, ...rest] = items;
      if (!next) return items;
      setCurrentProject((current) => {
        if (current) setPast((entries) => [...entries, current].slice(-50));
        autosave.schedule(next);
        return next;
      });
      return rest;
    });
  };

  const exportProject = async (project: ProjectDocument) => {
    await autosave.flush();
    const bundle = await buildExportBundle(project, await listProjectAssets(project.id));
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(project.name)}.character-graph.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportGraph = async (format: GraphExportFormat, exporter: GraphImageExporter) => {
    if (!currentProject) throw new Error("当前项目不存在");
    downloadBlob(await exporter.export(format), `${safeFileName(currentProject.name)}.关系图.${format}`);
  };

  if (trashPreview) return <TrashPreview project={trashPreview} onBack={() => setTrashPreview(undefined)} />;
  if (currentProject) {
    return (
      <div data-testid="current-project" data-project-id={currentProject.id}>
        <GraphWorkspace
          project={currentProject}
          folderPeople={currentFolderLibrary?.people}
          folderRelationships={currentFolderLibrary?.relationships}
          onAddFromFolder={(personIds, relationshipIds) => {
            if (currentFolderLibrary) void applyFolderLibrary(addMembersToView(currentFolderLibrary, currentProject.id, personIds, relationshipIds));
          }}
          onRemoveFromView={(kind, id) => {
            if (!currentFolderLibrary) return;
            const next = kind === "person" ? removePersonFromView(currentFolderLibrary, currentProject.id, id) : removeRelationshipFromView(currentFolderLibrary, currentProject.id, id);
            void applyFolderLibrary(next);
          }}
          onDeleteFromFolder={(kind, id) => {
            if (!currentFolderLibrary || !window.confirm("此操作会从当前文件夹及其中所有图谱永久删除该信息，是否继续？")) return;
            const next = kind === "person" ? permanentlyRemovePerson(currentFolderLibrary, id) : permanentlyRemoveRelationship(currentFolderLibrary, id);
            void applyFolderLibrary(next);
          }}
          onBack={() => { setCurrentProject(undefined); setPast([]); setFuture([]); void refreshProjects(); }}
          onChange={changeCurrentProject}
          onCommit={commitCurrentProject}
          onUndo={undoCurrentProject}
          onRedo={redoCurrentProject}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onExport={exportProject}
          onGraphExport={exportGraph}
          extensionParseTask={extensionParseTask}
          onExtensionParseTaskConsumed={consumeExtensionParseTask}
        />
      </div>
    );
  }

  return (
    <ProjectHome
      projects={projects}
      folders={folders}
      loading={loading}
      error={error}
      onCreate={createAndOpen}
      onCreateFolder={createNewFolder}
      onRenameFolder={renameFolder}
      onDeleteFolder={removeFolder}
      onMove={moveProject}
      onOpen={(project) => void openProject(project)}
      onRename={rename}
      onDelete={remove}
      onImport={importProject}
      onCreateBenchmark={createAndOpenBenchmark}
      trash={trash}
      onRestoreProject={async (project) => { await restoreProject(project); await refreshProjects(); }}
      onRestoreFolder={async (folder) => { await restoreFolder(folder); await refreshProjects(); }}
      onPurgeProject={async (project) => { if (window.confirm(`永久删除《${project.name}》及其本地资源？`)) { await deleteProject(project.id); await refreshProjects(); } }}
      onPurgeFolder={async (folder) => { if (window.confirm(`永久删除文件夹“${folder.name}”？`)) { await deleteFolder(folder.id); await refreshProjects(); } }}
      onPreviewTrash={setTrashPreview}
    />
  );
}

function safeFileName(value: string): string {
  return [...value].map((character) => "<>:\"/\\|?*".includes(character) || character.charCodeAt(0) < 32 ? "_" : character).join("").trim() || "人物关系图谱";
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

class FolderLibrarySession {
  private current?: FolderLibrary;

  setCurrent(library?: FolderLibrary): void {
    this.current = library;
  }

  async save(project: ProjectDocument): Promise<void> {
    if (project.folderId && this.current?.folderId === project.folderId) {
      this.current = mergeProjectIntoLibrary(this.current, project);
      await saveProjectWithFolderLibrary(project, this.current);
      return;
    }
    await saveProject(project);
  }
}
