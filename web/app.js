const STORAGE_KEY = "learning-links-demo-v1";

const els = {
  topicForm: document.querySelector("#topic-form"),
  topicName: document.querySelector("#topic-name"),
  topicStatus: document.querySelector("#topic-status"),
  topicUrl: document.querySelector("#topic-url"),
  relationshipForm: document.querySelector("#relationship-form"),
  supportingTopic: document.querySelector("#supporting-topic"),
  dependentTopic: document.querySelector("#dependent-topic"),
  relationshipKind: document.querySelector("#relationship-kind"),
  topicCount: document.querySelector("#topic-count"),
  relationshipCount: document.querySelector("#relationship-count"),
  isolatedCount: document.querySelector("#isolated-count"),
  message: document.querySelector("#message"),
  fitGraph: document.querySelector("#fit-graph"),
  resetDemo: document.querySelector("#reset-demo"),
  clearAll: document.querySelector("#clear-all"),
  filters: [...document.querySelectorAll(".filter")],
  emptySelection: document.querySelector("#empty-selection"),
  topicInspector: document.querySelector("#topic-inspector"),
  edgeInspector: document.querySelector("#edge-inspector"),
  selectedTopicName: document.querySelector("#selected-topic-name"),
  selectedTopicStatus: document.querySelector("#selected-topic-status"),
  selectedTopicUrl: document.querySelector("#selected-topic-url"),
  selectedIncomingCount: document.querySelector("#selected-incoming-count"),
  selectedOutgoingCount: document.querySelector("#selected-outgoing-count"),
  selectedIncoming: document.querySelector("#selected-incoming"),
  selectedOutgoing: document.querySelector("#selected-outgoing"),
  deleteTopic: document.querySelector("#delete-topic"),
  selectedEdgeTitle: document.querySelector("#selected-edge-title"),
  selectedEdgeKind: document.querySelector("#selected-edge-kind"),
  deleteEdge: document.querySelector("#delete-edge")
};

let state = { topics: [], relationships: [] };
let selected = null;
let activeFilter = "all";
let cy;

function slugify(value) {
  const base = value.trim().toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const seed = base || "topic";
  let candidate = seed;
  let suffix = 2;
  while (state.topics.some((t) => t.id === candidate)) {
    candidate = seed + "-" + suffix;
    suffix += 1;
  }
  return candidate;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.topics) || !Array.isArray(parsed.relationships)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function loadDemoData() {
  const response = await fetch("./demo-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load demo data.");
  return response.json();
}

function supportCounts() {
  const incoming = new Map(state.topics.map((t) => [t.id, 0]));
  const outgoing = new Map(state.topics.map((t) => [t.id, 0]));
  state.relationships.forEach((r) => {
    outgoing.set(r.source, (outgoing.get(r.source) || 0) + 1);
    incoming.set(r.target, (incoming.get(r.target) || 0) + 1);
  });
  return { incoming, outgoing };
}

function setMessage(text) {
  els.message.textContent = text || "";
}

function topicById(id) {
  return state.topics.find((t) => t.id === id);
}

function relationshipById(id) {
  return state.relationships.find((r) => r.id === id);
}

function graphElements() {
  const { incoming, outgoing } = supportCounts();
  return [
    ...state.topics.map((topic) => ({
      data: {
        id: topic.id,
        label: topic.name,
        status: topic.status,
        isolated: incoming.get(topic.id) === 0 && outgoing.get(topic.id) === 0 ? "yes" : "no",
        importance: outgoing.get(topic.id) || 0
      }
    })),
    ...state.relationships.map((r) => ({
      data: {
        id: r.id,
        source: r.source,
        target: r.target,
        kind: r.kind
      }
    }))
  ];
}

function buildGraph() {
  cy = cytoscape({
    container: document.querySelector("#cy"),
    elements: graphElements(),
    layout: {
      name: "cose",
      animate: false,
      nodeRepulsion: 9000,
      idealEdgeLength: 120
    },
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#e6e9ef",
          "border-color": "#69707d",
          "border-width": 1.5,
          "label": "data(label)",
          "font-size": 12,
          "color": "#17191d",
          "text-wrap": "wrap",
          "text-max-width": 110,
          "text-valign": "center",
          "text-halign": "center",
          "width": "mapData(importance, 0, 6, 56, 92)",
          "height": "mapData(importance, 0, 6, 42, 68)",
          "shape": "round-rectangle",
          "padding": 8
        }
      },
      {
        selector: 'node[isolated = "yes"]',
        style: {
          "border-style": "dashed",
          "border-width": 2.5,
          "border-color": "#8a5b25"
        }
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
          "border-color": "#3559e0"
        }
      },
      {
        selector: "edge",
        style: {
          "curve-style": "bezier",
          "width": 2.5,
          "line-color": "#3b7d69",
          "target-arrow-color": "#3b7d69",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.9
        }
      },
      {
        selector: 'edge[kind = "prerequisite"]',
        style: {
          "line-color": "#7b4fc9",
          "target-arrow-color": "#7b4fc9"
        }
      },
      {
        selector: 'edge[kind = "helpful"]',
        style: {
          "line-style": "dashed"
        }
      },
      {
        selector: "edge:selected",
        style: {
          "width": 4
        }
      },
      {
        selector: ".dimmed",
        style: {
          "opacity": 0.12
        }
      },
      {
        selector: ".hidden-by-filter",
        style: {
          "display": "none"
        }
      }
    ]
  });

  cy.on("tap", "node", (event) => {
    selected = { type: "topic", id: event.target.id() };
    renderInspector();
  });

  cy.on("tap", "edge", (event) => {
    selected = { type: "edge", id: event.target.id() };
    renderInspector();
  });

  cy.on("tap", (event) => {
    if (event.target === cy) {
      selected = null;
      renderInspector();
    }
  });
}

function rebuildGraph({ preserveSelection = true } = {}) {
  const previous = preserveSelection ? selected : null;
  cy.elements().remove();
  cy.add(graphElements());
  cy.layout({
    name: "cose",
    animate: false,
    nodeRepulsion: 9000,
    idealEdgeLength: 120
  }).run();
  selected = previous;
  applyFilter();
  renderInspector();
}

function updateSelects() {
  const sorted = [...state.topics].sort((a, b) => a.name.localeCompare(b.name));
  const options = sorted.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");
  els.supportingTopic.innerHTML = options;
  els.dependentTopic.innerHTML = options;
  const disabled = sorted.length < 2;
  [...els.relationshipForm.elements].forEach((control) => {
    control.disabled = disabled;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderStats() {
  const { incoming, outgoing } = supportCounts();
  const isolated = state.topics.filter((t) => incoming.get(t.id) === 0 && outgoing.get(t.id) === 0).length;
  els.topicCount.textContent = String(state.topics.length);
  els.relationshipCount.textContent = String(state.relationships.length);
  els.isolatedCount.textContent = String(isolated);
}

function renderInspector() {
  els.emptySelection.hidden = Boolean(selected);
  els.topicInspector.hidden = !(selected && selected.type === "topic");
  els.edgeInspector.hidden = !(selected && selected.type === "edge");

  if (!selected) return;

  if (selected.type === "topic") {
    const topic = topicById(selected.id);
    if (!topic) {
      selected = null;
      renderInspector();
      return;
    }

    const incoming = state.relationships.filter((r) => r.target === topic.id);
    const outgoing = state.relationships.filter((r) => r.source === topic.id);

    els.selectedTopicName.textContent = topic.name;
    els.selectedTopicStatus.textContent = topic.status;
    els.selectedIncomingCount.textContent = String(incoming.length);
    els.selectedOutgoingCount.textContent = String(outgoing.length);

    if (topic.url) {
      els.selectedTopicUrl.hidden = false;
      els.selectedTopicUrl.href = topic.url;
    } else {
      els.selectedTopicUrl.hidden = true;
      els.selectedTopicUrl.removeAttribute("href");
    }

    els.selectedIncoming.innerHTML = incoming.length
      ? incoming.map((r) => {
          const other = topicById(r.source);
          return `<li><span>${escapeHtml(other?.name || r.source)}</span><small>${escapeHtml(r.kind)}</small></li>`;
        }).join("")
      : '<li><span class="muted">None</span></li>';

    els.selectedOutgoing.innerHTML = outgoing.length
      ? outgoing.map((r) => {
          const other = topicById(r.target);
          return `<li><span>${escapeHtml(other?.name || r.target)}</span><small>${escapeHtml(r.kind)}</small></li>`;
        }).join("")
      : '<li><span class="muted">None</span></li>';
  }

  if (selected.type === "edge") {
    const relationship = relationshipById(selected.id);
    if (!relationship) {
      selected = null;
      renderInspector();
      return;
    }
    const source = topicById(relationship.source);
    const target = topicById(relationship.target);
    els.selectedEdgeTitle.textContent = `${source?.name || relationship.source} → ${target?.name || relationship.target}`;
    els.selectedEdgeKind.textContent = relationship.kind;
  }
}

function renderAll({ rebuild = true } = {}) {
  updateSelects();
  renderStats();
  if (rebuild) rebuildGraph();
  else applyFilter();
  renderInspector();
}

function applyFilter() {
  if (!cy) return;
  cy.elements().removeClass("hidden-by-filter dimmed");

  if (activeFilter === "isolated") {
    cy.nodes().forEach((node) => {
      if (node.data("isolated") !== "yes") node.addClass("hidden-by-filter");
    });
    cy.edges().addClass("hidden-by-filter");
  }

  if (activeFilter === "important") {
    const maxImportance = Math.max(0, ...cy.nodes().map((node) => Number(node.data("importance")) || 0));
    cy.nodes().forEach((node) => {
      if ((Number(node.data("importance")) || 0) < maxImportance || maxImportance === 0) {
        node.addClass("dimmed");
      }
    });
  }

  els.filters.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === activeFilter);
  });
}

function addTopic(event) {
  event.preventDefault();
  const name = els.topicName.value.trim();
  const url = els.topicUrl.value.trim();
  const status = els.topicStatus.value;

  if (!name) return;
  if (state.topics.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    setMessage("A topic with that name already exists.");
    return;
  }

  const topic = { id: slugify(name), name, status, url };
  state.topics.push(topic);
  save();
  selected = { type: "topic", id: topic.id };
  els.topicForm.reset();
  els.topicStatus.value = "planned";
  setMessage(`Added “${name}”.`);
  renderAll();
}

function addRelationship(event) {
  event.preventDefault();
  const source = els.supportingTopic.value;
  const target = els.dependentTopic.value;
  const kind = els.relationshipKind.value;

  if (!source || !target) return;
  if (source === target) {
    setMessage("A topic cannot support itself.");
    return;
  }

  const existing = state.relationships.find((r) => r.source === source && r.target === target);
  if (existing) {
    existing.kind = kind;
    selected = { type: "edge", id: existing.id };
    setMessage("Updated the existing relationship.");
  } else {
    const id = `${source}--${target}`;
    state.relationships.push({ id, source, target, kind });
    selected = { type: "edge", id };
    setMessage("Relationship added.");
  }

  save();
  renderAll();
}

function deleteSelectedTopic() {
  if (!selected || selected.type !== "topic") return;
  const topic = topicById(selected.id);
  if (!topic) return;
  if (!confirm(`Delete “${topic.name}” and all of its relationships?`)) return;

  state.topics = state.topics.filter((t) => t.id !== topic.id);
  state.relationships = state.relationships.filter((r) => r.source !== topic.id && r.target !== topic.id);
  selected = null;
  save();
  setMessage(`Deleted “${topic.name}”.`);
  renderAll();
}

function deleteSelectedEdge() {
  if (!selected || selected.type !== "edge") return;
  state.relationships = state.relationships.filter((r) => r.id !== selected.id);
  selected = null;
  save();
  setMessage("Relationship deleted.");
  renderAll();
}

async function resetDemo() {
  if (!confirm("Restore the original demo graph?")) return;
  state = await loadDemoData();
  selected = null;
  activeFilter = "all";
  save();
  setMessage("Demo restored.");
  renderAll();
}

function clearAll() {
  if (!confirm("Delete every topic and relationship from this browser demo?")) return;
  state = { topics: [], relationships: [] };
  selected = null;
  activeFilter = "all";
  save();
  setMessage("Demo cleared.");
  renderAll();
}

function attachEvents() {
  els.topicForm.addEventListener("submit", addTopic);
  els.relationshipForm.addEventListener("submit", addRelationship);
  els.deleteTopic.addEventListener("click", deleteSelectedTopic);
  els.deleteEdge.addEventListener("click", deleteSelectedEdge);
  els.resetDemo.addEventListener("click", () => { resetDemo().catch((err) => setMessage(err.message)); });
  els.clearAll.addEventListener("click", clearAll);
  els.fitGraph.addEventListener("click", () => cy?.fit(undefined, 48));

  els.filters.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      applyFilter();
      cy?.fit(cy.elements(":visible"), 48);
    });
  });
}

async function init() {
  state = loadStored() || await loadDemoData();
  attachEvents();
  buildGraph();
  renderAll({ rebuild: false });
}

init().catch((error) => {
  setMessage(error.message || "Could not initialize the demo.");
});
