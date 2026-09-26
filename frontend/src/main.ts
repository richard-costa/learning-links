import "./style.css";
import { loadGraph, saveGraph } from "./api";
import {
  RELATIONSHIP_KINDS,
  STATUSES,
  connectionCounts,
  relationshipId,
  topicById,
  type GraphData,
  type Relationship,
  type RelationshipKind,
  type TopicStatus,
  uniqueTopicId,
} from "./model";
import { sampleGraph } from "./storage";

let data: GraphData = { topics: [], relationships: [] };
let lastSaved: GraphData = { topics: [], relationships: [] };
let selectedTopicId: string | null = null;
let search = "";
let view: "atlas" | "focus" = "atlas";
let graphBox = { x: 0, y: 0, width: 1000, height: 720 };
let dragging: { x: number; y: number; moved: boolean } | null = null;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");
app.innerHTML = `
  <div class="app-shell">
    <header class="titlebar"><span class="app-icon" aria-hidden="true">◆</span><strong>Learning Links</strong><span class="titlebar-detail">/ Graph</span></header>
    <div class="app-body">
      <nav class="ribbon" aria-label="Views"><button id="atlas-icon" type="button" title="All topics" aria-label="All topics">◎</button><button id="focus-icon" type="button" title="Local graph" aria-label="Local graph">◌</button></nav>
      <aside class="sidebar" aria-label="Topic library">
        <div class="pane-heading"><strong>Topics</strong><button id="add-topic" class="icon-button" type="button" title="Add topic" aria-label="Add topic">＋</button></div>
        <label class="search-wrap"><span class="sr-only">Search topics</span><input id="search" type="search" placeholder="Search topics" autocomplete="off" /></label>
        <div id="topic-list" class="topic-list"></div>
        <div class="side-footer"><button id="load-sample" class="subtle-link" type="button">Load example map</button><span id="topic-count"></span></div>
      </aside>
      <main class="main-panel">
        <div class="tabbar"><div class="tabs"><button id="atlas-tab" type="button">All topics</button><button id="focus-tab" type="button">Local graph</button></div><div class="graph-controls"><button type="button" data-zoom="out" title="Zoom out" aria-label="Zoom out">−</button><button type="button" data-zoom="in" title="Zoom in" aria-label="Zoom in">＋</button><button type="button" data-zoom="reset" title="Reset view" aria-label="Reset view">⤢</button></div></div>
        <div id="graph-area" class="graph-area"><section id="atlas-view" class="graph-view" aria-label="All topics graph"></section><section id="focus-view" class="graph-view" aria-label="Local graph" hidden></section></div>
        <div class="graph-footer"><span id="graph-caption">Select a node to inspect it</span><span id="graph-counts"></span></div>
      </main>
      <aside id="inspector" class="inspector" aria-label="Topic details"></aside>
    </div>
    <p id="message" class="message" role="status" aria-live="polite"></p>
  </div>
  <dialog id="topic-dialog" class="dialog"><form id="topic-form">
    <div class="dialog-header"><h2 id="topic-dialog-title">Add topic</h2><button type="button" class="icon-button" data-close="topic-dialog" aria-label="Close">×</button></div>
    <input id="topic-id" type="hidden" />
    <label>Name<input id="topic-name" required maxlength="100" autocomplete="off" placeholder="e.g. Type theory" /></label>
    <label>Progress<select id="topic-status">${STATUSES.map((status) => `<option value="${status}">${status[0].toUpperCase() + status.slice(1)}</option>`).join("")}</select></label>
    <label>Reference URL <small>optional</small><input id="topic-url" type="url" placeholder="https://…" /></label>
    <div class="dialog-actions"><button type="button" data-close="topic-dialog">Cancel</button><button type="submit" class="primary">Save topic</button></div>
  </form></dialog>
  <dialog id="relationship-dialog" class="dialog"><form id="relationship-form">
    <div class="dialog-header"><h2 id="relationship-title">Add connection</h2><button type="button" class="icon-button" data-close="relationship-dialog" aria-label="Close">×</button></div>
    <input id="relationship-topic-id" type="hidden" /><input id="relationship-direction" type="hidden" />
    <p id="relationship-help" class="dialog-help"></p>
    <label>Other topic<select id="relationship-other"></select></label>
    <label>Connection<select id="relationship-kind">${RELATIONSHIP_KINDS.map((kind) => `<option value="${kind}">${kind === "prerequisite" ? "Required first" : "Helpful, but optional"}</option>`).join("")}</select></label>
    <p id="relationship-preview" class="relationship-preview"></p>
    <div class="dialog-actions"><button type="button" data-close="relationship-dialog">Cancel</button><button type="submit" class="primary">Save connection</button></div>
  </form></dialog>`;

function byId<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as unknown as T;
}
const topicList = byId<HTMLDivElement>("topic-list");
const atlasView = byId<HTMLElement>("atlas-view");
const focusView = byId<HTMLElement>("focus-view");
const graphArea = byId<HTMLElement>("graph-area");
const inspector = byId<HTMLElement>("inspector");
const message = byId<HTMLParagraphElement>("message");
const searchInput = byId<HTMLInputElement>("search");
const topicDialog = byId<HTMLDialogElement>("topic-dialog");
const topicForm = byId<HTMLFormElement>("topic-form");
const topicIdInput = byId<HTMLInputElement>("topic-id");
const topicNameInput = byId<HTMLInputElement>("topic-name");
const topicStatusInput = byId<HTMLSelectElement>("topic-status");
const topicUrlInput = byId<HTMLInputElement>("topic-url");
const relationshipDialog = byId<HTMLDialogElement>("relationship-dialog");
const relationshipForm = byId<HTMLFormElement>("relationship-form");
const relationshipTopicId = byId<HTMLInputElement>("relationship-topic-id");
const relationshipDirection = byId<HTMLInputElement>("relationship-direction");
const relationshipOther = byId<HTMLSelectElement>("relationship-other");
const relationshipKindInput = byId<HTMLSelectElement>("relationship-kind");

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function safeReferenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function setMessage(text: string): void {
  message.textContent = text;
}
function kindLabel(kind: RelationshipKind): string {
  return kind === "prerequisite" ? "Required first" : "Helpful";
}

function renderTopics(): void {
  const counts = connectionCounts(data);
  const topics = [...data.topics]
    .filter((topic) =>
      topic.name.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  byId<HTMLElement>("topic-count").textContent = `${data.topics.length} topics`;
  topicList.innerHTML = topics.length
    ? topics
        .map(
          (topic) => `
    <button class="topic-row${topic.id === selectedTopicId ? " selected" : ""}" type="button" data-topic="${escapeHtml(topic.id)}" aria-current="${topic.id === selectedTopicId ? "true" : "false"}">
      <span class="file-icon" aria-hidden="true">◇</span><span class="topic-name">${escapeHtml(topic.name)}</span><small title="Connections">${(counts.get(topic.id)?.incoming ?? 0) + (counts.get(topic.id)?.outgoing ?? 0)}</small>
    </button>`,
        )
        .join("")
    : `<p class="empty side-empty">${search ? "No matching topics." : "No topics yet. Add one above."}</p>`;
}

function relationRow(relation: Relationship, otherId: string): string {
  const other = topicById(data, otherId);
  if (!other) return "";
  return `<div class="relation-row"><button type="button" class="relation-target" data-topic="${escapeHtml(otherId)}"><span class="relation-name">${escapeHtml(other.name)}</span><small class="${escapeHtml(relation.kind)}">${kindLabel(relation.kind)}</small></button><button type="button" class="icon-button remove-link" data-remove-link="${escapeHtml(relation.id)}" aria-label="Remove connection with ${escapeHtml(other.name)}" title="Remove connection">×</button></div>`;
}
function renderInspector(): void {
  if (selectedTopicId && !topicById(data, selectedTopicId))
    selectedTopicId = data.topics[0]?.id ?? null;
  const topic = selectedTopicId ? topicById(data, selectedTopicId) : undefined;
  if (!topic) {
    inspector.innerHTML = `<div class="pane-heading"><strong>Topic</strong></div><div class="inspector-empty"><span aria-hidden="true">◇</span><p>Select a topic in the graph or add one to begin.</p><button type="button" class="primary" id="welcome-add">Add topic</button></div>`;
    return;
  }
  const incoming = data.relationships.filter(
    (relation) => relation.target === topic.id,
  );
  const outgoing = data.relationships.filter(
    (relation) => relation.source === topic.id,
  );
  const reference = safeReferenceUrl(topic.url);
  inspector.innerHTML = `<div class="pane-heading"><strong>Topic</strong><button type="button" class="icon-button" data-edit-topic="${escapeHtml(topic.id)}" aria-label="Edit ${escapeHtml(topic.name)}" title="Edit topic">✎</button></div>
    <div class="inspector-content"><div class="topic-detail"><h1>${escapeHtml(topic.name)}</h1><span class="status-label"><span class="status-dot ${escapeHtml(topic.status)}"></span>${escapeHtml(topic.status)}</span>
      ${reference ? `<a class="reference-link" href="${escapeHtml(reference)}" target="_blank" rel="noopener noreferrer">Open reference ↗</a>` : ""}
    </div>
    <section class="relation-section"><div class="section-heading"><h2>Helps you learn this</h2><button type="button" class="icon-button" data-add-link="incoming" data-topic-id="${escapeHtml(topic.id)}" title="Add connection" aria-label="Add topic that helps you learn this">＋</button></div>
      <p>Topics that lead to ${escapeHtml(topic.name)}.</p>${incoming.length ? incoming.map((relation) => relationRow(relation, relation.source)).join("") : `<p class="empty">No connections yet.</p>`}</section>
    <section class="relation-section"><div class="section-heading"><h2>This helps you learn</h2><button type="button" class="icon-button" data-add-link="outgoing" data-topic-id="${escapeHtml(topic.id)}" title="Add connection" aria-label="Add topic this helps you learn">＋</button></div>
      <p>Topics that build on ${escapeHtml(topic.name)}.</p>${outgoing.length ? outgoing.map((relation) => relationRow(relation, relation.target)).join("") : `<p class="empty">No connections yet.</p>`}</section>
    <div class="inspector-actions"><button type="button" class="subtle-link danger" data-delete-topic="${escapeHtml(topic.id)}">Delete topic</button></div></div>`;
}

type Point = { x: number; y: number };
function graphLayout(
  topics: GraphData["topics"],
  relations: Relationship[],
): Map<string, Point> {
  const sorted = [...topics].sort((a, b) => a.id.localeCompare(b.id));
  const points = new Map<string, Point>();
  sorted.forEach((topic, i) => {
    const angle = i * 2.399963;
    const radius = 55 + 40 * Math.sqrt(i);
    points.set(topic.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
  // Deterministic force pass; no animation or graph dependency.
  for (
    let step = 0;
    step < Math.min(140, 7000 / Math.max(1, sorted.length));
    step++
  ) {
    const moves = new Map(sorted.map((topic) => [topic.id, { x: 0, y: 0 }]));
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++) {
        const a = points.get(sorted[i].id)!;
        const b = points.get(sorted[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.max(12, Math.hypot(dx, dy));
        const force = Math.min(7, 3200 / (distance * distance));
        moves.get(sorted[i].id)!.x += (dx / distance) * force;
        moves.get(sorted[i].id)!.y += (dy / distance) * force;
        moves.get(sorted[j].id)!.x -= (dx / distance) * force;
        moves.get(sorted[j].id)!.y -= (dy / distance) * force;
      }
    for (const relation of relations) {
      const a = points.get(relation.source);
      const b = points.get(relation.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const pull = Math.max(-3, Math.min(3, (distance - 135) * 0.012));
      moves.get(relation.source)!.x += (dx / distance) * pull;
      moves.get(relation.source)!.y += (dy / distance) * pull;
      moves.get(relation.target)!.x -= (dx / distance) * pull;
      moves.get(relation.target)!.y -= (dy / distance) * pull;
    }
    for (const topic of sorted) {
      const point = points.get(topic.id)!;
      const move = moves.get(topic.id)!;
      point.x += move.x - point.x * 0.002;
      point.y += move.y - point.y * 0.002;
    }
  }
  const xs = [...points.values()].map((point) => point.x);
  const ys = [...points.values()].map((point) => point.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2 || 0;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2 || 0;
  const width = Math.max(...xs) - Math.min(...xs) || 1;
  const height = Math.max(...ys) - Math.min(...ys) || 1;
  const scale = Math.min(2.4, 690 / width, 470 / height);
  for (const point of points.values()) {
    point.x = 500 + (point.x - centerX) * scale;
    point.y = 360 + (point.y - centerY) * scale;
  }
  return points;
}
function renderGraph(local: boolean): void {
  const selected = selectedTopicId;
  const ids =
    local && selected
      ? new Set([
          selected,
          ...data.relationships
            .filter((r) => r.source === selected || r.target === selected)
            .flatMap((r) => [r.source, r.target]),
        ])
      : null;
  const topics = ids
    ? data.topics.filter((topic) => ids.has(topic.id))
    : data.topics;
  const relations = data.relationships.filter(
    (relation) =>
      topics.some((topic) => topic.id === relation.source) &&
      topics.some((topic) => topic.id === relation.target),
  );
  const target = local ? focusView : atlasView;
  byId<HTMLElement>("graph-caption").textContent = local
    ? "Local graph · connections to the selected topic"
    : "Select a node to inspect it · drag to pan · scroll to zoom";
  byId<HTMLElement>("graph-counts").textContent =
    `${topics.length} topics · ${relations.length} connections`;
  if (!topics.length) {
    target.innerHTML = `<div class="graph-empty"><span aria-hidden="true">◇</span><h2>Your graph is empty</h2><p>Add a topic to start mapping what you want to learn.</p><button type="button" class="primary" id="graph-add">Add topic</button><button type="button" class="subtle-link" data-load-sample>Load example map</button></div>`;
    return;
  }
  const points = graphLayout(topics, relations);
  const neighbors = new Set(
    relations
      .filter((r) => r.source === selected || r.target === selected)
      .flatMap((r) => [r.source, r.target]),
  );
  const edges = relations
    .map((relation) => {
      const a = points.get(relation.source)!;
      const b = points.get(relation.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const dim =
        selected && relation.source !== selected && relation.target !== selected
          ? " dim"
          : "";
      return `<line class="graph-edge ${relation.kind}${dim}" x1="${a.x + (dx / length) * 11}" y1="${a.y + (dy / length) * 11}" x2="${b.x - (dx / length) * 14}" y2="${b.y - (dy / length) * 14}" marker-end="url(#arrow-${relation.kind})"/>`;
    })
    .join("");
  const nodes = topics
    .map((topic) => {
      const point = points.get(topic.id)!;
      const selectedClass = topic.id === selected ? " selected" : "";
      const dim =
        selected && topic.id !== selected && !neighbors.has(topic.id)
          ? " dim"
          : "";
      return `<g class="graph-node${selectedClass}${dim}" data-node="${escapeHtml(topic.id)}" tabindex="0" role="button" aria-label="Select ${escapeHtml(topic.name)}" transform="translate(${point.x} ${point.y})"><circle class="node-hit" r="22"/><circle class="node-dot" r="${topic.id === selected ? 8 : 6}"/><text y="-15" text-anchor="middle">${escapeHtml(topic.name)}</text></g>`;
    })
    .join("");
  target.innerHTML = `<svg id="graph-svg" role="group" aria-label="${local ? "Local graph" : "All topics graph"} with ${topics.length} topics" viewBox="${graphBox.x} ${graphBox.y} ${graphBox.width} ${graphBox.height}" preserveAspectRatio="xMidYMid meet"><defs>
    <marker id="arrow-prerequisite" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0 0 L5 3 L0 6" fill="none" stroke="#bca27c" stroke-width="1"/></marker>
    <marker id="arrow-helpful" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0 0 L5 3 L0 6" fill="none" stroke="#8a8f9c" stroke-width="1"/></marker></defs>
    <g>${edges}</g><g>${nodes}</g></svg><div class="graph-legend"><span><i class="legend-line required"></i>Required first</span><span><i class="legend-line helpful"></i>Helpful</span></div>`;
}
function render(): void {
  if (selectedTopicId && !topicById(data, selectedTopicId))
    selectedTopicId = data.topics[0]?.id ?? null;
  renderTopics();
  renderInspector();
  atlasView.hidden = view !== "atlas";
  focusView.hidden = view !== "focus";
  for (const name of ["atlas", "focus"] as const) {
    byId<HTMLButtonElement>(`${name}-tab`).classList.toggle(
      "active",
      view === name,
    );
    byId<HTMLButtonElement>(`${name}-icon`).classList.toggle(
      "active",
      view === name,
    );
    byId<HTMLButtonElement>(`${name}-tab`).setAttribute(
      "aria-pressed",
      String(view === name),
    );
  }
  byId<HTMLElement>("graph-area").classList.toggle("local", view === "focus");
  if (view === "atlas") focusView.innerHTML = "";
  else atlasView.innerHTML = "";
  renderGraph(view === "focus");
}
function setView(next: "atlas" | "focus"): void {
  view = next;
  graphBox = { x: 0, y: 0, width: 1000, height: 720 };
  render();
}
function zoom(
  factor: number,
  cx = graphBox.x + graphBox.width / 2,
  cy = graphBox.y + graphBox.height / 2,
): void {
  const width = Math.max(270, Math.min(2200, graphBox.width * factor));
  const height = width * 0.72;
  graphBox = {
    x: cx - ((cx - graphBox.x) * width) / graphBox.width,
    y: cy - ((cy - graphBox.y) * height) / graphBox.height,
    width,
    height,
  };
  byId<SVGSVGElement>("graph-svg").setAttribute(
    "viewBox",
    `${graphBox.x} ${graphBox.y} ${graphBox.width} ${graphBox.height}`,
  );
}
async function persist(text: string): Promise<void> {
  try {
    await saveGraph(data);
    lastSaved = structuredClone(data);
    setMessage(text);
    render();
  } catch (error) {
    data = structuredClone(lastSaved);
    render();
    setMessage(
      `Save failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
function openNewTopic(): void {
  byId<HTMLElement>("topic-dialog-title").textContent = "Add topic";
  topicIdInput.value = "";
  topicNameInput.value = "";
  topicStatusInput.value = "planned";
  topicUrlInput.value = "";
  topicDialog.showModal();
  topicNameInput.focus();
}
function openEditTopic(id: string): void {
  const topic = topicById(data, id);
  if (!topic) return;
  byId<HTMLElement>("topic-dialog-title").textContent = "Edit topic";
  topicIdInput.value = topic.id;
  topicNameInput.value = topic.name;
  topicStatusInput.value = topic.status;
  topicUrlInput.value = topic.url;
  topicDialog.showModal();
  topicNameInput.focus();
}
function updateRelationshipPreview(): void {
  const selected = topicById(data, relationshipTopicId.value);
  const other = topicById(data, relationshipOther.value);
  if (!selected || !other) return;
  const first =
    relationshipDirection.value === "incoming" ? other.name : selected.name;
  const second =
    relationshipDirection.value === "incoming" ? selected.name : other.name;
  byId<HTMLElement>("relationship-preview").textContent =
    relationshipKindInput.value === "prerequisite"
      ? `Learn ${first} before ${second}.`
      : `${first} is helpful when learning ${second}.`;
}
function openRelationship(
  id: string,
  direction: "incoming" | "outgoing",
): void {
  const topic = topicById(data, id);
  if (!topic) return;
  const others = data.topics
    .filter((candidate) => candidate.id !== id)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!others.length) {
    setMessage("Add another topic first, then connect them.");
    return;
  }
  relationshipTopicId.value = id;
  relationshipDirection.value = direction;
  relationshipKindInput.value = "helpful";
  byId<HTMLElement>("relationship-title").textContent = "Add connection";
  byId<HTMLElement>("relationship-help").textContent =
    direction === "incoming"
      ? `Choose a topic that helps you learn ${topic.name}.`
      : `Choose a topic that ${topic.name} helps you learn.`;
  relationshipOther.innerHTML = others
    .map(
      (candidate) =>
        `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.name)}</option>`,
    )
    .join("");
  updateRelationshipPreview();
  relationshipDialog.showModal();
}

relationshipOther.addEventListener("change", updateRelationshipPreview);
relationshipKindInput.addEventListener("change", updateRelationshipPreview);
topicForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const existingId = topicIdInput.value;
  const name = topicNameInput.value.trim();
  const status = topicStatusInput.value as TopicStatus;
  const url = topicUrlInput.value.trim();
  if (!name) return;
  if (
    data.topics.some(
      (topic) =>
        topic.id !== existingId &&
        topic.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    setMessage("A topic with that name already exists.");
    return;
  }
  if (existingId) {
    const topic = topicById(data, existingId);
    if (!topic) return;
    Object.assign(topic, { name, status, url });
    selectedTopicId = topic.id;
  } else {
    const topic = { id: uniqueTopicId(data, name), name, status, url };
    data.topics.push(topic);
    selectedTopicId = topic.id;
  }
  topicDialog.close();
  await persist(existingId ? `Updated “${name}”.` : `Added “${name}”.`);
});
relationshipForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selected = relationshipTopicId.value;
  const other = relationshipOther.value;
  const source = relationshipDirection.value === "incoming" ? other : selected;
  const target = relationshipDirection.value === "incoming" ? selected : other;
  const kind = relationshipKindInput.value as RelationshipKind;
  const existing = data.relationships.find(
    (relation) => relation.source === source && relation.target === target,
  );
  if (existing) existing.kind = kind;
  else
    data.relationships.push({
      id: relationshipId(source, target),
      source,
      target,
      kind,
    });
  relationshipDialog.close();
  await persist(existing ? "Connection updated." : "Connection added.");
});
document.addEventListener("click", async (event) => {
  const element = event.target as Element;
  const node = element.closest<SVGGElement>("[data-node]");
  if (node?.dataset.node && !dragging?.moved) {
    selectedTopicId = node.dataset.node;
    render();
    return;
  }
  const button = element.closest<HTMLButtonElement>("button");
  if (!button) return;
  if (button.id === "atlas-tab" || button.id === "atlas-icon") {
    setView("atlas");
    return;
  }
  if (button.id === "focus-tab" || button.id === "focus-icon") {
    setView("focus");
    return;
  }
  if (button.dataset.zoom) {
    if (button.dataset.zoom === "reset") {
      graphBox = { x: 0, y: 0, width: 1000, height: 720 };
      renderGraph(view === "focus");
    } else if (document.querySelector("#graph-svg"))
      zoom(button.dataset.zoom === "in" ? 0.8 : 1.25);
    return;
  }
  if (
    button.id === "add-topic" ||
    button.id === "welcome-add" ||
    button.id === "graph-add"
  ) {
    openNewTopic();
    return;
  }
  if (button.dataset.close) {
    byId<HTMLDialogElement>(button.dataset.close).close();
    return;
  }
  if (button.dataset.topic) {
    selectedTopicId = button.dataset.topic;
    render();
    return;
  }
  if (button.dataset.editTopic) {
    openEditTopic(button.dataset.editTopic);
    return;
  }
  if (button.dataset.addLink && button.dataset.topicId) {
    openRelationship(
      button.dataset.topicId,
      button.dataset.addLink as "incoming" | "outgoing",
    );
    return;
  }
  if (button.dataset.removeLink) {
    const relation = data.relationships.find(
      (item) => item.id === button.dataset.removeLink,
    );
    if (!relation) return;
    const other = topicById(
      data,
      relation.source === selectedTopicId ? relation.target : relation.source,
    );
    if (!confirm(`Remove connection with “${other?.name ?? "this topic"}”?`))
      return;
    data.relationships = data.relationships.filter(
      (item) => item.id !== relation.id,
    );
    await persist("Connection removed.");
    return;
  }
  if (button.dataset.deleteTopic) {
    const topic = topicById(data, button.dataset.deleteTopic);
    if (!topic || !confirm(`Delete “${topic.name}” and its connections?`))
      return;
    data.topics = data.topics.filter((item) => item.id !== topic.id);
    data.relationships = data.relationships.filter(
      (item) => item.source !== topic.id && item.target !== topic.id,
    );
    selectedTopicId = data.topics[0]?.id ?? null;
    await persist(`Deleted “${topic.name}”.`);
    return;
  }
  if (button.id === "load-sample" || button.dataset.loadSample !== undefined) {
    if (!confirm("Replace the current map with example topics?")) return;
    data = sampleGraph();
    selectedTopicId = data.topics[0]?.id ?? null;
    await persist("Example map loaded.");
  }
});
document.addEventListener("keydown", (event) => {
  const node = (event.target as Element).closest<SVGGElement>("[data-node]");
  if (node?.dataset.node && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    selectedTopicId = node.dataset.node;
    render();
  }
});
searchInput.addEventListener("input", () => {
  search = searchInput.value;
  renderTopics();
});
graphArea.addEventListener(
  "wheel",
  (event) => {
    const svg = graphArea.querySelector<SVGSVGElement>("#graph-svg");
    if (!svg) return;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const cx =
      graphBox.x + ((event.clientX - rect.left) / rect.width) * graphBox.width;
    const cy =
      graphBox.y + ((event.clientY - rect.top) / rect.height) * graphBox.height;
    zoom(event.deltaY > 0 ? 1.12 : 0.89, cx, cy);
  },
  { passive: false },
);
graphArea.addEventListener("pointerdown", (event) => {
  const svg = graphArea.querySelector<SVGSVGElement>("#graph-svg");
  if (!svg || !(event.target as Element).closest("#graph-svg")) return;
  dragging = { x: event.clientX, y: event.clientY, moved: false };
  svg.setPointerCapture(event.pointerId);
});
graphArea.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const svg = graphArea.querySelector<SVGSVGElement>("#graph-svg");
  if (!svg) return;
  const dx = event.clientX - dragging.x;
  const dy = event.clientY - dragging.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) dragging.moved = true;
  if (dragging.moved) {
    const rect = svg.getBoundingClientRect();
    graphBox.x -= (dx / rect.width) * graphBox.width;
    graphBox.y -= (dy / rect.height) * graphBox.height;
    svg.setAttribute(
      "viewBox",
      `${graphBox.x} ${graphBox.y} ${graphBox.width} ${graphBox.height}`,
    );
  }
  dragging.x = event.clientX;
  dragging.y = event.clientY;
});
graphArea.addEventListener("pointerup", () => {
  if (dragging)
    setTimeout(() => {
      dragging = null;
    }, 0);
});
graphArea.addEventListener("pointercancel", () => {
  dragging = null;
});

async function start(): Promise<void> {
  try {
    data = await loadGraph();
    lastSaved = structuredClone(data);
    selectedTopicId = data.topics[0]?.id ?? null;
    setMessage("Connected");
  } catch (error) {
    setMessage(
      `API unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  render();
}
void start();
