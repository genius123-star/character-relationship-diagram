import type { ProjectDocument } from "../../domain/model";
import { GraphCanvas } from "../graph/GraphCanvas";

export function TrashPreview({ project, onBack }: { project: ProjectDocument; onBack: () => void }) {
  return <main className="trash-preview"><header><button className="icon-button" type="button" aria-label="返回回收站" onClick={onBack}>←</button><div><h1>{project.name}</h1><span>回收站只读预览 · {project.people.length} 个人物 · {project.relationships.length} 条关系</span></div></header><section><GraphCanvas project={project} previewKind="all" relationshipKind="directed" previewMode selectedId={undefined} onSelect={() => undefined} onMove={() => undefined} onConnect={() => undefined} /></section></main>;
}
