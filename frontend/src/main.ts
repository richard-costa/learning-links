import "./style.css";
import { loadGraph, saveGraph } from "./api";
import { TopicGraph, type GraphSelection } from "./graph";
import {
  RELATIONSHIP_KINDS,
  STATUSES,
  relationshipId,
  supportCounts,
  topicById,
  type GraphData,
  type RelationshipKind,
  type TopicStatus,
  uniqueTopicId,
} from "./model";
import { sampleGraph } from "./storage";

type ViewMode = "all" | "isolated" | "important";

let data: GraphData = { topics: [], relationships: [] };
let selection: GraphSelection = null;
let view: ViewMode = "all";
let search = "";
let graphReady = false;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <strong>learning-links</strong>
        <span>Build and explore relationships between topics.</span>
      </div>
      <div class="top-actions">
        <button id="zoom-out" type="button" aria-label="Zoom out">−</button>
        <button id="zoom-in" type="button" aria-label="Zoom in">+</button>
        <button id="fit-graph" type="button">Fit</button>
        <button id="add-topic" type="button" class="primary">+ Topic</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="sidebar" aria-label="Topics">
        <div class="section-heading">
          <h2>Topics</h2>
          <button id="reset-sample" type="button">Load sample</button>
        </div>

        <input id="search" class="search" type="search"
          placeholder="Search topics" aria-label="Search topics" />

        <div class="view-tabs" role="group" aria-label="Topic view">
          <button type="button" data-view="all" class="active">All</button>
          <button type="button" data-view="isolated">Isolated</button>
          <button type="button" data-view="important">Important</button>
        </div>

        <div id="topic-list" class="topic-list"></div>

        <div class="stats" aria-label="Graph summary">
          <div><strong id="topic-count">0</strong><span>topics</span></div>
          <div><strong id="relationship-count">0</strong><span>links</span></div>
          <div><strong id="isolated-count">0</strong><span>isolated</span></div>
        </div>
        <p id="message" class="message" aria-live="polite"></p>
      </aside>

      <section class="graph-area" aria-label="Learning graph">
        <div class="graph-toolbar">
          <div class="legend" aria-label="Relationship legend">
            <span><i class="prerequisite"></i> prerequisite</span>
            <span><i class="helpful"></i> helpful</span>
          </div>
        </div>
        <div id="graph"></div>
      </section>

      <aside id="inspector" class="inspector" aria-label="Selection details">
        <div id="inspector-content"></div>
      </aside>
    </main>
  </div>

  <dialog id="topic-dialog" class="dialog">
    <div class="dialog-body">
      <div class="dialog-header">
        <div>
          <span class="eyebrow">Topic</span>
          <h2 id="topic-dialog-title">Add topic</h2>
        </div>
        <button type="button" class="icon-button"
          data-close-dialog="topic-dialog" aria-label="Close">×</button>
      </div>
      <form id="topic-form">
        <input id="topic-id" type="hidden" />
        <label>Name
          <input id="topic-name" required maxlength="100" autocomplete="off" />
        </label>
        <label>Status
          <select id="topic-status">
            ${STATUSES.map((status) => `<option value="${status}">${status}</option>`).join("")}
          </select>
        </label>
        <label>Reference URL
          <input id="topic-url" type="url" placeholder="https://…" />
        </label>
        <div class="dialog-actions">
          <button type="button" data-close-dialog="topic-dialog">Cancel</button>
          <button type="submit" class="primary">Save topic</button>
        </div>
      </form>
    </div>
  </dialog>

  <dialog id="relationship-dialog" class="dialog">
    <div class="dialog-body">
      <div class="dialog-header">
        <div>
          <span class="eyebrow">Relationship</span>
          <h2>Add relationship</h2>
        </div>
        <button type="button" class="icon-button"
          data-close-dialog="relationship-dialog" aria-label="Close">×</button>
      </div>
      <form id="relationship-form">
        <input id="relationship-topic-id" type="hidden" />
        <label>Direction
          <select id="relationship-direction">
            <option value="supports">This topic supports…</option>
            <option value="supported-by">This topic is supported by…</option>
          </select>
        </label>
        <label>Other topic
          <select id="relationship-other" required></select>
        </label>
        <label>Relationship
          <select id="relationship-kind">
            ${RELATIONSHIP_KINDS.map((kind) => `<option value="${kind}">${kind}</option>`).join("")}
          </select>
        </label>
        <div class="dialog-actions">
          <button type="button" data-close-dialog="relationship-dialog">Cancel</button>
          <button type="submit" class="primary">Add relationship</button>
        </div>
      </form>
    </div>
  </dialog>
`;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const topicList = byId<HTMLDivElement>("topic-list");
const inspector = byId<HTMLElement>("inspector");
const inspectorContent = byId<HTMLDivElement>("inspector-content");
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
const relationshipDirection = byId<HTMLSelectElement>("relationship-direction");
const relationshipOther = byId<HTMLSelectElement>("relationship-other");
const relationshipKindInput = byId<HTMLSelectElement>("relationship-kind");

const graph = new TopicGraph(byId<HTMLDivElement>("graph"), {
  onSelect: (nextSelection) => {
    selection = nextSelection;
    renderUi();
    graph.setSelection(selection);
    if (nextSelection) inspector.classList.add("open");
  },
});

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

function filteredTopics() {
  const counts = supportCounts(data);
  const maxImportance = Math.max(0, ...[...counts.values()].map((c) => c.outgoing));
  const query = search.trim().toLowerCase();

  return [...data.topics]
    .filter((topic) => {
      const count = counts.get(topic.id) ?? { incoming: 0, outgoing: 0 };
      if (view === "isolated" && (count.incoming > 0 || count.outgoing > 0)) return false;
      if (view === "important" && (maxImportance === 0 || count.outgoing < maxImportance)) return false;
      return !query || topic.name.toLowerCase().includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderTopicList(): void {
  const counts = supportCounts(data);
  const topics = filteredTopics();

  topicList.innerHTML = topics.length
    ? topics.map((topic) => {
        const count = counts.get(topic.id) ?? { incoming: 0, outgoing: 0 };
        const selected = selection?.type === "topic" && selection.id === topic.id ? " selected" : "";
        return `
          <button type="button" class="topic-item${selected}" data-select-topic="${escapeHtml(topic.id)}">
            <span class="name">${escapeHtml(topic.name)}</span>
            <span class="meta">${count.outgoing} →</span>
          </button>`;
      }).join("")
    : `<p class="empty-state">No topics match this view.</p>`;
}

function renderStats(): void {
  const counts = supportCounts(data);
  const isolated = [...counts.values()].filter((c) => c.incoming === 0 && c.outgoing === 0).length;
  byId<HTMLElement>("topic-count").textContent = String(data.topics.length);
  byId<HTMLElement>("relationship-count").textContent = String(data.relationships.length);
  byId<HTMLElement>("isolated-count").textContent = String(isolated);
}

function renderInspector(): void {
  if (!selection) {
    inspectorContent.innerHTML = `
      <div class="section-heading">
        <h2>Inspect</h2>
        <button type="button" class="icon-button" data-close-inspector aria-label="Close inspector">×</button>
      </div>
      <p class="empty-state">Select a topic or relationship.</p>`;
    return;
  }

  if (selection.type === "relationship") {
    const relationship = data.relationships.find((item) => item.id === selection?.id);
    if (!relationship) {
      selection = null;
      renderInspector();
      return;
    }
    const source = topicById(data, relationship.source);
    const target = topicById(data, relationship.target);
    inspectorContent.innerHTML = `
      <div class="section-heading">
        <span class="eyebrow">Relationship</span>
        <button type="button" class="icon-button" data-close-inspector aria-label="Close inspector">×</button>
      </div>
      <h2>${escapeHtml(source?.name ?? relationship.source)} → ${escapeHtml(target?.name ?? relationship.target)}</h2>
      <p><span class="status">${escapeHtml(relationship.kind)}</span></p>
      <div class="inspector-actions">
        <button type="button" class="danger" data-delete-relationship="${escapeHtml(relationship.id)}">Delete relationship</button>
      </div>`;
    return;
  }

  const topic = topicById(data, selection.id);
  if (!topic) {
    selection = null;
    renderInspector();
    return;
  }

  const incoming = data.relationships.filter((r) => r.target === topic.id);
  const outgoing = data.relationships.filter((r) => r.source === topic.id);

  const rows = (relationships: typeof incoming, incomingDirection: boolean) =>
    relationships.length
      ? `<div class="relation-list">${relationships.map((r) => {
          const otherId = incomingDirection ? r.source : r.target;
          const other = topicById(data, otherId);
          return `<button type="button" class="relation-row" data-select-topic="${escapeHtml(otherId)}">
            <span>${escapeHtml(other?.name ?? otherId)}</span><small>${escapeHtml(r.kind)}</small>
          </button>`;
        }).join("")}</div>`
      : `<p class="empty-state">None yet.</p>`;

  inspectorContent.innerHTML = `
    <div class="section-heading">
      <span class="eyebrow">Topic</span>
      <button type="button" class="icon-button" data-close-inspector aria-label="Close inspector">×</button>
    </div>
    <div class="inspector-title">
      <h2>${escapeHtml(topic.name)}</h2>
      <span class="status">${escapeHtml(topic.status)}</span>
    </div>
    ${topic.url ? `<a class="reference-link" href="${escapeHtml(topic.url)}" target="_blank" rel="noreferrer">Open reference ↗</a>` : ""}
    <div class="inspector-actions">
      <button type="button" class="primary" data-add-relationship="${escapeHtml(topic.id)}">+ Relationship</button>
      <button type="button" data-edit-topic="${escapeHtml(topic.id)}">Edit</button>
      <button type="button" class="danger" data-delete-topic="${escapeHtml(topic.id)}">Delete</button>
    </div>
    <section class="relation-section"><h3>Supported by · ${incoming.length}</h3>${rows(incoming, true)}</section>
    <section class="relation-section"><h3>Supports · ${outgoing.length}</h3>${rows(outgoing, false)}</section>`;
}

function renderUi(): void {
  renderTopicList();
  renderStats();
  renderInspector();
  graph.applyView(view, search);
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function renderData(runLayout = true): void {
  graph.setData(data, runLayout);
  graph.setSelection(selection);
  graphReady = true;
  renderUi();
}

async function persist(messageText: string): Promise<void> {
  try {
    await saveGraph(data);
    setMessage(messageText);
    renderData(true);
  } catch (error) {
    setMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function openNewTopic(): void {
  topicDialogTitle.textContent = "Add topic";
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
}

function openRelationshipDialog(topicId: string): void {
  const others = data.topics.filter((topic) => topic.id !== topicId).sort((a, b) => a.name.localeCompare(b.name));
  if (!others.length) {
    setMessage("Add another topic first.");
    return;
  }

  relationshipTopicId.value = topicId;
  relationshipDirection.value = "supports";
  relationshipKindInput.value = "helpful";
  relationshipOther.innerHTML = others.map((topic) =>
    `<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.name)}</option>`
  ).join("");
  relationshipDialog.showModal();
}

topicForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = topicIdInput.value;
  const name = topicNameInput.value.trim();
  const status = topicStatusInput.value as TopicStatus;
  const url = topicUrlInput.value.trim();
  if (!name) return;

  if (data.topics.some((topic) => topic.id !== id && topic.name.toLowerCase() === name.toLowerCase())) {
    setMessage("A topic with that name already exists.");
    return;
  }

  if (id) {
    const topic = topicById(data, id);
    if (!topic) return;
    topic.name = name;
    topic.status = status;
    topic.url = url;
    selection = { type: "topic", id };
  } else {
    const topic = { id: uniqueTopicId(data, name), name, status, url };
    data.topics.push(topic);
    selection = { type: "topic", id: topic.id };
  }

  topicDialog.close();
  await persist(id ? `Updated “${name}”.` : `Added “${name}”.`);
});

relationshipForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selectedTopic = relationshipTopicId.value;
  const otherTopic = relationshipOther.value;
  const kind = relationshipKindInput.value as RelationshipKind;
  const source = relationshipDirection.value === "supports" ? selectedTopic : otherTopic;
  const target = relationshipDirection.value === "supports" ? otherTopic : selectedTopic;
  const id = relationshipId(source, target);

  const existing = data.relationships.find((r) => r.source === source && r.target === target);
  if (existing) existing.kind = kind;
  else data.relationships.push({ id, source, target, kind });

  selection = { type: "relationship", id };
  relationshipDialog.close();
  await persist(existing ? "Relationship updated." : "Relationship added.");
});

document.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button) return;

  if (button.id === "add-topic") openNewTopic();
  if (button.id === "fit-graph") graph.fit();
  if (button.id === "zoom-in") graph.zoomIn();
  if (button.id === "zoom-out") graph.zoomOut();

  if (button.dataset.closeDialog) byId<HTMLDialogElement>(button.dataset.closeDialog).close();

  if (button.dataset.view) {
    view = button.dataset.view as ViewMode;
    renderUi();
  }

  if (button.dataset.selectTopic) {
    selection = { type: "topic", id: button.dataset.selectTopic };
    inspector.classList.add("open");
    graph.setSelection(selection);
    renderUi();
  }

  if (button.dataset.editTopic) openEditTopic(button.dataset.editTopic);
  if (button.dataset.addRelationship) openRelationshipDialog(button.dataset.addRelationship);

  if (button.dataset.deleteTopic) {
    const topic = topicById(data, button.dataset.deleteTopic);
    if (!topic || !confirm(`Delete “${topic.name}” and all its relationships?`)) return;
    data.topics = data.topics.filter((candidate) => candidate.id !== topic.id);
    data.relationships = data.relationships.filter((r) => r.source !== topic.id && r.target !== topic.id);
    selection = null;
    await persist(`Deleted “${topic.name}”.`);
  }

  if (button.dataset.deleteRelationship) {
    data.relationships = data.relationships.filter((r) => r.id !== button.dataset.deleteRelationship);
    selection = null;
    await persist("Relationship deleted.");
  }

  if (button.id === "reset-sample") {
    if (!confirm("Replace the database contents with the sample graph?")) return;
    data = sampleGraph();
    selection = null;
    await persist("Sample graph loaded.");
    requestAnimationFrame(() => graph.fit());
  }

  if (button.dataset.closeInspector !== undefined) inspector.classList.remove("open");
});

searchInput.addEventListener("input", () => {
  search = searchInput.value;
  renderUi();
});

async function start(): Promise<void> {
  try {
    data = await loadGraph();
    setMessage("Connected to FastAPI.");
  } catch (error) {
    setMessage(`API unavailable: ${error instanceof Error ? error.message : String(error)}`);
    data = { topics: [], relationships: [] };
  }

  renderData(true);
  requestAnimationFrame(() => graph.fit());
}

void start();
