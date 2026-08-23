import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { setupWorkbench } from "./main";
import "./styles.css";

function useNarrowWorkbench(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 860px)").matches);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 860px)");
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return narrow;
}

function EditorPane() {
  return (
    <section className="editor-pane" aria-label="XGraph editor">
      <header className="pane-heading editor-heading">
        <label className="example-picker">
          <span>Example</span>
          <select data-example aria-label="ELK Live example" />
        </label>
        <div className="pane-actions">
          <button type="button" data-format>
            Format
          </button>
          <button type="button" data-copy>
            Copy
          </button>
        </div>
      </header>
      <div className="editor-toolbar">
        <strong>XGraph</strong>
        <span>JSON5</span>
        <span className="editor-state" data-editor-state>
          Valid
        </span>
      </div>
      <div className="code-editor" data-editor />
      <footer className="editor-message" data-editor-message>
        Paste an XGraph or edit this example. The preview updates automatically.
      </footer>
    </section>
  );
}

function VisualizationPane() {
  return (
    <section className="visualization-pane" aria-label="Graph visualization">
      <header className="pane-heading visualization-heading">
        <div className="visualization-title">
          <h1 data-name />
          <span data-graph-summary />
        </div>
        <div className="zoom-controls" aria-label="Canvas zoom">
          <button type="button" data-zoom="out" aria-label="Zoom out">
            −
          </button>
          <button type="button" data-zoom="fit">
            Fit
          </button>
          <button type="button" data-zoom="in" aria-label="Zoom in">
            +
          </button>
        </div>
      </header>
      <div className="geometry-stage">
        <div className="geometry-canvas" data-geometry />
        <p className="canvas-help">Scroll to zoom · drag to pan</p>
        <details className="inspector">
          <summary>Inspect</summary>
          <section className="inspector-selection" data-inspector aria-live="polite" />
          <fieldset className="overlay-controls">
            <legend>Overlays</legend>
            <label>
              <input type="checkbox" data-option="grid" /> Grid
            </label>
            <label>
              <input type="checkbox" data-option="bounds" /> Container bounds
            </label>
            <label>
              <input type="checkbox" data-option="labels" /> Label bounds
            </label>
            <label>
              <input type="checkbox" data-option="points" /> Route points
            </label>
            <label>
              <input type="checkbox" data-option="ports" defaultChecked /> Ports
            </label>
          </fieldset>
        </details>
      </div>
    </section>
  );
}

function App() {
  const narrow = useNarrowWorkbench();

  useEffect(() => setupWorkbench(), []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>Layout Lab</strong>
            <span>@statelyai/layout</span>
          </div>
        </div>
        <div className="topbar-status" role="status" aria-live="polite">
          <span className="status-dot" data-status-dot />
          <span data-status>Graph ready</span>
          <span className="status-detail" data-detail>
            JSON5 · live preview
          </span>
        </div>
      </header>

      <ResizablePanelGroup className="workbench" orientation={narrow ? "vertical" : "horizontal"}>
        <ResizablePanel id="editor" defaultSize="50%" minSize={narrow ? 320 : 360}>
          <EditorPane />
        </ResizablePanel>
        <ResizableHandle withHandle aria-label="Resize editor and visualization panels" />
        <ResizablePanel id="visualization" defaultSize="50%" minSize={narrow ? 320 : 420}>
          <VisualizationPane />
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("Missing demo root");
createRoot(root).render(<App />);
