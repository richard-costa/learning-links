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
let view: "focus" | "atlas" = "focus";
let atlasBox = { x: 0, y: 0, width: 1000, height: 720 };
let dragging: { x: number; y: number; moved: boolean } | null = null;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">✳</span>
        <div><strong>learning<span class="brand-accent">/</span>links</strong><small>YOUR KNOWLEDGE MAP</small></div>
      </div>
      <div class="top-actions">
        <span class="top-note">Make sense of what connects.</span>
        <button id="add-topic" type="button" class="primary">+ New topic</button>
      </div>
    </header>
    <div class="workspace">
      <aside class="sidebar" aria-label="Topic library">
        <div class="side-heading"><span>LIBRARY</span><span id="topic-count">00 TOPICS</span></div>
        <label class="search-wrap"><span class="sr-only">Search topics</span><input id="search" type="search" placeholder="Search topics…" autocomplete="off" /><span aria-hidden="true">⌕</span></label>
        <div id="topic-list" class="topic-list"></div>
        <div class="side-footer">
          <div class="side-key"><span class="key-dot planned"></span> Planned <span class="key-dot learning"></span> Learning <span class="key-dot learned"></span> Learned</div>
          <button id="load-sample" class="text-button" type="button">Load example map ↗</button>
          <p id="message" class="message" role="status" aria-live="polite"></p>
        </div>
      </aside>
      <main class="main-panel">
        <div class="view-header">
          <div><div class="eyebrow"><span class="live-dot"></span> LEARNING SPACE <span class="divider">/</span> <span id="view-name">FOCUS</span></div>
            <h1 id="page-title">Your learning map</h1><p id="page-description">Follow an idea from what helps you learn it to what it helps you learn next.</p></div>
          <div class="view-switch" aria-label="View"><button id="focus-tab" type="button" aria-pressed="true">◈ &nbsp; Focus</button><button id="atlas-tab" type="button" aria-pressed="false">⠿ &nbsp; Map</button></div>
        </div>
        <section id="focus-view" class="focus-view" aria-label="Focused topic"></section>
        <section id="atlas-view" class="atlas-view" aria-label="Full learning map" hidden></section>
      </main>
    </div>
  </div>
  <dialog id="topic-dialog" class="dialog">
    <form id="topic-form">
      <div class="dialog-header"><div><span class="eyebrow">YOUR LIBRARY</span><h2 id="topic-dialog-title">New topic</h2></div><button type="button" class="quiet close" data-close="topic-dialog" aria-label="Close">×</button></div>
      <input id="topic-id" type="hidden" />
      <label>Name<input id="topic-name" required maxlength="100" autocomplete="off" placeholder="e.g. Type theory" /></label>
      <label>Progress<select id="topic-status">${STATUSES.map((status) => `<option value="${status}">${status[0].toUpperCase() + status.slice(1)}</option>`).join("")}</select></label>
      <label>Reference link <span class="optional">optional</span><input id="topic-url" type="url" placeholder="https://…" /></label>
      <div class="dialog-actions"><button type="button" data-close="topic-dialog">Cancel</button><button type="submit" class="primary">Save topic</button></div>
    </form>
  </dialog>
  <dialog id="relationship-dialog" class="dialog">
    <form id="relationship-form">
      <div class="dialog-header"><div><span class="eyebrow">CONNECT IDEAS</span><h2 id="relationship-title">Add connection</h2></div><button type="button" class="quiet close" data-close="relationship-dialog" aria-label="Close">×</button></div>
      <input id="relationship-topic-id" type="hidden" /><input id="relationship-direction" type="hidden" />
      <p id="relationship-help" class="dialog-help"></p>
      <label>Other topic<select id="relationship-other"></select></label>
      <label>How does it help?<select id="relationship-kind">${RELATIONSHIP_KINDS.map((kind) => `<option value="${kind}">${kind === "prerequisite" ? "Required first" : "Helpful, but optional"}</option>`).join("")}</select></label>
      <p id="relationship-preview" class="relationship-preview"></p>
      <div class="dialog-actions"><button type="button" data-close="relationship-dialog">Cancel</button><button type="submit" class="primary">Save connection</button></div>
    </form>
  </dialog>`;

function byId<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as unknown as T;
}
const topicList = byId<HTMLDivElement>("topic-list");
const focusView = byId<HTMLElement>("focus-view");
const atlasView = byId<HTMLElement>("atlas-view");
const searchInput = byId<HTMLInputElement>("search");
const message = byId<HTMLParagraphElement>("message");
const topicDialog = byId<HTMLDialogElement>("topic-dialog");
const topicForm = byId<HTMLFormElement>("topic-form");
const topicIdInput = byId<HTMLInputElement>("topic-id");
const topicNameInput = byId<HTMLInputElement>("topic-name");
const topicStatusInput = byId<HTMLSelectElement>("topic-status");
const topicUrlInput = byId<HTMLInputElement>("topic-url");
const topicDialogTitle = byId<HTMLHeadingElement>("topic-dialog-title");
const relationshipDialog = byId<HTMLDialogElement>("relationship-dialog");
const relationshipForm = byId<HTMLFormElement>("relationship-form");
const relationshipTopicId = byId<HTMLInputElement>("relationship-topic-id");
const relationshipDirection = byId<HTMLInputElement>("relationship-direction");
const relationshipOther = byId<HTMLSelectElement>("relationship-other");
const relationshipKindInput = byId<HTMLSelectElement>("relationship-kind");
const relationshipTitle = byId<HTMLHeadingElement>("relationship-title");

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function setMessage(text: string): void {
  message.textContent = text;
}
function displayKind(kind: RelationshipKind): string {
  return kind === "prerequisite" ? "Required first" : "Helpful context";
}
function safeReferenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function renderTopics(): void {
  byId<HTMLElement>("topic-count").textContent =
    `${String(data.topics.length).padStart(2, "0")} TOPICS`;
  const counts = connectionCounts(data);
  const topics = [...data.topics]
    .filter((topic) =>
      topic.name.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  topicList.innerHTML = topics.length
    ? topics
        .map(
          (topic) => `
    <button class="topic-row${topic.id === selectedTopicId ? " selected" : ""}" type="button" data-topic="${escapeHtml(topic.id)}" aria-current="${topic.id === selectedTopicId ? "true" : "false"}">
      <span class="status-dot ${escapeHtml(topic.status)}"></span><span class="topic-row-name">${escapeHtml(topic.name)}</span><small>${(counts.get(topic.id)?.incoming ?? 0) + (counts.get(topic.id)?.outgoing ?? 0)}</small>
    </button>`,
        )
        .join("")
    : `<p class="empty side-empty">${search ? "No matching topics." : "Your library is empty."}</p>`;
}

function relationCard(relationship: Relationship, id: string): string {
  const topic = topicById(data, id);
  if (!topic) return "";
  return `<div class="relation-card ${escapeHtml(relationship.kind)}" data-relation="${escapeHtml(relationship.id)}">
    <button class="relation-main" type="button" data-topic="${escapeHtml(id)}"><span class="relation-icon" aria-hidden="true">✳</span><span class="relation-copy"><strong>${escapeHtml(topic.name)}</strong><small>${displayKind(relationship.kind)}</small></span><span class="relation-arrow" aria-hidden="true">↗</span></button>
    <button class="remove-link quiet" type="button" data-remove-link="${escapeHtml(relationship.id)}" aria-label="Remove connection with ${escapeHtml(topic.name)}" title="Remove connection">×</button>
  </div>`;
}

function renderFocus(): void {
  if ((!selectedTopicId || !topicById(data, selectedTopicId)) && data.topics.length)
    selectedTopicId = data.topics[0].id;
  const topic = selectedTopicId ? topicById(data, selectedTopicId) : undefined;
  byId<HTMLElement>("view-name").textContent = "FOCUS";
  byId<HTMLElement>("page-title").textContent =
    topic?.name ?? "Your learning map";
  byId<HTMLElement>("page-description").textContent = topic
    ? "See what helps you learn it, and where it can take you."
    : "Collect topics, then connect the ideas that help you learn each one.";
  if (!topic) {
    focusView.innerHTML = `<div class="welcome"><div class="welcome-symbol">✳</div><span class="eyebrow">A BLANK CANVAS</span><h2>Start with one idea.</h2><p>Add a topic you want to learn. You can connect it to other topics as your map grows.</p><button type="button" class="primary" id="welcome-add">+ Add your first topic</button></div>`;
    return;
  }
  const incoming = data.relationships.filter(
    (relation) => relation.target === topic.id,
  );
  const outgoing = data.relationships.filter(
    (relation) => relation.source === topic.id,
  );
  const referenceUrl = safeReferenceUrl(topic.url);
  focusView.innerHTML = `<div class="focus-intro"><span>EXPLORE A TOPIC</span><span>${String(incoming.length + outgoing.length).padStart(2, "0")} CONNECTIONS</span></div>
    <div class="focus-map">
      <svg class="focus-edges" aria-hidden="true"></svg>
      <section class="relation-column incoming"><div class="column-heading"><span class="section-index">01 / LEARN WITH</span><h2>Helps you learn this</h2><p>Ideas that make this topic easier to learn.</p></div>
        <div class="relation-stack">${incoming.length ? incoming.map((relation) => relationCard(relation, relation.source)).join("") : `<p class="empty">No topics connected here yet.</p>`}</div>
        <button type="button" class="add-connection" data-add-link="incoming" data-topic-id="${escapeHtml(topic.id)}">+ &nbsp; Connect a topic</button>
      </section>
      <article class="focus-card"><div class="focus-card-top"><span class="eyebrow">CURRENT TOPIC</span><span class="focus-glyph" aria-hidden="true">✳</span></div>
        <span class="status-pill ${escapeHtml(topic.status)}"><span class="status-dot ${escapeHtml(topic.status)}"></span>${escapeHtml(topic.status)}</span>
        <h2>${escapeHtml(topic.name)}</h2><p class="focus-summary">${incoming.length} ${incoming.length === 1 ? "topic helps" : "topics help"} you learn this <span>·</span> This helps with ${outgoing.length} ${outgoing.length === 1 ? "topic" : "topics"}</p>
        <div class="focus-actions">${referenceUrl ? `<a class="button-link" href="${escapeHtml(referenceUrl)}" target="_blank" rel="noopener noreferrer">Open reference ↗</a>` : ""}
          <button type="button" data-edit-topic="${escapeHtml(topic.id)}">Edit topic</button><button type="button" class="danger" data-delete-topic="${escapeHtml(topic.id)}" aria-label="Delete ${escapeHtml(topic.name)}">Delete</button></div>
      </article>
      <section class="relation-column outgoing"><div class="column-heading"><span class="section-index">02 / FROM HERE</span><h2>This helps you learn</h2><p>Ideas that build on this topic.</p></div>
        <div class="relation-stack">${outgoing.length ? outgoing.map((relation) => relationCard(relation, relation.target)).join("") : `<p class="empty">No topics connected here yet.</p>`}</div>
        <button type="button" class="add-connection" data-add-link="outgoing" data-topic-id="${escapeHtml(topic.id)}">+ &nbsp; Connect a topic</button>
      </section>
    </div><div class="map-footnote"><span class="legend-line required"></span> Required first <span class="legend-line helpful"></span> Helpful context <span class="footnote-spacer"></span> Select any topic to follow the trail</div>`;
  requestAnimationFrame(drawFocusEdges);
}

function drawFocusEdges(): void {
  const map = focusView.querySelector<HTMLElement>(".focus-map");
  const svg = focusView.querySelector<SVGSVGElement>(".focus-edges");
  const center = focusView.querySelector<HTMLElement>(".focus-card");
  if (!map || !svg || !center || matchMedia("(max-width: 960px)").matches)
    return;
  const origin = map.getBoundingClientRect();
  const hub = center.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${origin.width} ${origin.height}`);
  const paths: string[] = [];
  for (const side of ["incoming", "outgoing"] as const) {
    map
      .querySelectorAll<HTMLElement>(`.${side} .relation-card`)
      .forEach((card) => {
        const rect = card.getBoundingClientRect();
        const fromX =
          (side === "incoming" ? rect.right : hub.right) - origin.left;
        const toX = (side === "incoming" ? hub.left : rect.left) - origin.left;
        const fromY =
          (side === "incoming" ? rect : hub).top -
          origin.top +
          (side === "incoming" ? rect.height : hub.height) / 2;
        const toY =
          (side === "incoming" ? hub : rect).top -
          origin.top +
          (side === "incoming" ? hub.height : rect.height) / 2;
        const bend = Math.max(28, (toX - fromX) * 0.55);
        const kind = card.classList.contains("prerequisite")
          ? "required"
          : "helpful";
        paths.push(
          `<path class="edge ${kind}" d="M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}"/><circle class="edge-point ${kind}" cx="${toX}" cy="${toY}" r="3"/>`,
        );
      });
  }
  svg.innerHTML = paths.join("");
}

type Point = { x: number; y: number };
function graphLayout(): Map<string, Point> {
  const topics = [...data.topics].sort((a, b) => a.id.localeCompare(b.id));
  const points = new Map<string, Point>();
  topics.forEach((topic, i) => {
    const angle = i * 2.399963;
    const radius = 40 + 27 * Math.sqrt(i);
    points.set(topic.id, {
      x: 500 + Math.cos(angle) * radius,
      y: 360 + Math.sin(angle) * radius,
    });
  });
  // A small deterministic force pass keeps connected ideas close without a graph library.
  for (
    let step = 0;
    step < Math.min(120, 6000 / Math.max(1, topics.length));
    step++
  ) {
    const moves = new Map(topics.map((topic) => [topic.id, { x: 0, y: 0 }]));
    for (let i = 0; i < topics.length; i++)
      for (let j = i + 1; j < topics.length; j++) {
        const a = points.get(topics[i].id)!;
        const b = points.get(topics[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.max(10, Math.hypot(dx, dy));
        const force = Math.min(8, 2500 / (distance * distance));
        moves.get(topics[i].id)!.x += (dx / distance) * force;
        moves.get(topics[i].id)!.y += (dy / distance) * force;
        moves.get(topics[j].id)!.x -= (dx / distance) * force;
        moves.get(topics[j].id)!.y -= (dy / distance) * force;
      }
    for (const relation of data.relationships) {
      const a = points.get(relation.source);
      const b = points.get(relation.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const pull = Math.max(
        -3,
        Math.min(3, (Math.hypot(dx, dy) - 125) * 0.009),
      );
      moves.get(relation.source)!.x +=
        (dx * pull) / Math.max(1, Math.hypot(dx, dy));
      moves.get(relation.source)!.y +=
        (dy * pull) / Math.max(1, Math.hypot(dx, dy));
      moves.get(relation.target)!.x -=
        (dx * pull) / Math.max(1, Math.hypot(dx, dy));
      moves.get(relation.target)!.y -=
        (dy * pull) / Math.max(1, Math.hypot(dx, dy));
    }
    for (const topic of topics) {
      const p = points.get(topic.id)!;
      const move = moves.get(topic.id)!;
      p.x = Math.max(65, Math.min(935, p.x + move.x + (500 - p.x) * 0.002));
      p.y = Math.max(65, Math.min(655, p.y + move.y + (360 - p.y) * 0.002));
    }
  }
  return points;
}

function renderAtlas(): void {
  byId<HTMLElement>("view-name").textContent = "MAP";
  byId<HTMLElement>("page-title").textContent = "The whole picture";
  byId<HTMLElement>("page-description").textContent =
    "Follow the arrows from an idea to what it helps you learn. Select a node to explore it.";
  if (!data.topics.length) {
    atlasView.innerHTML = `<div class="welcome"><div class="welcome-symbol">✳</div><h2>No map yet.</h2><p>Add a topic to get started.</p><button type="button" class="primary" id="welcome-add">+ Add your first topic</button></div>`;
    return;
  }
  const points = graphLayout();
  const edges = data.relationships
    .map((relation) => {
      const a = points.get(relation.source);
      const b = points.get(relation.target);
      if (!a || !b) return "";
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      return `<line class="atlas-edge ${relation.kind}" x1="${a.x + (dx / length) * 17}" y1="${a.y + (dy / length) * 17}" x2="${b.x - (dx / length) * 19}" y2="${b.y - (dy / length) * 19}" marker-end="url(#arrow-${relation.kind})"/>`;
    })
    .join("");
  const nodes = [...data.topics]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((topic) => {
      const point = points.get(topic.id)!;
      return `<g class="atlas-node ${escapeHtml(topic.status)}${topic.id === selectedTopicId ? " active" : ""}" data-node="${escapeHtml(topic.id)}" tabindex="0" role="button" aria-label="Explore ${escapeHtml(topic.name)}" transform="translate(${point.x} ${point.y})"><circle class="node-halo" r="24"/><circle class="node-ring" r="16"/><circle class="node-core" r="7"/><text y="-27" text-anchor="middle">${escapeHtml(topic.name)}</text></g>`;
    })
    .join("");
  atlasView.innerHTML = `<div class="atlas-toolbar"><div class="atlas-legend"><span class="legend-line required"></span> Required first <span class="legend-line helpful"></span> Helpful context</div><div class="zoom-controls"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset" aria-label="Reset view">⤢</button></div></div>
    <div class="atlas-frame"><svg id="graph-svg" role="group" aria-label="Learning map with ${data.topics.length} topics and ${data.relationships.length} connections" viewBox="${atlasBox.x} ${atlasBox.y} ${atlasBox.width} ${atlasBox.height}" preserveAspectRatio="xMidYMid meet">
      <defs><marker id="arrow-prerequisite" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#efb877" stroke-width="1.2"/></marker><marker id="arrow-helpful" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#78cfbc" stroke-width="1.2"/></marker></defs>
      <g class="atlas-edges">${edges}</g><g class="atlas-nodes">${nodes}</g></svg></div>
    <div class="atlas-caption"><span>SCROLL TO ZOOM <span class="divider">·</span> DRAG TO PAN</span><span>${String(data.topics.length).padStart(2, "0")} NODES <span class="divider">/</span> ${String(data.relationships.length).padStart(2, "0")} LINKS</span></div>`;
}

function render(): void {
  renderTopics();
  focusView.hidden = view !== "focus";
  atlasView.hidden = view !== "atlas";
  byId<HTMLButtonElement>("focus-tab").setAttribute(
    "aria-pressed",
    String(view === "focus"),
  );
  byId<HTMLButtonElement>("atlas-tab").setAttribute(
    "aria-pressed",
    String(view === "atlas"),
  );
  if (view === "focus") renderFocus();
  else renderAtlas();
}
function setView(next: "focus" | "atlas"): void {
  view = next;
  render();
}
function zoom(
  factor: number,
  cx = atlasBox.x + atlasBox.width / 2,
  cy = atlasBox.y + atlasBox.height / 2,
): void {
  const width = Math.max(280, Math.min(2000, atlasBox.width * factor));
  const height = width * 0.72;
  atlasBox = {
    x: cx - ((cx - atlasBox.x) * width) / atlasBox.width,
    y: cy - ((cy - atlasBox.y) * height) / atlasBox.height,
    width,
    height,
  };
  byId<SVGSVGElement>("graph-svg").setAttribute(
    "viewBox",
    `${atlasBox.x} ${atlasBox.y} ${atlasBox.width} ${atlasBox.height}`,
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
  topicDialogTitle.textContent = "New topic";
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
  topicDialogTitle.textContent = "Edit topic";
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
  relationshipTitle.textContent =
    direction === "incoming"
      ? `What helps with ${topic.name}?`
      : `What builds on ${topic.name}?`;
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
    setView("focus");
    return;
  }
  const button = element.closest<HTMLButtonElement>("button");
  if (!button) return;
  if (button.id === "focus-tab") {
    setView("focus");
    return;
  }
  if (button.id === "atlas-tab") {
    setView("atlas");
    return;
  }
  if (button.dataset.zoom) {
    if (button.dataset.zoom === "reset") {
      atlasBox = { x: 0, y: 0, width: 1000, height: 720 };
      renderAtlas();
    } else zoom(button.dataset.zoom === "in" ? 0.8 : 1.25);
    return;
  }
  if (button.id === "add-topic" || button.id === "welcome-add") {
    openNewTopic();
    return;
  }
  if (button.dataset.close) {
    byId<HTMLDialogElement>(button.dataset.close).close();
    return;
  }
  if (button.dataset.topic) {
    selectedTopicId = button.dataset.topic;
    setView("focus");
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
  if (button.id === "load-sample") {
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
    setView("focus");
  }
});
searchInput.addEventListener("input", () => {
  search = searchInput.value;
  renderTopics();
});
window.addEventListener("resize", () => {
  if (view === "focus") drawFocusEdges();
});
atlasView.addEventListener(
  "wheel",
  (event) => {
    const svg = atlasView.querySelector<SVGSVGElement>("#graph-svg");
    if (!svg) return;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const cx =
      atlasBox.x + ((event.clientX - rect.left) / rect.width) * atlasBox.width;
    const cy =
      atlasBox.y + ((event.clientY - rect.top) / rect.height) * atlasBox.height;
    zoom(event.deltaY > 0 ? 1.12 : 0.89, cx, cy);
  },
  { passive: false },
);
atlasView.addEventListener("pointerdown", (event) => {
  const svg = atlasView.querySelector<SVGSVGElement>("#graph-svg");
  if (!svg || !(event.target as Element).closest("#graph-svg")) return;
  dragging = { x: event.clientX, y: event.clientY, moved: false };
  svg.setPointerCapture(event.pointerId);
});
atlasView.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const svg = atlasView.querySelector<SVGSVGElement>("#graph-svg");
  if (!svg) return;
  const dx = event.clientX - dragging.x;
  const dy = event.clientY - dragging.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) dragging.moved = true;
  if (dragging.moved) {
    const rect = svg.getBoundingClientRect();
    atlasBox.x -= (dx / rect.width) * atlasBox.width;
    atlasBox.y -= (dy / rect.height) * atlasBox.height;
    svg.setAttribute(
      "viewBox",
      `${atlasBox.x} ${atlasBox.y} ${atlasBox.width} ${atlasBox.height}`,
    );
  }
  dragging.x = event.clientX;
  dragging.y = event.clientY;
});
atlasView.addEventListener("pointerup", () => {
  if (dragging)
    setTimeout(() => {
      dragging = null;
    }, 0);
});
atlasView.addEventListener("pointercancel", () => {
  dragging = null;
});

async function start(): Promise<void> {
  try {
    data = await loadGraph();
    lastSaved = structuredClone(data);
    selectedTopicId = data.topics[0]?.id ?? null;
    setMessage("Map connected.");
  } catch (error) {
    setMessage(
      `API unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  render();
}
void start();
