import "./style.css";
import { loadGraph, saveGraph } from "./api";
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

let data: GraphData = { topics: [], relationships: [] };
let selectedTopicId: string | null = null;
let search = "";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div>
        <strong>learning-links</strong>
        <span>Focus on one topic. Follow what supports it and what it supports.</span>
      </div>
      <div class="top-actions">
        <button id="load-sample" type="button">Load sample</button>
        <button id="add-topic" type="button" class="primary">+ Topic</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="sidebar">
        <input id="search" class="search" type="search" placeholder="Search topics" />
        <div id="topic-list" class="topic-list"></div>
        <p id="message" class="message" aria-live="polite"></p>
      </aside>

      <section id="focus-view" class="focus-view"></section>
    </main>
  </div>

  <dialog id="topic-dialog" class="dialog">
    <form id="topic-form">
      <input id="topic-id" type="hidden" />
      <div class="dialog-header">
        <h2 id="topic-dialog-title">Add topic</h2>
        <button type="button" class="quiet" data-close="topic-dialog">×</button>
      </div>
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
        <button type="button" data-close="topic-dialog">Cancel</button>
        <button type="submit" class="primary">Save</button>
      </div>
    </form>
  </dialog>

  <dialog id="relationship-dialog" class="dialog">
    <form id="relationship-form">
      <input id="relationship-topic-id" type="hidden" />
      <input id="relationship-direction" type="hidden" />
      <div class="dialog-header">
        <h2 id="relationship-title">Add relationship</h2>
        <button type="button" class="quiet" data-close="relationship-dialog">×</button>
      </div>
      <label>Topic
        <select id="relationship-other"></select>
      </label>
      <label>Relationship
        <select id="relationship-kind">
          ${RELATIONSHIP_KINDS.map((kind) => `<option value="${kind}">${kind}</option>`).join("")}
        </select>
      </label>
      <div class="dialog-actions">
        <button type="button" data-close="relationship-dialog">Cancel</button>
        <button type="submit" class="primary">Add</button>
      </div>
    </form>
  </dialog>
`;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const topicList = byId<HTMLDivElement>("topic-list");
const focusView = byId<HTMLElement>("focus-view");
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

function renderTopics(): void {
  const counts = supportCounts(data);
  const query = search.trim().toLowerCase();
  const topics = [...data.topics]
    .filter((topic) => !query || topic.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  topicList.innerHTML = topics.length
    ? topics.map((topic) => {
        const count = counts.get(topic.id) ?? { incoming: 0, outgoing: 0 };
        const selected = topic.id === selectedTopicId ? " selected" : "";
        return `
          <button class="topic-row${selected}" type="button" data-topic="${escapeHtml(topic.id)}">
            <span>${escapeHtml(topic.name)}</span>
            <small>${count.outgoing} supports</small>
          </button>`;
      }).join("")
    : `<p class="empty">No matching topics.</p>`;
}

function relationCard(topicId: string, kind: RelationshipKind, relationshipIdValue: string): string {
  const topic = topicById(data, topicId);
  if (!topic) return "";
  return `
    <div class="relation-card">
      <button class="relation-main" type="button" data-topic="${escapeHtml(topic.id)}">
        <strong>${escapeHtml(topic.name)}</strong>
        <span class="kind ${escapeHtml(kind)}">${escapeHtml(kind)}</span>
      </button>
      <button class="remove-link quiet" type="button"
        data-remove-link="${escapeHtml(relationshipIdValue)}"
        aria-label="Remove relationship">×</button>
    </div>`;
}

function renderFocus(): void {
  if (!selectedTopicId && data.topics.length) selectedTopicId = data.topics[0].id;
  const topic = selectedTopicId ? topicById(data, selectedTopicId) : undefined;

  if (!topic) {
    focusView.innerHTML = `
      <div class="welcome">
        <h1>No topics yet</h1>
        <p>Add a topic to start building your learning map.</p>
        <button type="button" class="primary" id="welcome-add">+ Add topic</button>
      </div>`;
    return;
  }

  const incoming = data.relationships.filter((relationship) => relationship.target === topic.id);
  const outgoing = data.relationships.filter((relationship) => relationship.source === topic.id);

  focusView.innerHTML = `
    <div class="focus-map">
      <section class="relation-column supported-by">
        <div class="column-heading">
          <div><span>Supported by</span><small>${incoming.length}</small></div>
          <button type="button" class="quiet add-link"
            data-add-link="supported-by" data-topic-id="${escapeHtml(topic.id)}">+</button>
        </div>
        <div class="relation-stack">
          ${incoming.length
            ? incoming.map((relationship) => relationCard(relationship.source, relationship.kind, relationship.id)).join("")
            : `<p class="empty">Nothing yet.</p>`}
        </div>
      </section>

      <article class="focus-card">
        <span class="status">${escapeHtml(topic.status)}</span>
        <h1>${escapeHtml(topic.name)}</h1>
        <p class="summary">${incoming.length} supporting · ${outgoing.length} supported</p>
        <div class="focus-actions">
          ${topic.url
            ? `<a class="button-link" href="${escapeHtml(topic.url)}" target="_blank" rel="noreferrer">Reference ↗</a>`
            : ""}
          <button type="button" data-edit-topic="${escapeHtml(topic.id)}">Edit</button>
          <button type="button" class="danger" data-delete-topic="${escapeHtml(topic.id)}">Delete</button>
        </div>
      </article>

      <section class="relation-column supports">
        <div class="column-heading">
          <div><span>Supports</span><small>${outgoing.length}</small></div>
          <button type="button" class="quiet add-link"
            data-add-link="supports" data-topic-id="${escapeHtml(topic.id)}">+</button>
        </div>
        <div class="relation-stack">
          ${outgoing.length
            ? outgoing.map((relationship) => relationCard(relationship.target, relationship.kind, relationship.id)).join("")
            : `<p class="empty">Nothing yet.</p>`}
        </div>
      </section>
    </div>`;
}

function render(): void {
  renderTopics();
  renderFocus();
}

async function persist(text: string): Promise<void> {
  try {
    await saveGraph(data);
    setMessage(text);
    render();
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

function openRelationship(id: string, direction: "supports" | "supported-by"): void {
  const topic = topicById(data, id);
  if (!topic) return;
  const others = data.topics.filter((candidate) => candidate.id !== id).sort((a, b) => a.name.localeCompare(b.name));
  if (!others.length) {
    setMessage("Add another topic first.");
    return;
  }

  relationshipTopicId.value = id;
  relationshipDirection.value = direction;
  relationshipKindInput.value = "helpful";
  relationshipTitle.textContent = direction === "supports"
    ? `What does ${topic.name} support?`
    : `What supports ${topic.name}?`;
  relationshipOther.innerHTML = others.map((candidate) =>
    `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.name)}</option>`
  ).join("");
  relationshipDialog.showModal();
}

topicForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const existingId = topicIdInput.value;
  const name = topicNameInput.value.trim();
  const status = topicStatusInput.value as TopicStatus;
  const url = topicUrlInput.value.trim();
  if (!name) return;

  const duplicate = data.topics.some(
    (topic) => topic.id !== existingId && topic.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    setMessage("A topic with that name already exists.");
    return;
  }

  if (existingId) {
    const topic = topicById(data, existingId);
    if (!topic) return;
    topic.name = name;
    topic.status = status;
    topic.url = url;
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
  const direction = relationshipDirection.value;
  const kind = relationshipKindInput.value as RelationshipKind;
  const source = direction === "supports" ? selected : other;
  const target = direction === "supports" ? other : selected;
  const id = relationshipId(source, target);

  const existing = data.relationships.find(
    (relationship) => relationship.source === source && relationship.target === target,
  );
  if (existing) existing.kind = kind;
  else data.relationships.push({ id, source, target, kind });

  relationshipDialog.close();
  await persist(existing ? "Relationship updated." : "Relationship added.");
});

document.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button) return;

  if (button.id === "add-topic" || button.id === "welcome-add") openNewTopic();
  if (button.dataset.close) byId<HTMLDialogElement>(button.dataset.close).close();
  if (button.dataset.topic) {
    selectedTopicId = button.dataset.topic;
    render();
  }
  if (button.dataset.editTopic) openEditTopic(button.dataset.editTopic);
  if (button.dataset.addLink && button.dataset.topicId) {
    openRelationship(button.dataset.topicId, button.dataset.addLink as "supports" | "supported-by");
  }
  if (button.dataset.removeLink) {
    data.relationships = data.relationships.filter(
      (relationship) => relationship.id !== button.dataset.removeLink,
    );
    await persist("Relationship removed.");
  }
  if (button.dataset.deleteTopic) {
    const topic = topicById(data, button.dataset.deleteTopic);
    if (!topic || !confirm(`Delete “${topic.name}” and its relationships?`)) return;
    data.topics = data.topics.filter((candidate) => candidate.id !== topic.id);
    data.relationships = data.relationships.filter(
      (relationship) => relationship.source !== topic.id && relationship.target !== topic.id,
    );
    selectedTopicId = data.topics[0]?.id ?? null;
    await persist(`Deleted “${topic.name}”.`);
  }
  if (button.id === "load-sample") {
    if (!confirm("Replace the current graph with the sample data?")) return;
    data = sampleGraph();
    selectedTopicId = data.topics[0]?.id ?? null;
    await persist("Sample loaded.");
  }
});

searchInput.addEventListener("input", () => {
  search = searchInput.value;
  renderTopics();
});

async function start(): Promise<void> {
  try {
    data = await loadGraph();
    selectedTopicId = data.topics[0]?.id ?? null;
    setMessage("Connected.");
  } catch (error) {
    setMessage(`API unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  render();
}

void start();
