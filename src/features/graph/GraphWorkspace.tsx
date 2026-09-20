import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPerson, createRelationship, type Person, type ProfileBlockKind, type ProjectDocument, type Relationship, type RelationshipKind } from "../../domain/model";
import { deleteAsset, getAsset, saveAsset } from "../../storage/assetRepository";
import { validateAvatarFile } from "./avatarValidation";
import { GraphCanvas } from "./GraphCanvas";
import { allProfileBlocks, getVisibleProfileBlocks, moveProfileBlock, profileBlockLabels } from "./profileBlocks";
import { calculateRelationshipDescription } from "./relationshipDescription";
import { searchPeople } from "../../domain/search";
import { findAllShortestRelationshipPaths, findShortestRelationshipPath } from "../../domain/relationshipPath";
import { getTimelineMaximum } from "../../domain/observationProgress";
import { inferRelationship, summarizeRelationshipInferences } from "../../domain/relationshipInference";
import type { GraphExportFormat, GraphImageExporter } from "./graphImageExport";
import { GeographyCanvas } from "../geography/GeographyCanvas";
import { JourneyPanel } from "./JourneyPanel";
import { SentenceParsePanel } from "./SentenceParsePanel";
import type { ExtensionParseTask } from "../../app/App";

interface GraphWorkspaceProps {
  project: ProjectDocument;
  onBack: () => void;
  onChange: (project: ProjectDocument) => void;
  /** 提交语义的写入：落库后再返回（用于句子解析等"写入即完成"的操作）。缺省时退化为 onChange（防抖保存）。 */
  onCommit?: (project: ProjectDocument) => Promise<void>;
  onExport?: (project: ProjectDocument) => Promise<void>;
  onGraphExport?: (format: GraphExportFormat, exporter: GraphImageExporter) => Promise<void>;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  folderPeople?: Person[];
  folderRelationships?: Relationship[];
  onAddFromFolder?: (personIds: string[], relationshipIds: string[]) => void;
  onRemoveFromView?: (kind: "person" | "relationship", id: string) => void;
  onDeleteFromFolder?: (kind: "person" | "relationship", id: string) => void;
  extensionParseTask?: ExtensionParseTask;
  onExtensionParseTaskConsumed?: (requestId: string) => void;
}

export function GraphWorkspace({ project, onBack, onChange, onCommit, onExport, onGraphExport, onUndo, onRedo, canUndo = false, canRedo = false, folderPeople = [], folderRelationships = [], onAddFromFolder, onRemoveFromView, onDeleteFromFolder, extensionParseTask, onExtensionParseTaskConsumed }: GraphWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const [dialog, setDialog] = useState<"person" | "relationship" | "folder">();
  const [personName, setPersonName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("关系");
  const [relationshipKind, setRelationshipKind] = useState<RelationshipKind>("directed");
  const [relationshipToolsOpen, setRelationshipToolsOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [observationToolsOpen, setObservationToolsOpen] = useState(false);
  const [previewKind, setPreviewKind] = useState<RelationshipKind | "all">("all");
  const [editSourceId, setEditSourceId] = useState("");
  const [editTargetId, setEditTargetId] = useState("");
  const [editRelationshipKind, setEditRelationshipKind] = useState<RelationshipKind>("directed");
  const [editDescription, setEditDescription] = useState("");
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [endpointPicking, setEndpointPicking] = useState<"source" | "target" | "calculationSource" | "calculationTarget">();
  const [endpointError, setEndpointError] = useState("");
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [avatarError, setAvatarError] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryValueName, setCategoryValueName] = useState("");
  const [categoryValueColor, setCategoryValueColor] = useState("#6157d8");
  const [profileBlockToAdd, setProfileBlockToAdd] = useState<ProfileBlockKind>("aliases");
  const [previewMode, setPreviewMode] = useState(false);
  const [layoutAction, setLayoutAction] = useState<{ kind: "relayout" | "fit"; nonce: number }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocusId, setSearchFocusId] = useState("");
  const [journeyStopId, setJourneyStopId] = useState<string>();
  const [parseOpen, setParseOpen] = useState(false);
  const [parseInitialSentence, setParseInitialSentence] = useState("");
  const [parseNonce, setParseNonce] = useState(0);
  const [handledParseRequestId, setHandledParseRequestId] = useState("");
  const [calculationSourceId, setCalculationSourceId] = useState("");
  const [calculationTargetId, setCalculationTargetId] = useState("");
  const [observationEnabled, setObservationEnabled] = useState(false);
  const timelineMaximum = useMemo(() => getTimelineMaximum(project), [project]);
  const [observationChapter, setObservationChapter] = useState(1);
  const [exportStatus, setExportStatus] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [graphExporter, setGraphExporter] = useState<GraphImageExporter>();
  const [folderPersonIds, setFolderPersonIds] = useState<string[]>([]);
  const [folderRelationshipIds, setFolderRelationshipIds] = useState<string[]>([]);
  const detailFormRef = useRef<HTMLFormElement>(null);

  const selectedPerson = project.people.find((person) => person.id === selectedId);
  const selectedRelationship = project.relationships.find((relationship) => relationship.id === selectedId);
  const activeCategory = project.categories.find((category) => category.id === activeCategoryId) ?? project.categories[0];
  const searchResults = useMemo(() => searchPeople(project.people, searchQuery), [project.people, searchQuery]);
  const focusPersonIds = useMemo(() => calculationSourceId && calculationTargetId ? [calculationSourceId, calculationTargetId] : searchFocusId ? [searchFocusId] : [], [calculationSourceId, calculationTargetId, searchFocusId]);
  const focusedPath = useMemo(() => {
    if (focusPersonIds.length < 2) return undefined;
    const paths = focusPersonIds.slice(1).map((targetId) => findShortestRelationshipPath(project.relationships, focusPersonIds[0], targetId));
    if (paths.some((path) => !path)) return { personIds: focusPersonIds, relationshipIds: [], disconnected: true };
    return {
      personIds: [...new Set(paths.flatMap((path) => path!.personIds))],
      relationshipIds: [...new Set(paths.flatMap((path) => path!.relationshipIds))],
      disconnected: false,
    };
  }, [focusPersonIds, project.relationships]);
  const relationshipInference = useMemo(() => {
    if (!calculationSourceId || !calculationTargetId || calculationSourceId === calculationTargetId) return undefined;
    const paths = findAllShortestRelationshipPaths(project.relationships, calculationSourceId, calculationTargetId);
    if (!paths.length) return undefined;
    return summarizeRelationshipInferences(paths.map((path) => inferRelationship(project.people, project.relationships, path)));
  }, [calculationSourceId, calculationTargetId, project.people, project.relationships]);
  const nodeColors = useMemo(() => Object.fromEntries(project.people.flatMap((person) => {
    if (!activeCategory) return [];
    const valueId = person.categoryValues[activeCategory.id]?.[0];
    const color = activeCategory.values.find((value) => value.id === valueId)?.color;
    return color ? [[person.id, color]] : [];
  })), [activeCategory, project.people]);
  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];
    Promise.all(project.people.map(async (person) => {
      if (!person.avatarAssetId) return undefined;
      const asset = await getAsset(person.avatarAssetId);
      if (!asset) return undefined;
      const url = URL.createObjectURL(asset.blob);
      createdUrls.push(url);
      return [person.id, url] as const;
    })).then((entries) => {
      if (active) setAvatarUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
      else createdUrls.forEach((url) => URL.revokeObjectURL(url));
    }).catch(() => {
      if (active) setAvatarError("头像读取失败，请重新上传");
    });
    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [project.people]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        if (!canRedo) return;
        event.preventDefault();
        onRedo?.();
      } else if (key === "z") {
        if (!canUndo) return;
        event.preventDefault();
        onUndo?.();
      } else if (key === "y") {
        if (!canRedo) return;
        event.preventDefault();
        onRedo?.();
      }
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [canRedo, canUndo, onRedo, onUndo]);

  useEffect(() => {
    if (!moreToolsOpen && !observationToolsOpen) return;
    const closeFloatingTools = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreToolsOpen(false);
      setObservationToolsOpen(false);
    };
    document.addEventListener("keydown", closeFloatingTools);
    return () => document.removeEventListener("keydown", closeFloatingTools);
  }, [moreToolsOpen, observationToolsOpen]);

  if (extensionParseTask && extensionParseTask.requestId !== handledParseRequestId) {
    setHandledParseRequestId(extensionParseTask.requestId);
    setParseInitialSentence(extensionParseTask.text);
    setParseNonce((nonce) => nonce + 1);
    setParseOpen(true);
  }

  useEffect(() => {
    if (!handledParseRequestId) return;
    onExtensionParseTaskConsumed?.(handledParseRequestId);
  }, [handledParseRequestId, onExtensionParseTaskConsumed]);

  const update = (next: ProjectDocument) => onChange({ ...next, updatedAt: new Date().toISOString() });
  const commit = (next: ProjectDocument) => onCommit
    ? onCommit({ ...next, updatedAt: new Date().toISOString() })
    : update(next);
  const addPerson = (event: FormEvent) => {
    event.preventDefault();
    if (!personName.trim()) return;
    const person = createPerson(personName.trim());
    update({ ...project, people: [...project.people, person] });
    setSelectedId(person.id);
    setPersonName("");
    setDialog(undefined);
  };
  const addRelationship = (event: FormEvent) => {
    event.preventDefault();
    if (!sourceId || !targetId || sourceId === targetId || !relationshipLabel.trim()) return;
    const relationship = createRelationship({ sourcePersonId: sourceId, targetPersonId: targetId, forwardLabel: relationshipLabel.trim(), kind: relationshipKind, symmetric: relationshipKind === "undirected" });
    update({ ...project, relationships: [...project.relationships, relationship] });
    setEditSourceId(relationship.sourcePersonId);
    setEditTargetId(relationship.targetPersonId);
    setSelectedId(relationship.id);
    setRelationshipLabel("关系");
    setDialog(undefined);
  };
  const openRelationshipEditor = (sourcePersonId: string, targetPersonId: string) => {
    setSourceId(sourcePersonId);
    setTargetId(targetPersonId);
    setDialog("relationship");
  };
  const connectFromCanvas = (sourcePersonId: string, targetPersonId: string, kind: RelationshipKind) => {
    const relationship = createRelationship({ sourcePersonId, targetPersonId, forwardLabel: relationshipLabel.trim() || "关系", kind, symmetric: kind === "undirected" });
    update({ ...project, relationships: [...project.relationships, relationship] });
    setEditSourceId(relationship.sourcePersonId);
    setEditTargetId(relationship.targetPersonId);
    setSelectedId(relationship.id);
  };
  const editPersonProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPerson) return;
    const data = new FormData(event.currentTarget);
    const name = data.get("profile-name")?.toString().trim();
    if (!name) return;
    const chapter = Number(data.get("first-appearance"));
    const aliases = splitList(data.get("aliases")?.toString());
    const affiliation = data.get("affiliation")?.toString().trim() || undefined;
    const eventIds = data.getAll("event-id").map(String);
    const eventTitles = data.getAll("event-title").map((value) => value.toString().trim());
    const eventChapters = data.getAll("event-chapter").map((value) => Number(value));
    const eventDescriptions = data.getAll("event-description").map((value) => value.toString().trim());
    const eventLocations = data.getAll("event-location").map((value) => value.toString().trim());
    const events = eventTitles.map((title, index) => title ? {
      id: eventIds[index] || crypto.randomUUID(),
      title,
      position: Number.isInteger(eventChapters[index]) && eventChapters[index] > 0 ? { kind: "chapter" as const, value: eventChapters[index] } : undefined,
      description: eventDescriptions[index] || undefined,
      location: eventLocations[index] || undefined,
    } : undefined).filter((item): item is NonNullable<typeof item> => Boolean(item));
    update({
      ...project,
      people: project.people.map((person) => person.id === selectedPerson.id ? {
        ...person,
        name,
        aliases,
        firstAppearance: Number.isInteger(chapter) && chapter > 0 ? { kind: "chapter", value: chapter } : undefined,
        affiliation,
        ...(affiliation !== person.affiliation ? { geo: undefined } : {}),
        summary: data.get("summary")?.toString().trim() || undefined,
        personalityTags: splitList(data.get("personality-tags")?.toString()),
        identityTags: splitList(data.get("identity-tags")?.toString()),
        notes: data.get("notes")?.toString().trim() || undefined,
        events,
        updatedAt: new Date().toISOString(),
      } : person),
    });
  };
  const uploadAvatar = async (file?: File) => {
    if (!selectedPerson || !file) return;
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }
    const assetId = crypto.randomUUID();
    await saveAsset({ id: assetId, projectId: project.id, fileName: file.name, mimeType: file.type, blob: file });
    if (selectedPerson.avatarAssetId) await deleteAsset(selectedPerson.avatarAssetId);
    update({ ...project, people: project.people.map((person) => person.id === selectedPerson.id ? { ...person, avatarAssetId: assetId, updatedAt: new Date().toISOString() } : person) });
    setAvatarError("");
  };
  const removeAvatar = async () => {
    if (!selectedPerson?.avatarAssetId) return;
    await deleteAsset(selectedPerson.avatarAssetId);
    update({ ...project, people: project.people.map((person) => person.id === selectedPerson.id ? { ...person, avatarAssetId: undefined, updatedAt: new Date().toISOString() } : person) });
    setAvatarError("");
  };
  const createCategory = (event: FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    const category = { id: crypto.randomUUID(), name: categoryName.trim(), values: [] };
    update({ ...project, categories: [...project.categories, category] });
    setActiveCategoryId(category.id);
    setCategoryName("");
  };
  const addCategoryValue = (event: FormEvent) => {
    event.preventDefault();
    if (!activeCategory || !categoryValueName.trim()) return;
    const value = { id: crypto.randomUUID(), name: categoryValueName.trim(), color: categoryValueColor };
    update({ ...project, categories: project.categories.map((category) => category.id === activeCategory.id ? { ...category, values: [...category.values, value] } : category) });
    setCategoryValueName("");
  };
  const toggleCategoryValue = (personId: string, categoryId: string, valueId: string, checked: boolean) => {
    update({ ...project, people: project.people.map((person) => person.id === personId ? { ...person, categoryValues: { ...person.categoryValues, [categoryId]: checked ? [...new Set([...(person.categoryValues[categoryId] ?? []), valueId])] : (person.categoryValues[categoryId] ?? []).filter((id) => id !== valueId) }, updatedAt: new Date().toISOString() } : person) });
  };
  const toggleSelectedPersonFixed = () => {
    if (!selectedPerson) return;
    const current = project.layout[selectedPerson.id] ?? { x: 0, y: 0, fixed: false };
    update({ ...project, layout: { ...project.layout, [selectedPerson.id]: { ...current, fixed: !current.fixed } } });
  };
  const setProfileBlockOrder = (order: ProfileBlockKind[]) => {
    if (!selectedPerson) return;
    update({ ...project, people: project.people.map((person) => person.id === selectedPerson.id ? { ...person, profileBlockOrder: order, updatedAt: new Date().toISOString() } : person) });
  };
  const removeProfileBlock = (kind: ProfileBlockKind) => {
    if (!selectedPerson) return;
    const order = getVisibleProfileBlocks(selectedPerson).filter((item) => item !== kind);
    update({ ...project, people: project.people.map((person) => person.id === selectedPerson.id ? clearProfileBlock({ ...person, profileBlockOrder: order, updatedAt: new Date().toISOString() }, kind) : person) });
  };
  const removeSelected = () => {
    if (!selectedId || !window.confirm("确定删除当前选中内容？此操作不可撤销。")) return;
    if (selectedPerson) {
      update({
        ...project,
        people: project.people.filter((person) => person.id !== selectedId),
        relationships: project.relationships.filter((relationship) => relationship.sourcePersonId !== selectedId && relationship.targetPersonId !== selectedId),
        layout: Object.fromEntries(Object.entries(project.layout).filter(([id]) => id !== selectedId)),
      });
    } else {
      update({ ...project, relationships: project.relationships.filter((relationship) => relationship.id !== selectedId) });
    }
    setSelectedId(undefined);
  };
  const editSelected = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = data.get("selected-name")?.toString().trim();
    if (!value) return;
    if (selectedPerson) {
      update({ ...project, people: project.people.map((person) => person.id === selectedPerson.id ? { ...person, name: value, updatedAt: new Date().toISOString() } : person) });
    } else if (selectedRelationship) {
      const kind = editRelationshipKind;
      const description = editDescription.trim() || undefined;
      const endpointsExist = project.people.some((person) => person.id === editSourceId) && project.people.some((person) => person.id === editTargetId);
      if (!endpointsExist || editSourceId === editTargetId) {
        setEndpointError(editSourceId === editTargetId ? "起点与终点不能是同一个人物" : "起点与终点必须是已有的人物节点");
        return;
      }
      update({ ...project, relationships: project.relationships.map((relationship) => relationship.id === selectedRelationship.id ? { ...relationship, sourcePersonId: editSourceId, targetPersonId: editTargetId, forwardLabel: value, kind, symmetric: kind === "undirected", description, updatedAt: new Date().toISOString() } : relationship) });
    }
  };
  const selectEndpoint = (personId: string) => {
    const otherId = endpointPicking === "source" ? editTargetId : editSourceId;
    if (personId === otherId) {
      setEndpointError("起点与终点不能是同一个人物");
      return;
    }
    if (endpointPicking === "source") setEditSourceId(personId);
    if (endpointPicking === "target") setEditTargetId(personId);
    if (selectedRelationship && !descriptionEdited) setEditDescription(calculateRelationshipDescription({ ...selectedRelationship, sourcePersonId: endpointPicking === "source" ? personId : editSourceId, targetPersonId: endpointPicking === "target" ? personId : editTargetId, kind: editRelationshipKind }, project.people));
    setEndpointPicking(undefined);
    setEndpointError("");
  };
  const handleCanvasSelect = (id?: string) => {
    if (endpointPicking === "calculationSource" || endpointPicking === "calculationTarget") {
      if (id && project.people.some((person) => person.id === id)) {
        if (endpointPicking === "calculationSource" && id !== calculationTargetId) setCalculationSourceId(id);
        if (endpointPicking === "calculationTarget" && id !== calculationSourceId) setCalculationTargetId(id);
      }
      setEndpointPicking(undefined);
      return;
    }
    if (endpointPicking) {
      if (id && project.people.some((person) => person.id === id)) selectEndpoint(id);
      else {
        setEndpointPicking(undefined);
        setEndpointError("");
      }
      return;
    }
    const relationship = project.relationships.find((item) => item.id === id);
    if (relationship) {
      setEditSourceId(relationship.sourcePersonId);
      setEditTargetId(relationship.targetPersonId);
      const kind = relationship.kind ?? (relationship.symmetric ? "undirected" : "directed");
      setEditRelationshipKind(kind);
      setEditDescription(relationship.description || calculateRelationshipDescription(relationship, project.people));
      setDescriptionEdited(Boolean(relationship.description));
      setEndpointError("");
    }
    // 点空白关闭详情面板：自动提交未保存的编辑（关系类型/端点/说明与人物名称），
    // 避免"视图已变但数据未保存、离开后恢复原样"的割裂体验。
    if (id === undefined && selectedRelationship && detailFormRef.current) {
      detailFormRef.current.requestSubmit();
    }
    if (id === undefined) {
      setJourneyStopId(undefined);
      setObservationToolsOpen(false);
      setMoreToolsOpen(false);
    }
    setEndpointPicking(undefined);
    setSelectedId(id);
  };

  return (
    <main className={`graph-workspace ${selectedId ? "graph-workspace--details" : ""}`} data-testid="graph-workspace">
      <header className="graph-toolbar">
        <button className="icon-button" type="button" aria-label="返回项目首页" onClick={onBack}>←</button>
        <div className="graph-toolbar__title"><h1>{project.name}</h1><span>{project.people.length} 个人物 · {project.relationships.length} 条关系</span></div>
        <div className="graph-toolbar__actions">
          <div className="history-actions" aria-label="操作历史">
            <button className="icon-button" type="button" aria-label="撤销" title="撤销（Ctrl+Z）" disabled={!canUndo} onClick={onUndo}>↶</button>
            <button className="icon-button" type="button" aria-label="重做" title="重做（Ctrl+Y）" disabled={!canRedo} onClick={onRedo}>↷</button>
          </div>
          {(onExport || onGraphExport) && <button className="button button--ghost" type="button" onClick={() => setExportDialogOpen(true)}>导出项目</button>}
          <div className="toolbar-more">
            <button className="button button--ghost toolbar-more__toggle" type="button" aria-label="更多功能" aria-expanded={moreToolsOpen} onClick={() => setMoreToolsOpen((open) => !open)}>更多⌄</button>
            {moreToolsOpen && <div className="toolbar-more__menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setParseOpen((open) => !open); setMoreToolsOpen(false); }}>句子解析</button>
              {onAddFromFolder && <button type="button" role="menuitem" disabled={previewMode} onClick={() => { setFolderPersonIds([]); setFolderRelationshipIds([]); setDialog("folder"); setMoreToolsOpen(false); }}>从文件夹加入</button>}
              <button type="button" role="menuitem" aria-label={previewMode ? "退出预览模式" : "开启预览模式"} onClick={() => { setPreviewMode((current) => !current); setSelectedId(undefined); setMoreToolsOpen(false); }}>{previewMode ? "退出预览" : "预览模式"}</button>
              <button type="button" role="menuitem" aria-label="重新布局" onClick={() => { setLayoutAction({ kind: "relayout", nonce: Date.now() }); setMoreToolsOpen(false); }}>重新布局</button>
              <button type="button" role="menuitem" aria-label="适应全图" onClick={() => { setLayoutAction({ kind: "fit", nonce: Date.now() }); setMoreToolsOpen(false); }}>适应全图</button>
            </div>}
          </div>
          <button className="toolbar-create-button" type="button" aria-label="添加关系" title="添加关系" disabled={previewMode || project.people.length < 2} onClick={() => openRelationshipEditor(project.people[0]?.id ?? "", project.people[1]?.id ?? "")}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="6" cy="7" r="2.5" /><circle cx="17" cy="15" r="2.5" /><path d="M8.2 8.3 14.8 13.7M17 5v5M14.5 7.5h5" /></svg></button>
          <button className="toolbar-create-button" type="button" aria-label="添加人物" title="添加人物" disabled={previewMode} onClick={() => setDialog("person")}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="7" r="3" /><path d="M3.5 18c.8-4 2.7-6 5.5-6s4.7 2 5.5 6M18 9v7M14.5 12.5h7" /></svg></button>
        </div>
      </header>
      {exportStatus && <p className="export-status" role="status">{exportStatus}</p>}
      <aside className="graph-sidebar">
        <section className="sidebar-section sidebar-section--stats" aria-label="项目统计"><h3>项目统计</h3><div className="graph-stats"><span><strong>{project.people.length}</strong>人物</span><span><strong>{project.relationships.length}</strong>关系</span></div></section>
        <section className="sidebar-section people-search" aria-label="人物搜索">
          <h3>搜索定位</h3>
          <input id="people-search-input" aria-label="搜索人物" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="姓名、别名、标签或势力" />
          {searchQuery.trim() && <div className="people-search__results">{searchResults.length ? searchResults.map((person) => {
            const detail = person.aliases[0] ?? person.affiliation ?? person.identityTags[0] ?? person.personalityTags[0] ?? "";
            return <button type="button" className={searchFocusId === person.id ? "is-active" : ""} key={person.id} onClick={() => setSearchFocusId(person.id)}><strong>{person.name}</strong>{detail && <span>{detail}</span>}</button>;
          }) : <p>没有匹配人物</p>}</div>}
          {searchFocusId && <button className="people-search__clear" type="button" onClick={() => setSearchFocusId("")}>清除定位</button>}
        </section>
        {project.graphType !== "geography" && <section className="sidebar-section relationship-calculator" aria-label="多节点关系计算"><h3>多节点关系计算</h3><p>选择起点和终点，系统计算最短关系路径与称谓。</p><div className="calculator-picker"><EndpointPicker key={`calculation-source-${calculationSourceId}`} id="calculation-source" label="计算起点" people={project.people} value={calculationSourceId} onChange={(id) => { if (id !== calculationTargetId) setCalculationSourceId(id); }} /><button className={`button button--ghost ${endpointPicking === "calculationSource" ? "is-active" : ""}`} type="button" aria-label="从画布选择计算起点" onClick={() => setEndpointPicking("calculationSource")}>👆</button></div><div className="calculator-picker"><EndpointPicker key={`calculation-target-${calculationTargetId}`} id="calculation-target" label="计算终点" people={project.people} value={calculationTargetId} onChange={(id) => { if (id !== calculationSourceId) setCalculationTargetId(id); }} /><button className={`button button--ghost ${endpointPicking === "calculationTarget" ? "is-active" : ""}`} type="button" aria-label="从画布选择计算终点" onClick={() => setEndpointPicking("calculationTarget")}>👆</button></div>
          {focusedPath?.disconnected && <p className="people-search__hint">所选人物之间没有可达关系</p>}
          {relationshipInference && <section className="relationship-inference" aria-label="关系计算结果"><span>关系计算</span>{relationshipInference.status === "conflict" ? <><h3>存在冲突候选</h3>{relationshipInference.candidates.map((candidate, index) => <div className="relationship-inference__candidate" key={`${candidate.result}-${index}`}><strong>{candidate.result}</strong>{candidate.chain.map((step) => <p key={step}>{step}</p>)}</div>)}</> : <><h3>{relationshipInference.result}</h3>{relationshipInference.chains.map((chain, index) => <div className="relationship-inference__candidate" key={index}>{chain.map((step) => <p key={step}>{step}</p>)}</div>)}{relationshipInference.status === "unknown" && relationshipInference.reasons.map((reason) => <small key={reason}>{reason}</small>)}</>}</section>}
        </section>}
        <section className="sidebar-section category-panel"><h3>颜色归类</h3>{project.categories.length ? <><label htmlFor="active-category">当前维度</label><select id="active-category" value={activeCategory?.id} onChange={(event) => setActiveCategoryId(event.target.value)}>{project.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{activeCategory && <form onSubmit={addCategoryValue}><input aria-label="新标签名称" value={categoryValueName} onChange={(event) => setCategoryValueName(event.target.value)} placeholder="添加标签值" /><input aria-label="标签颜色" type="color" value={categoryValueColor} onChange={(event) => setCategoryValueColor(event.target.value)} /><button type="submit" disabled={!categoryValueName.trim()}>添加</button></form>}<div className="category-legend">{activeCategory?.values.map((value) => <span key={value.id}><i style={{ backgroundColor: value.color }} />{value.name}</span>)}</div></> : <p>创建“家族”“学派”等维度，为人物分组着色。</p>}<form onSubmit={createCategory}><input aria-label="新归类维度" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="新建归类维度" /><button type="submit" disabled={!categoryName.trim()}>创建</button></form></section>
      </aside>
      <section className="graph-stage">
        <div className="observation-tools">
          {observationToolsOpen && <div className="observation-tools__panel" aria-label="阅读进度">
            <div className="observation-tools__heading"><strong>阅读进度</strong><label className="compact-switch"><input type="checkbox" aria-label="匹配当前阅读进度" checked={observationEnabled} onChange={(event) => { setObservationEnabled(event.target.checked); if (event.target.checked && observationChapter > timelineMaximum) setObservationChapter(timelineMaximum); }} /><span /></label></div>
            <strong className="observation-tools__value">{observationEnabled ? `第 ${observationChapter} 章` : "全部章节"}</strong>
            <input className="progress-slider" type="range" aria-label="当前章节" min="1" max={timelineMaximum} value={Math.min(observationChapter, timelineMaximum)} disabled={!observationEnabled} onChange={(event) => setObservationChapter(Number(event.target.value))} />
            <p>{observationEnabled ? `已阅读至第 ${observationChapter} 章。` : "当前显示全部人物与关系。"}</p>
          </div>}
          <button className={`observation-tools__toggle ${observationToolsOpen ? "is-open" : ""}`} type="button" aria-label={observationToolsOpen ? "关闭阅读进度" : "打开阅读进度"} title="阅读进度" onClick={() => setObservationToolsOpen((open) => !open)}><span aria-hidden="true">☷</span></button>
        </div>
        {!previewMode && <button className={`relationship-tools-toggle ${relationshipToolsOpen ? "is-open" : ""}`} type="button" aria-label={relationshipToolsOpen ? "关闭关系工具" : "打开关系工具"} title="关系工具" onClick={() => setRelationshipToolsOpen((open) => !open)}>↗</button>}
        {!previewMode && relationshipToolsOpen && <div className="relationship-tools relationship-tools--floating" aria-label="关系工具">
          <button className="relationship-tools__close" type="button" aria-label="关闭关系工具" onClick={() => setRelationshipToolsOpen(false)}>×</button>
          <div><label htmlFor="new-relationship-kind">新关系类型</label><select id="new-relationship-kind" value={relationshipKind} onChange={(event) => setRelationshipKind(event.target.value as RelationshipKind)}><option value="directed">单向关系 →</option><option value="bidirectional">双向关系 ⮂</option><option value="undirected">共同关系 —</option><option value="contact">曾有联系 ┄</option></select></div>
          <div><label htmlFor="new-relationship-name">新关系名称</label><input id="new-relationship-name" value={relationshipLabel} onChange={(event) => setRelationshipLabel(event.target.value)} /></div>
          <div><label htmlFor="relationship-preview">分类预览</label><select id="relationship-preview" value={previewKind} onChange={(event) => setPreviewKind(event.target.value as RelationshipKind | "all")}><option value="all">全部关系</option><option value="directed">单向关系</option><option value="bidirectional">双向关系</option><option value="undirected">共同关系</option><option value="contact">曾有联系</option></select></div>
          <p>右键人物开始连线，再次右键目标完成；左键取消。</p>
        </div>}
        {project.graphType !== "geography" && project.people.length === 0 && <div className="canvas-empty"><div className="empty-projects__symbol">◇</div><h2>从第一个人物开始</h2><p>添加人物后，节点会出现在这张关系图中。</p><button className="button button--primary" type="button" onClick={() => setDialog("person")}>添加人物</button></div>}
        {project.graphType === "people" ? <GraphCanvas project={project} selectedId={selectedId} previewKind={previewKind} relationshipKind={relationshipKind} endpointPicking={Boolean(endpointPicking)} avatarUrls={avatarUrls} nodeColors={nodeColors} previewMode={previewMode} focusPersonIds={focusedPath?.personIds ?? focusPersonIds} focusRelationshipIds={focusedPath?.relationshipIds} observationChapter={observationEnabled ? observationChapter : undefined} layoutAction={layoutAction} onLayoutChange={(layout) => update({ ...project, layout })} onExporterReady={setGraphExporter} onSelect={handleCanvasSelect} onConnect={connectFromCanvas} onMove={(personId, x, y) => update({ ...project, layout: { ...project.layout, [personId]: { x, y, fixed: false } } })} /> : <GeographyCanvas project={project} selectedId={selectedId} onSelect={handleCanvasSelect} onConnect={connectFromCanvas} relationshipKind={relationshipKind} onPersonGeoChange={(personId, geo) => update({ ...project, people: project.people.map((person) => person.id === personId ? { ...person, geo, updatedAt: new Date().toISOString() } : person) })} focusPersonIds={focusPersonIds} observationChapter={observationEnabled ? observationChapter : undefined} journeyStops={project.graphType === "journey" ? project.journey?.stops : undefined} selectedStopId={journeyStopId} onSelectStop={setJourneyStopId} />}
        {project.graphType === "journey" && <JourneyPanel project={project} observationChapter={observationChapter} selectedStopId={journeyStopId} onChange={update} onSelectStop={setJourneyStopId} onFocusPerson={(personId) => setSearchFocusId(personId)} />}
        {parseOpen && <SentenceParsePanel key={parseNonce} project={project} initialSentence={parseInitialSentence} onApply={commit} onClose={() => setParseOpen(false)} />}
      </section>
      {selectedId && <aside className="detail-panel" data-testid="detail-panel">
        <button className="detail-close" type="button" aria-label="关闭详细信息" onClick={() => { if (selectedRelationship && detailFormRef.current) detailFormRef.current.requestSubmit(); setSelectedId(undefined); }}>×</button>
        <p className="section-kicker">{selectedPerson ? "人物资料" : "关系资料"}</p>
        <h2>{selectedPerson?.name ?? selectedRelationship?.forwardLabel}</h2>
        {selectedPerson && <button className="button button--ghost node-pin-button" type="button" onClick={toggleSelectedPersonFixed}>{project.layout[selectedPerson.id]?.fixed ? "取消固定" : "固定节点"}</button>}
        <form className="detail-edit" ref={detailFormRef} onSubmit={editSelected}>
          <label htmlFor="selected-name">{selectedPerson ? "编辑人物名称" : "编辑关系名称"}</label>
          <div><input id="selected-name" name={selectedPerson ? "profile-name" : "selected-name"} form={selectedPerson ? "person-profile-form" : undefined} key={selectedPerson?.name ?? selectedRelationship?.forwardLabel} defaultValue={selectedPerson?.name ?? selectedRelationship?.forwardLabel} /></div>
          {selectedRelationship && <><label htmlFor="selected-kind">编辑关系类型</label><select id="selected-kind" name="selected-kind" value={editRelationshipKind} onChange={(event) => { const kind = event.target.value as RelationshipKind; setEditRelationshipKind(kind); if (!descriptionEdited) setEditDescription(calculateRelationshipDescription({ ...selectedRelationship, sourcePersonId: editSourceId, targetPersonId: editTargetId, kind }, project.people)); }}><option value="directed">单向关系 →</option><option value="bidirectional">双向关系 ⮂</option><option value="undirected">共同关系 —</option><option value="contact">曾有联系 ┄</option></select></>}
          {selectedRelationship && <div className="endpoint-editor"><EndpointPicker key={`source-${editSourceId}`} id="selected-source" label="起点人物" people={project.people} value={editSourceId} onChange={(id) => { setEditSourceId(id); setEndpointError(id === editTargetId ? "起点与终点不能是同一个人物" : ""); if (!descriptionEdited) setEditDescription(calculateRelationshipDescription({ ...selectedRelationship, sourcePersonId: id, targetPersonId: editTargetId, kind: editRelationshipKind }, project.people)); }} /><button className={`button button--ghost ${endpointPicking === "source" ? "is-active" : ""}`} type="button" aria-label="从画布选择起点" onClick={() => { setEndpointPicking("source"); setEndpointError(""); }}>👆 点击选择</button><EndpointPicker key={`target-${editTargetId}`} id="selected-target" label="终点人物" people={project.people} value={editTargetId} onChange={(id) => { setEditTargetId(id); setEndpointError(id === editSourceId ? "起点与终点不能是同一个人物" : ""); if (!descriptionEdited) setEditDescription(calculateRelationshipDescription({ ...selectedRelationship, sourcePersonId: editSourceId, targetPersonId: id, kind: editRelationshipKind }, project.people)); }} /><button className={`button button--ghost ${endpointPicking === "target" ? "is-active" : ""}`} type="button" aria-label="从画布选择终点" onClick={() => { setEndpointPicking("target"); setEndpointError(""); }}>👆 点击选择</button></div>}
          {selectedRelationship && <><label htmlFor="selected-description">关系说明</label><textarea id="selected-description" name="selected-description" value={editDescription} onChange={(event) => { setEditDescription(event.target.value); setDescriptionEdited(true); }} rows={4} /></>}
          {selectedRelationship && endpointPicking && <p className="endpoint-hint">请在画布中点击一个人物节点作为{endpointPicking === "source" ? "起点" : "终点"}</p>}
          {selectedRelationship && endpointError && <p className="form-error" role="alert">{endpointError}</p>}
          {selectedRelationship && <button className="button button--ghost" type="submit" disabled={!editSourceId || !editTargetId || editSourceId === editTargetId}>保存修改</button>}
        </form>
        {selectedPerson ? <form id="person-profile-form" className="profile-form profile-block-stack" onSubmit={editPersonProfile}>
          <section className="avatar-editor"><div className="avatar-preview">{avatarUrls[selectedPerson.id] ? <img src={avatarUrls[selectedPerson.id]} alt={`${selectedPerson.name}头像`} /> : <span>{selectedPerson.name.slice(0, 1)}</span>}</div><div><label className="button button--ghost" htmlFor="profile-avatar">上传头像</label><input id="profile-avatar" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event.target.files?.[0])} />{selectedPerson.avatarAssetId && <button type="button" className="avatar-remove" onClick={() => void removeAvatar()}>移除头像</button>}<small>JPEG、PNG 或 WebP，最大 2 MB</small></div></section>
          {avatarError && <p className="form-error" role="alert">{avatarError}</p>}
          <div className="profile-block-adder"><select aria-label="选择资料块" value={profileBlockToAdd} onChange={(event) => setProfileBlockToAdd(event.target.value as ProfileBlockKind)}>{allProfileBlocks.filter((kind) => !getVisibleProfileBlocks(selectedPerson).includes(kind)).map((kind) => <option key={kind} value={kind}>{profileBlockLabels[kind]}</option>)}</select><button className="button button--ghost" type="button" aria-label="添加资料块" disabled={getVisibleProfileBlocks(selectedPerson).includes(profileBlockToAdd)} onClick={() => setProfileBlockOrder([...getVisibleProfileBlocks(selectedPerson), profileBlockToAdd])}>＋</button></div>
          {getVisibleProfileBlocks(selectedPerson).map((kind, index, order) => <section className="profile-block" data-testid="profile-block" data-block={kind} key={kind}><header><strong>{profileBlockLabels[kind]}</strong><span><button type="button" aria-label={`上移${profileBlockLabels[kind]}`} disabled={index === 0} onClick={() => setProfileBlockOrder(moveProfileBlock(order, kind, -1))}>↑</button><button type="button" aria-label={`下移${profileBlockLabels[kind]}`} disabled={index === order.length - 1} onClick={() => setProfileBlockOrder(moveProfileBlock(order, kind, 1))}>↓</button><button type="button" aria-label={`删除${profileBlockLabels[kind]}`} onClick={() => removeProfileBlock(kind)}>删除</button></span></header>{renderProfileBlock(kind, selectedPerson)}</section>)}
          {activeCategory && activeCategory.values.length > 0 && <fieldset className="person-categories"><legend>{activeCategory.name}</legend>{activeCategory.values.map((value) => <label key={value.id}><input type="checkbox" checked={(selectedPerson.categoryValues[activeCategory.id] ?? []).includes(value.id)} onChange={(event) => toggleCategoryValue(selectedPerson.id, activeCategory.id, value.id, event.target.checked)} /><i style={{ backgroundColor: value.color }} />{value.name}</label>)}</fieldset>}
          <button className="button button--primary" type="submit">保存人物资料</button>
        </form> : selectedRelationship && null}
        {onRemoveFromView && onDeleteFromFolder ? <div className="shared-delete-actions"><button className="button button--ghost" type="button" onClick={() => { onRemoveFromView(selectedPerson ? "person" : "relationship", selectedId); setSelectedId(undefined); }}>从当前图移除</button><button className="button danger-button" type="button" onClick={() => { onDeleteFromFolder(selectedPerson ? "person" : "relationship", selectedId); setSelectedId(undefined); }}>从文件夹永久删除</button></div> : <button className="button danger-button" type="button" onClick={removeSelected}>删除{selectedPerson ? "人物" : "关系"}</button>}
      </aside>}

      {dialog === "person" && <Dialog title="添加人物" onClose={() => setDialog(undefined)}><form onSubmit={addPerson}><label htmlFor="person-name">人物名称</label><input id="person-name" autoFocus value={personName} onChange={(event) => setPersonName(event.target.value)} /><div className="dialog-actions"><button className="button button--ghost" type="button" onClick={() => setDialog(undefined)}>取消</button><button className="button button--primary" type="submit" disabled={!personName.trim()}>保存人物</button></div></form></Dialog>}
      {dialog === "relationship" && <Dialog title="编辑关系" onClose={() => setDialog(undefined)}><form onSubmit={addRelationship}><label htmlFor="relation-kind">关系类型</label><select id="relation-kind" value={relationshipKind} onChange={(event) => setRelationshipKind(event.target.value as RelationshipKind)}><option value="directed">单向关系</option><option value="bidirectional">双向关系</option><option value="undirected">共同关系</option><option value="contact">曾有联系</option></select><label htmlFor="relation-source">起始人物</label><select id="relation-source" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{project.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><label htmlFor="relation-target">目标人物</label><select id="relation-target" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{project.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><label htmlFor="relation-label">关系名称</label><input id="relation-label" value={relationshipLabel} onChange={(event) => setRelationshipLabel(event.target.value)} placeholder="例如：朋友、父子、师生" /><p className="relationship-summary">{relationshipSentence(project, sourceId, targetId, relationshipLabel || "……", relationshipKind)}</p><div className="dialog-actions"><button className="button button--ghost" type="button" onClick={() => setDialog(undefined)}>取消</button><button className="button button--primary" type="submit" disabled={!sourceId || !targetId || sourceId === targetId || !relationshipLabel.trim()}>保存关系</button></div></form></Dialog>}
      {dialog === "folder" && <Dialog title="从当前文件夹加入" onClose={() => setDialog(undefined)}><div className="folder-member-picker"><p>选择要加入当前图的人物与关系。加入关系时会自动加入其起点和终点人物。</p><div className="folder-member-picker__scroll"><h3>人物</h3>{folderPeople.filter((person) => !project.people.some((current) => current.id === person.id)).map((person) => <label key={person.id}><input type="checkbox" checked={folderPersonIds.includes(person.id)} onChange={(event) => setFolderPersonIds((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} />{person.name}</label>)}<h3>关系</h3>{folderRelationships.filter((relationship) => !project.relationships.some((current) => current.id === relationship.id)).map((relationship) => { const source = folderPeople.find((person) => person.id === relationship.sourcePersonId)?.name ?? "未知人物"; const target = folderPeople.find((person) => person.id === relationship.targetPersonId)?.name ?? "未知人物"; return <label key={relationship.id}><input type="checkbox" checked={folderRelationshipIds.includes(relationship.id)} onChange={(event) => setFolderRelationshipIds((current) => event.target.checked ? [...current, relationship.id] : current.filter((id) => id !== relationship.id))} />{source} · {relationship.forwardLabel} · {target}</label>; })}</div><div className="dialog-actions folder-member-picker__footer"><button className="button button--ghost" type="button" onClick={() => setDialog(undefined)}>取消</button><button className="button button--primary" type="button" disabled={!folderPersonIds.length && !folderRelationshipIds.length} onClick={() => { onAddFromFolder?.(folderPersonIds, folderRelationshipIds); setDialog(undefined); }}>加入当前图</button></div></div></Dialog>}
      {exportDialogOpen && <Dialog title="导出项目" onClose={() => setExportDialogOpen(false)}><div className="export-format-grid"><p>JSON 可恢复全部资料；图片与 PDF 导出包含全部节点和关系的完整图谱。</p>{onExport && <button className="button button--ghost" type="button" onClick={() => { setExportDialogOpen(false); setExportStatus("正在导出…"); void onExport(project).then(() => setExportStatus("导出完成")).catch((reason: unknown) => setExportStatus(reason instanceof Error ? reason.message : "导出失败")); }}>JSON 完整备份</button>}{([['png', 'PNG 图片'], ['jpg', 'JPG 图片'], ['pdf', 'PDF 文档']] as const).map(([format, label]) => <button className="button button--ghost" type="button" key={format} disabled={!graphExporter || !onGraphExport || project.people.length === 0} onClick={() => { if (!graphExporter || !onGraphExport) return; setExportDialogOpen(false); setExportStatus("正在导出…"); void onGraphExport(format, graphExporter).then(() => setExportStatus("导出完成")).catch((reason: unknown) => setExportStatus(reason instanceof Error ? reason.message : "导出失败")); }}>{label}</button>)}</div></Dialog>}
    </main>
  );
}

function relationshipSentence(project: ProjectDocument, sourceId: string, targetId: string, label: string, kind: RelationshipKind): string {
  const source = project.people.find((person) => person.id === sourceId)?.name ?? "起始人物";
  const target = project.people.find((person) => person.id === targetId)?.name ?? "目标人物";
  return kind === "undirected" || kind === "contact" ? `${source}与${target}是${label}关系` : `${source}是${target}的${label}`;
}

function splitList(value?: string): string[] {
  return value?.split(/[、，,;；\n]/).map((item) => item.trim()).filter(Boolean) ?? [];
}

function clearProfileBlock(person: ProjectDocument["people"][number], kind: ProfileBlockKind): ProjectDocument["people"][number] {
  switch (kind) {
    case "aliases": return { ...person, aliases: [] };
    case "firstAppearance": return { ...person, firstAppearance: undefined };
    case "affiliation": return { ...person, affiliation: undefined };
    case "summary": return { ...person, summary: undefined };
    case "personalityTags": return { ...person, personalityTags: [] };
    case "identityTags": return { ...person, identityTags: [] };
    case "events": return { ...person, events: [] };
    case "notes": return { ...person, notes: undefined };
  }
}

function renderProfileBlock(kind: ProfileBlockKind, person: ProjectDocument["people"][number]): ReactNode {
  switch (kind) {
    case "aliases": return <><label htmlFor="profile-aliases">别名</label><input id="profile-aliases" name="aliases" defaultValue={person.aliases.join("、")} placeholder="多个别名用顿号分隔" /></>;
    case "firstAppearance": return <><label htmlFor="profile-chapter">首次出场章节</label><input id="profile-chapter" name="first-appearance" type="number" min="1" defaultValue={person.firstAppearance?.value} /></>;
    case "affiliation": return <><label htmlFor="profile-affiliation">地点或所属势力</label><input id="profile-affiliation" name="affiliation" defaultValue={person.affiliation} /></>;
    case "summary": return <><label htmlFor="profile-summary">人物简介</label><textarea id="profile-summary" name="summary" defaultValue={person.summary} rows={4} /></>;
    case "personalityTags": return <><label htmlFor="profile-personality-tags">性格标签</label><input id="profile-personality-tags" name="personality-tags" defaultValue={person.personalityTags.join("、")} /></>;
    case "identityTags": return <><label htmlFor="profile-identity-tags">身份标签</label><input id="profile-identity-tags" name="identity-tags" defaultValue={person.identityTags.join("、")} /></>;
    case "events": return <EventEditor events={person.events} />;
    case "notes": return <><label htmlFor="profile-notes">人物备注</label><textarea id="profile-notes" name="notes" defaultValue={person.notes} rows={4} /></>;
  }
}


function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" role="presentation"><section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="graph-dialog-title"><button className="dialog-close" type="button" aria-label="关闭" onClick={onClose}>×</button><p className="eyebrow">GRAPH EDITOR</p><h2 id="graph-dialog-title">{title}</h2>{children}</section></div>;
}

function EventEditor({ events }: { events: ProjectDocument["people"][number]["events"] }) {
  const [rows, setRows] = useState(() => events.length ? events.map((event) => ({ ...event, rowId: event.id })) : [{ id: "", rowId: crypto.randomUUID(), title: "", description: undefined, location: undefined, position: undefined }]);
  const moveRow = (index: number, direction: -1 | 1) => setRows((current) => {
    const to = index + direction;
    if (to < 0 || to >= current.length) return current;
    const next = [...current];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
  });
  return <section className="event-editor"><div className="event-editor__heading"><div><strong>人物事件</strong><span>可手动调整事件顺序</span></div><button className="button button--ghost" type="button" onClick={() => setRows((current) => [...current, { id: "", rowId: crypto.randomUUID(), title: "", description: undefined, location: undefined, position: undefined }])}>＋ 添加事件</button></div>{rows.map((event, index) => <article className="event-card" key={event.rowId}><div className="event-card__title"><strong>事件 {index + 1}</strong><span><button type="button" aria-label={`上移事件 ${index + 1}`} disabled={index === 0} onClick={() => moveRow(index, -1)}>↑</button><button type="button" aria-label={`下移事件 ${index + 1}`} disabled={index === rows.length - 1} onClick={() => moveRow(index, 1)}>↓</button><button type="button" aria-label={`删除事件 ${index + 1}`} onClick={() => setRows((current) => current.length === 1 ? [{ id: "", rowId: crypto.randomUUID(), title: "", description: undefined, location: undefined, position: undefined }] : current.filter((item) => item.rowId !== event.rowId))}>删除</button></span></div><input type="hidden" name="event-id" value={event.id} /><label htmlFor={`event-title-${event.rowId}`}>事件标题 {index + 1}</label><input id={`event-title-${event.rowId}`} name="event-title" defaultValue={event.title} placeholder="发生了什么" /><div className="event-card__two"><div><label htmlFor={`event-chapter-${event.rowId}`}>事件章节 {index + 1}</label><input id={`event-chapter-${event.rowId}`} name="event-chapter" type="number" min="1" defaultValue={event.position?.value} /></div><div><label htmlFor={`event-location-${event.rowId}`}>事件地点 {index + 1}</label><input id={`event-location-${event.rowId}`} name="event-location" defaultValue={event.location} /></div></div><label htmlFor={`event-description-${event.rowId}`}>事件说明 {index + 1}</label><textarea id={`event-description-${event.rowId}`} name="event-description" defaultValue={event.description} rows={3} /></article>)}</section>;
}

function EndpointPicker({ id, label, people, value, onChange }: { id: string; label: string; people: ProjectDocument["people"]; value: string; onChange: (id: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = people.find((person) => person.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [open]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = people.filter((person) => !normalizedQuery || person.name.toLocaleLowerCase().includes(normalizedQuery) || person.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery)));
  return <div className="endpoint-picker" ref={rootRef}><label htmlFor={id}>{label}</label><input id={id} type="search" value={query} autoComplete="off" placeholder="搜索人物姓名或别名" aria-expanded={open} aria-controls={`${id}-options`} onFocus={() => setOpen(true)} onChange={(event) => { const next = event.target.value; setQuery(next); setOpen(true); const exact = people.find((person) => person.name === next || person.aliases.includes(next)); if (exact) onChange(exact.id); }} />{open && <div className="endpoint-options" id={`${id}-options`} role="listbox" aria-label={`${label}候选`} >{matches.length ? matches.map((person) => <button key={person.id} type="button" role="option" aria-selected={person.id === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(person.id); setQuery(person.name); setOpen(false); }}>{person.name}{person.aliases.length ? <span>{person.aliases.join("、")}</span> : null}</button>) : <p>没有匹配的已有人物</p>}</div>}</div>;
}
