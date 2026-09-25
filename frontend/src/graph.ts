import cytoscape, {
  type Core,
  type ElementDefinition,
  type EventObject,
} from "cytoscape";
import type { GraphData } from "./model";
import { supportCounts } from "./model";

export type GraphSelection =
  | { type: "topic"; id: string }
  | { type: "relationship"; id: string }
  | null;

interface GraphCallbacks {
  onSelect: (selection: GraphSelection) => void;
}

export class TopicGraph {
  private readonly cy: Core;
  private readonly observer: ResizeObserver;
  private currentData: GraphData = { topics: [], relationships: [] };

  constructor(container: HTMLElement, callbacks: GraphCallbacks) {
    this.cy = cytoscape({
      container,
      elements: [],
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.35,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            width: "label",
            height: "label",
            padding: "18px",
            shape: "round-rectangle",
            "background-color": "#f4f5f7",
            "border-color": "#737b88",
            "border-width": 1.5,
            color: "#17191d",
            "font-size": 13,
            "font-weight": 500,
            "text-wrap": "wrap",
            "text-max-width": "180px",
            "text-valign": "center",
            "text-halign": "center",
          },
        },
        {
          selector: 'node[isolated = "yes"]',
          style: {
            "border-style": "dashed",
            "border-width": 2.5,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#315ee8",
            "border-width": 3,
            "background-color": "#edf2ff",
          },
        },
        {
          selector: "edge",
          style: {
            width: 2.2,
            "curve-style": "bezier",
            "line-color": "#4d8b78",
            "target-arrow-color": "#4d8b78",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.9,
          },
        },
        {
          selector: 'edge[kind = "prerequisite"]',
          style: {
            "line-color": "#7655b5",
            "target-arrow-color": "#7655b5",
          },
        },
        {
          selector: 'edge[kind = "helpful"]',
          style: { "line-style": "dashed" },
        },
        { selector: "edge:selected", style: { width: 4 } },
        { selector: ".muted", style: { opacity: 0.16 } },
        { selector: ".hidden", style: { display: "none" } },
      ],
    });

    this.cy.on("tap", "node", (event: EventObject) => {
      callbacks.onSelect({ type: "topic", id: event.target.id() });
    });

    this.cy.on("tap", "edge", (event: EventObject) => {
      callbacks.onSelect({ type: "relationship", id: event.target.id() });
    });

    this.cy.on("tap", (event: EventObject) => {
      if (event.target === this.cy) callbacks.onSelect(null);
    });

    this.observer = new ResizeObserver(() => this.cy.resize());
    this.observer.observe(container);
  }

  setData(data: GraphData, runLayout = true): void {
    this.currentData = data;
    this.cy.elements().remove();
    this.cy.add(this.elements(data));

    if (runLayout && data.topics.length > 0) {
      this.cy
        .layout({
          name: "cose",
          animate: false,
          randomize: true,
          componentSpacing: 90,
          nodeRepulsion: () => 9000,
          idealEdgeLength: () => 140,
        })
        .run();
    }

    this.cy.resize();
  }

  setSelection(selection: GraphSelection): void {
    this.cy.elements().unselect();
    if (selection) {
      const element = this.cy.getElementById(selection.id);
      if (element.nonempty()) element.select();
    }
  }

  fit(): void {
    const visible = this.cy.elements().not(".hidden");
    if (visible.length > 0) this.cy.fit(visible, 56);
  }

  zoomIn(): void {
    this.setZoom(this.cy.zoom() * 1.2);
  }

  zoomOut(): void {
    this.setZoom(this.cy.zoom() / 1.2);
  }

  private setZoom(next: number): void {
    const center = {
      x: this.cy.width() / 2,
      y: this.cy.height() / 2,
    };
    this.cy.zoom({
      level: Math.max(this.cy.minZoom(), Math.min(this.cy.maxZoom(), next)),
      renderedPosition: center,
    });
  }

  applyView(
    view: "all" | "isolated" | "important",
    search: string,
  ): void {
    const query = search.trim().toLowerCase();
    const counts = supportCounts(this.currentData);
    const maxImportance = Math.max(
      0,
      ...[...counts.values()].map((count) => count.outgoing),
    );

    this.cy.elements().removeClass("muted hidden");

    for (const node of this.cy.nodes()) {
      const id = node.id();
      const count = counts.get(id) ?? { incoming: 0, outgoing: 0 };
      const isolated = count.incoming === 0 && count.outgoing === 0;
      const label = String(node.data("label")).toLowerCase();

      if (view === "isolated" && !isolated) node.addClass("hidden");

      if (
        view === "important" &&
        (maxImportance === 0 || count.outgoing < maxImportance)
      ) {
        node.addClass("muted");
      }

      if (query && !label.includes(query)) node.addClass("muted");
    }

    for (const edge of this.cy.edges()) {
      if (
        edge.source().hasClass("hidden") ||
        edge.target().hasClass("hidden")
      ) {
        edge.addClass("hidden");
      } else if (
        edge.source().hasClass("muted") &&
        edge.target().hasClass("muted")
      ) {
        edge.addClass("muted");
      }
    }
  }

  private elements(data: GraphData): ElementDefinition[] {
    const counts = supportCounts(data);

    return [
      ...data.topics.map((topic) => {
        const count = counts.get(topic.id) ?? { incoming: 0, outgoing: 0 };
        return {
          data: {
            id: topic.id,
            label: topic.name,
            status: topic.status,
            isolated:
              count.incoming === 0 && count.outgoing === 0 ? "yes" : "no",
          },
        };
      }),
      ...data.relationships.map((relationship) => ({
        data: {
          id: relationship.id,
          source: relationship.source,
          target: relationship.target,
          kind: relationship.kind,
        },
      })),
    ];
  }
}
