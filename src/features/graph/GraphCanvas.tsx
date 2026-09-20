import cytoscape, { type Core, type EventObject, type NodeSingular } from "cytoscape";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ProjectDocument, RelationshipKind } from "../../domain/model";
import { resolveCollisionLayout } from "./collision";
import { toGraphElements } from "./graphProjection";
import { blobBytes, createPdfFromJpeg, type GraphImageExporter } from "./graphImageExport";

interface GraphCanvasProps {
  project: ProjectDocument;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onMove: (personId: string, x: number, y: number) => void;
  onConnect: (sourcePersonId: string, targetPersonId: string, kind: RelationshipKind) => void;
  previewKind: RelationshipKind | "all";
  relationshipKind: RelationshipKind;
  endpointPicking?: boolean;
  avatarUrls?: Record<string, string>;
  nodeColors?: Record<string, string>;
  previewMode?: boolean;
  focusPersonIds?: string[];
  focusRelationshipIds?: string[];
  observationChapter?: number;
  layoutAction?: { kind: "relayout" | "fit"; nonce: number };
  onLayoutChange?: (layout: ProjectDocument["layout"]) => void;
  onExporterReady?: (exporter?: GraphImageExporter) => void;
}

export function GraphCanvas({ project, selectedId, onSelect, onMove, onConnect, previewKind, relationshipKind, endpointPicking = false, avatarUrls = {}, nodeColors = {}, previewMode = false, focusPersonIds = [], focusRelationshipIds = [], observationChapter, layoutAction, onLayoutChange, onExporterReady }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const initialProjectRef = useRef(project);
  const initialAvatarUrlsRef = useRef(avatarUrls);
  const initialNodeColorsRef = useRef(nodeColors);
  const callbacksRef = useRef({ onSelect, onMove, onConnect, onLayoutChange });
  const relationshipKindRef = useRef(relationshipKind);
  const previewModeRef = useRef(previewMode);
  const lastLayoutActionRef = useRef<number | undefined>(undefined);
  const collisionLayoutRef = useRef<Record<string, { x: number; y: number }>>({});
  useLayoutEffect(() => {
    relationshipKindRef.current = relationshipKind;
    previewModeRef.current = previewMode;
  }, [previewMode, relationshipKind]);
  useEffect(() => {
    callbacksRef.current = { onSelect, onMove, onConnect, onLayoutChange };
  }, [onConnect, onLayoutChange, onMove, onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let handleRightPointerDown: ((event: PointerEvent) => void) | undefined;
    const interceptRightPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleRightPointerDown?.(event);
    };
    const blockRightMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const contextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    container.addEventListener("pointerdown", interceptRightPointerDown, true);
    container.addEventListener("mousedown", blockRightMouseDown, true);
    container.addEventListener("contextmenu", contextMenu, true);
    const cy = cytoscape({
      container,
      elements: toGraphElements(initialProjectRef.current, "all", initialAvatarUrlsRef.current, initialNodeColorsRef.current),
      autoungrabify: false,
      minZoom: 0.35,
      maxZoom: 2.4,
      style: [
        { selector: "node", style: { width: "74px", height: "74px", label: "data(label)", "background-color": "#f3c66c", "border-width": "4px", "border-color": "#fff8e8", color: "#282a37", "font-size": "12px", "font-weight": 700, "text-valign": "bottom", "text-margin-y": 12, "text-wrap": "wrap", "text-max-width": "100px", "overlay-opacity": 0 } },
        { selector: "node.has-avatar", style: { "background-image": "data(avatarUrl)" as never, "background-fit": "cover", "background-clip": "node" } },
        { selector: "node.has-category-color", style: { "background-color": "data(nodeColor)" as never } },
        { selector: "edge", style: { width: "2px", "line-color": "#767a8e", "target-arrow-color": "#767a8e", "source-arrow-color": "#767a8e", "target-arrow-shape": "triangle", "source-arrow-shape": "none", "line-style": "solid", "curve-style": "bezier", label: "data(label)", "font-size": "11px", color: "#565a6b", "text-background-color": "#f7f5ef", "text-background-opacity": 1, "text-background-padding": "4px" } },
        { selector: "edge.relationship-bidirectional", style: { "source-arrow-shape": "triangle", "target-arrow-shape": "triangle" } },
        { selector: "edge.relationship-undirected", style: { "source-arrow-shape": "none", "target-arrow-shape": "none" } },
        { selector: "edge.relationship-contact", style: { "source-arrow-shape": "none", "target-arrow-shape": "none", "line-style": "dashed" } },
        { selector: ".connection-preview", style: { "line-style": "dashed", "line-color": "#6157d8", "target-arrow-color": "#6157d8", "target-arrow-shape": "triangle", label: "" } },
        { selector: ".connection-cursor", style: { width: "1px", height: "1px", opacity: 0 } },
        { selector: ".connection-target", style: { "border-color": "#e78b3e", "border-width": "7px" } },
        { selector: ".is-dimmed", style: { opacity: 0.16, "text-opacity": 0.22 } },
        { selector: ".is-future", style: { opacity: 0.2, "text-opacity": 0.28, "line-color": "#aeb1bb", "target-arrow-color": "#aeb1bb", "source-arrow-color": "#aeb1bb" } },
        { selector: ".preview-dimmed", style: { opacity: 0.12, "text-opacity": 0.16 } },
        { selector: ".preview-focused", style: { opacity: 1, "text-opacity": 1, "z-index": 10 } },
        { selector: ".search-dimmed", style: { opacity: 0.12, "text-opacity": 0.16 } },
        { selector: ".search-focused", style: { opacity: 1, "text-opacity": 1, "z-index": 12 } },
        { selector: ":selected", style: { "border-color": "#6157d8", "border-width": "5px", "line-color": "#6157d8", "target-arrow-color": "#6157d8" } },
      ],
      layout: { name: "circle", padding: 90 },
    });
    cyRef.current = cy;
    onExporterReady?.({
      export: async (format) => {
        if (cy.nodes().empty()) throw new Error("空白图谱无法导出图片");
        const bounds = cy.elements().boundingBox({ includeLabels: true });
        const scale = Math.min(2, 4096 / Math.max(bounds.w + 160, bounds.h + 160, 1));
        const width = Math.max(1, Math.round((bounds.w + 160) * scale));
        const height = Math.max(1, Math.round((bounds.h + 160) * scale));
        if (format === "png") return cy.png({ output: "blob", full: true, bg: "#f7f5ef", scale }) as Blob;
        const jpeg = cy.jpg({ output: "blob", full: true, bg: "#f7f5ef", quality: 0.94, scale }) as Blob;
        return format === "jpg" ? jpeg : createPdfFromJpeg(await blobBytes(jpeg), width, height);
      },
    });
    initialProjectRef.current.people.forEach((person) => {
      const position = initialProjectRef.current.layout[person.id];
      if (position) {
        const node = cy.getElementById(person.id);
        node.position({ x: position.x, y: position.y });
        if (position.fixed) node.lock();
      }
    });
    const svgNamespace = "http://www.w3.org/2000/svg";
    const connectionOverlay = document.createElementNS(svgNamespace, "svg");
    connectionOverlay.classList.add("connection-overlay");
    connectionOverlay.setAttribute("aria-hidden", "true");
    connectionOverlay.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible";
    const marker = document.createElementNS(svgNamespace, "marker");
    marker.setAttribute("id", "connection-preview-arrow");
    marker.setAttribute("markerWidth", "12");
    marker.setAttribute("markerHeight", "12");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "6");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    const arrow = document.createElementNS(svgNamespace, "path");
    arrow.setAttribute("d", "M0,0 L0,12 L10,6 z");
    arrow.setAttribute("fill", "#6157d8");
    marker.append(arrow);
    const definitions = document.createElementNS(svgNamespace, "defs");
    definitions.append(marker);
    const connectionLine = document.createElementNS(svgNamespace, "line");
    connectionLine.setAttribute("stroke", "#6157d8");
    connectionLine.setAttribute("stroke-width", "3");
    connectionLine.setAttribute("stroke-dasharray", "9 7");
    connectionLine.setAttribute("marker-end", "url(#connection-preview-arrow)");
    connectionLine.setAttribute("visibility", "hidden");
    connectionOverlay.append(definitions, connectionLine);
    container.append(connectionOverlay);
    let connectionSourceId: string | undefined;
    let connectionSourcePosition: { x: number; y: number } | undefined;
    cy.on("tap", (event: EventObject) => callbacksRef.current.onSelect(event.target === cy ? undefined : event.target.id()));
    cy.on("drag", "node", (event: EventObject) => {
      if (event.target.id() === connectionSourceId && connectionSourcePosition) {
        event.target.position(connectionSourcePosition);
        return;
      }
      const position = event.target.position();
      const nextLayout = resolveCollisionLayout(
        { id: event.target.id(), ...position, fixed: false },
        cy.nodes().filter((node) => node.id() !== event.target.id()).map((node) => ({ id: node.id(), ...(node as NodeSingular).position(), fixed: (node as NodeSingular).locked() })),
        100,
      );
      collisionLayoutRef.current = nextLayout;
      Object.entries(nextLayout).forEach(([id, next]) => cy.getElementById(id).position(next));
    });
    cy.on("dragfree", "node", (event: EventObject) => {
      if (event.target.id() === connectionSourceId && connectionSourcePosition) {
        event.target.position(connectionSourcePosition);
        return;
      }
      const position = event.target.position();
      const changedLayout = collisionLayoutRef.current;
      collisionLayoutRef.current = {};
      if (Object.keys(changedLayout).length && callbacksRef.current.onLayoutChange) {
        callbacksRef.current.onLayoutChange(Object.fromEntries(cy.nodes().map((node) => [node.id(), { ...node.position(), fixed: node.locked() }])));
      } else callbacksRef.current.onMove(event.target.id(), position.x, position.y);
    });
    const clearConnectionPreview = () => {
      if (connectionSourceId) {
        const source = cy.getElementById(connectionSourceId);
        if (connectionSourcePosition) source.position(connectionSourcePosition);
      }
      cy.$(".connection-target").removeClass("connection-target");
      connectionLine.setAttribute("visibility", "hidden");
      connectionSourceId = undefined;
      connectionSourcePosition = undefined;
    };
    const beginConnection = (sourceId: string) => {
      const source = cy.getElementById(sourceId);
      if (source.empty()) return;
      clearConnectionPreview();
      connectionSourceId = sourceId;
      connectionSourcePosition = { ...source.position() };
      const renderedSource = source.renderedPosition();
      connectionLine.setAttribute("x1", String(renderedSource.x));
      connectionLine.setAttribute("y1", String(renderedSource.y));
      connectionLine.setAttribute("x2", String(renderedSource.x));
      connectionLine.setAttribute("y2", String(renderedSource.y));
      connectionLine.setAttribute("visibility", "visible");
      const kind = relationshipKindRef.current;
      connectionLine.setAttribute("marker-start", kind === "bidirectional" ? "url(#connection-preview-arrow)" : "none");
      connectionLine.setAttribute("marker-end", kind === "directed" || kind === "bidirectional" ? "url(#connection-preview-arrow)" : "none");
      connectionLine.setAttribute("stroke-dasharray", kind === "contact" ? "9 7" : "none");
    };
    const nodeAt = (event: MouseEvent, excludedId?: string, snapDistance = 0): NodeSingular | undefined => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return undefined;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return cy.nodes().filter((node) => {
        const position = node.renderedPosition();
        return node.id() !== excludedId && !node.hasClass("connection-cursor") && Math.hypot(position.x - x, position.y - y) <= Math.max(node.renderedWidth(), node.renderedHeight()) / 2 + snapDistance;
      }).first() as NodeSingular;
    };
    const rightPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      if (previewModeRef.current) return;
      if (!connectionSourceId) {
        const source = nodeAt(event);
        if (source && !source.empty()) beginConnection(source.id());
        return;
      }
      const target = nodeAt(event, connectionSourceId, 36);
      if (target && !target.empty()) callbacksRef.current.onConnect(connectionSourceId, target.id(), relationshipKindRef.current);
      clearConnectionPreview();
    };
    handleRightPointerDown = rightPointerDown;
    const pointerMove = (event: MouseEvent) => {
      if (!connectionSourceId) return;
      if (connectionSourcePosition) cy.getElementById(connectionSourceId).position(connectionSourcePosition);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      cy.$(".connection-target").removeClass("connection-target");
      const target = nodeAt(event, connectionSourceId, 36);
      let endX: number;
      let endY: number;
      if (target && !target.empty()) {
        target.addClass("connection-target");
        const renderedTarget = target.renderedPosition();
        endX = renderedTarget.x;
        endY = renderedTarget.y;
      } else {
        endX = event.clientX - rect.left;
        endY = event.clientY - rect.top;
      }
      const source = cy.getElementById(connectionSourceId).renderedPosition();
      const distance = Math.hypot(endX - source.x, endY - source.y) || 1;
      const unitX = (endX - source.x) / distance;
      const unitY = (endY - source.y) / distance;
      connectionLine.setAttribute("x1", String(source.x + unitX * 42));
      connectionLine.setAttribute("y1", String(source.y + unitY * 42));
      connectionLine.setAttribute("x2", String(target && !target.empty() ? endX - unitX * 45 : endX));
      connectionLine.setAttribute("y2", String(target && !target.empty() ? endY - unitY * 45 : endY));
    };
    const pointerDown = (event: MouseEvent) => {
      if (event.button === 0 && connectionSourceId) clearConnectionPreview();
    };
    container.addEventListener("mousedown", pointerDown);
    container.addEventListener("mousemove", pointerMove, true);
    window.addEventListener("mousemove", pointerMove, true);
    cy.on("mouseover", "node", (event: EventObject) => {
      if (!previewModeRef.current) return;
      const neighborhood = event.target.closedNeighborhood();
      cy.elements().addClass("preview-dimmed");
      neighborhood.removeClass("preview-dimmed").addClass("preview-focused");
    });
    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("preview-dimmed preview-focused");
    });
    return () => {
      handleRightPointerDown = undefined;
      container.removeEventListener("contextmenu", contextMenu, true);
      container.removeEventListener("pointerdown", interceptRightPointerDown, true);
      container.removeEventListener("mousedown", blockRightMouseDown, true);
      container.removeEventListener("mousedown", pointerDown);
      container.removeEventListener("mousemove", pointerMove, true);
      window.removeEventListener("mousemove", pointerMove, true);
      connectionOverlay.remove();
      cy.destroy();
      cyRef.current = null;
      onExporterReady?.(undefined);
    };
  }, [onExporterReady]);

  useEffect(() => {
    previewModeRef.current = previewMode;
    const cy = cyRef.current;
    if (!cy) return;
    cy.autoungrabify(previewMode);
    if (!previewMode) cy.elements().removeClass("preview-dimmed preview-focused");
  }, [previewMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !layoutAction) return;
    if (lastLayoutActionRef.current === layoutAction.nonce) return;
    lastLayoutActionRef.current = layoutAction.nonce;
    if (layoutAction.kind === "fit") {
      cy.fit(undefined, 70);
      return;
    }
    const fixedIds = new Set(project.people.filter((person) => project.layout[person.id]?.fixed).map((person) => person.id));
    const movable = cy.nodes().filter((node) => !fixedIds.has(node.id()));
    movable.layout({ name: "circle", padding: 100, animate: false }).run();
    onLayoutChange?.(Object.fromEntries(cy.nodes().map((node) => [node.id(), { ...node.position(), fixed: fixedIds.has(node.id()) }])));
  }, [layoutAction, onLayoutChange, project.layout, project.people]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const pan = cy.pan();
    const zoom = cy.zoom();
    const existingPositions = Object.fromEntries(cy.nodes().map((node) => [node.id(), (node as NodeSingular).position()]));
    cy.elements().remove();
    cy.add(toGraphElements(project, previewKind, avatarUrls, nodeColors, observationChapter));
    cy.layout({ name: "circle", padding: 90 }).run();
    project.people.forEach((person) => {
      const position = project.layout[person.id] ?? existingPositions[person.id];
      const node = cy.getElementById(person.id);
      if (position) node.position({ x: position.x, y: position.y });
      if (project.layout[person.id]?.fixed) node.lock();
      else node.unlock();
    });
    cy.zoom(zoom);
    cy.pan(pan);
  }, [avatarUrls, nodeColors, observationChapter, previewKind, project]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    if (selectedId) cy.getElementById(selectedId).select();
  }, [selectedId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("search-dimmed search-focused");
    if (!focusPersonIds.length) return;
    cy.elements().addClass("search-dimmed");
    const focused = [...focusPersonIds, ...focusRelationshipIds].reduce((collection, id) => collection.union(cy.getElementById(id)), cy.collection());
    focused.removeClass("search-dimmed").addClass("search-focused");
    if (focused.length) cy.animate({ fit: { eles: focused, padding: 120 }, duration: 250 });
  }, [focusPersonIds, focusRelationshipIds, project]);

  return <div className={`graph-canvas ${endpointPicking ? "graph-canvas--picking" : ""}`} ref={containerRef} data-testid="graph-canvas" aria-label="人物关系画布" />;
}
