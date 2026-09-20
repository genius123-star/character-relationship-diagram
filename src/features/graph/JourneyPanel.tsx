import { useState, type FormEvent } from "react";
import type { JourneyStop, PersonEvent, ProjectDocument } from "../../domain/model";
import { crossStopRelationships, sortedStops, stopEvents, stopPeople } from "../../domain/journey";
import { geocodeCandidates, type GeocodeCandidate } from "../geography/geocoding";

interface JourneyPanelProps {
  project: ProjectDocument;
  observationChapter: number;
  selectedStopId?: string;
  onChange: (next: ProjectDocument) => void;
  onSelectStop: (stopId: string | undefined) => void;
  onFocusPerson: (personId: string) => void;
}

export function JourneyPanel({ project, observationChapter, selectedStopId, onChange, onSelectStop, onFocusPerson }: JourneyPanelProps) {
  const [expandedStopId, setExpandedStopId] = useState<string>();
  const [newLabel, setNewLabel] = useState("");
  const [newChapter, setNewChapter] = useState("");
  const [newLongitude, setNewLongitude] = useState("");
  const [newLatitude, setNewLatitude] = useState("");
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>();
  const [resolveState, setResolveState] = useState<"idle" | "resolving" | "error">("idle");

  const stops = sortedStops(project);
  const allEvents = project.people.flatMap((person) => person.events.map((event) => ({ person, event })));

  const updateStop = (stopId: string, changes: Partial<JourneyStop>) => {
    const stops = project.journey?.stops ?? [];
    onChange({ ...project, journey: { stops: stops.map((stop) => stop.id === stopId ? { ...stop, ...changes } : stop) } });
  };

  const resolveNewStop = async () => {
    if (!newLabel.trim()) return;
    setResolveState("resolving");
    setCandidates(undefined);
    try {
      const results = await geocodeCandidates(newLabel.trim());
      if (results.length === 1) {
        setNewLongitude(String(results[0].longitude));
        setNewLatitude(String(results[0].latitude));
        setResolveState("idle");
      } else if (results.length > 1) {
        setCandidates(results);
        setResolveState("idle");
      } else {
        setResolveState("error");
      }
    } catch {
      setResolveState("error");
    }
  };

  const addStop = (event: FormEvent) => {
    event.preventDefault();
    const label = newLabel.trim();
    const longitude = Number(newLongitude);
    const latitude = Number(newLatitude);
    if (!label || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
    const chapterValue = Number(newChapter);
    const stop: JourneyStop = {
      id: crypto.randomUUID(),
      label,
      longitude,
      latitude,
      chapter: Number.isInteger(chapterValue) && chapterValue > 0 ? { kind: "chapter", value: chapterValue } : undefined,
      personIds: [],
      eventIds: [],
    };
    onChange({ ...project, journey: { stops: [...(project.journey?.stops ?? []), stop] } });
    setNewLabel("");
    setNewChapter("");
    setNewLongitude("");
    setNewLatitude("");
    setCandidates(undefined);
    setResolveState("idle");
  };

  const removeStop = (stopId: string) => {
    onChange({ ...project, journey: { stops: (project.journey?.stops ?? []).filter((stop) => stop.id !== stopId) } });
    if (selectedStopId === stopId) onSelectStop(undefined);
    if (expandedStopId === stopId) setExpandedStopId(undefined);
  };

  const togglePersonMember = (stop: JourneyStop, personId: string, checked: boolean) => {
    updateStop(stop.id, { personIds: checked ? [...new Set([...stop.personIds, personId])] : stop.personIds.filter((id) => id !== personId) });
  };

  const toggleEventMember = (stop: JourneyStop, eventId: string, checked: boolean) => {
    updateStop(stop.id, { eventIds: checked ? [...new Set([...stop.eventIds, eventId])] : stop.eventIds.filter((id) => id !== eventId) });
  };

  const crossRelationships = crossStopRelationships(project, stops);
  const stopIdSet = new Set<string>();
  for (const stop of stops) for (const personId of stop.personIds) stopIdSet.add(personId);

  return (
    <aside className="journey-panel" aria-label="行程">
      <div className="journey-panel__heading"><h3>行程</h3><span>{stops.length} 站</span></div>
      <form className="journey-stop-form" onSubmit={addStop}>
        <label htmlFor="journey-stop-label">站点名称</label>
        <input id="journey-stop-label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="例如：纽约" />
        <div className="journey-stop-form__row">
          <label htmlFor="journey-stop-chapter">章节</label>
          <input id="journey-stop-chapter" type="number" min="1" value={newChapter} onChange={(event) => setNewChapter(event.target.value)} />
          <button className="button button--ghost" type="button" disabled={!newLabel.trim() || resolveState === "resolving"} onClick={() => void resolveNewStop()}>{resolveState === "resolving" ? "解析中…" : "解析位置"}</button>
        </div>
        <div className="journey-stop-form__row">
          <label htmlFor="journey-stop-lon">经度</label>
          <input id="journey-stop-lon" type="number" step="any" value={newLongitude} onChange={(event) => setNewLongitude(event.target.value)} />
          <label htmlFor="journey-stop-lat">纬度</label>
          <input id="journey-stop-lat" type="number" step="any" value={newLatitude} onChange={(event) => setNewLatitude(event.target.value)} />
        </div>
        {resolveState === "error" && <p className="form-error" role="alert">未能解析该地点，可手动输入经纬度</p>}
        {candidates && <div className="journey-candidates">{candidates.map((candidate) => <button className="button button--ghost" type="button" key={`${candidate.longitude},${candidate.latitude},${candidate.displayName ?? candidate.label}`} onClick={() => { setNewLongitude(String(candidate.longitude)); setNewLatitude(String(candidate.latitude)); setCandidates(undefined); }}>{candidate.label}{candidate.displayName ? <span>{candidate.displayName}</span> : null}</button>)}</div>}
        <button className="button button--primary" type="submit" disabled={!newLabel.trim() || !Number.isFinite(Number(newLongitude)) || !Number.isFinite(Number(newLatitude))}>添加站点</button>
      </form>

      <ol className="journey-stop-list">
        {stops.map((stop) => {
          const reached = !stop.chapter || stop.chapter.value <= observationChapter;
          const people = stopPeople(project, stop);
          const events = stopEvents(project, stop);
          const stopCross = crossRelationships.filter((relationship) =>
            people.some((person) => person.id === relationship.sourcePersonId || person.id === relationship.targetPersonId),
          );
          const expanded = expandedStopId === stop.id;
          return (
            <li key={stop.id} className={`journey-stop ${!reached ? "is-future" : ""} ${selectedStopId === stop.id ? "is-selected" : ""}`}>
              <header>
                <button type="button" onClick={() => { onSelectStop(stop.id); setExpandedStopId((current) => current === stop.id ? undefined : stop.id); }}><strong>{stop.label}</strong><span>{stop.chapter ? `第 ${stop.chapter.value} 章` : "未定章节"}</span></button>
                <button className="journey-stop__remove" type="button" aria-label={`删除站点${stop.label}`} onClick={() => removeStop(stop.id)}>×</button>
              </header>
              {expanded && <div className="journey-stop__detail">
                <label htmlFor={`stop-chapter-${stop.id}`}>章节</label>
                <input id={`stop-chapter-${stop.id}`} type="number" min="1" defaultValue={stop.chapter?.value} onBlur={(event) => { const value = Number(event.target.value); updateStop(stop.id, { chapter: Number.isInteger(value) && value > 0 ? { kind: "chapter", value } : undefined }); }} />
                <h4>站内人物</h4>
                {people.length ? <ul className="journey-people">{people.map((person) => <li key={person.id}><button type="button" onClick={() => onFocusPerson(person.id)}>{person.name}</button></li>)}</ul> : <p className="journey-empty">尚未加入人物</p>}
                <h4>站内事件</h4>
                {events.length ? <ul className="journey-events">{events.map((event: PersonEvent) => <li key={event.id}>{event.title}{event.position ? `（第 ${event.position.value} 章）` : ""}</li>)}</ul> : <p className="journey-empty">尚未加入事件</p>}
                <h4>跨站关系</h4>
                {stopCross.length ? <ul className="journey-cross">{stopCross.map((relationship) => { const source = project.people.find((person) => person.id === relationship.sourcePersonId)?.name ?? "?"; const target = project.people.find((person) => person.id === relationship.targetPersonId)?.name ?? "?"; return <li key={relationship.id}>{source} · {relationship.forwardLabel} · {target}</li>; })}</ul> : <p className="journey-empty">无跨站关系</p>}
                <h4>站内人物成员</h4>
                <div className="journey-member-list">{project.people.map((person) => <label key={person.id}><input type="checkbox" checked={stop.personIds.includes(person.id)} onChange={(event) => togglePersonMember(stop, person.id, event.target.checked)} />{person.name}</label>)}</div>
                <h4>站内事件成员</h4>
                <div className="journey-member-list">{allEvents.map(({ person, event: personEvent }) => <label key={personEvent.id}><input type="checkbox" checked={stop.eventIds.includes(personEvent.id)} onChange={(changeEvent) => toggleEventMember(stop, personEvent.id, changeEvent.target.checked)} />{person.name} · {personEvent.title}</label>)}</div>
              </div>}
            </li>
          );
        })}
      </ol>
      {!stops.length && <p className="journey-empty">还没有站点，从上方添加第一站开始。</p>}
      {stopIdSet.size === 0 && stops.length > 0 && <p className="journey-empty">站点尚未加入人物，跨站关系将为空。</p>}
    </aside>
  );
}
