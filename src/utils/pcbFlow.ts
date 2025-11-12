import { Footprint, PCBDesign } from "./pcbtypes";

// Application's UI state
type EditorMode = "select" | "place-component" | "draw-trace";

class EditorState {
  public mode: EditorMode = "select";
  public selectedComponentTemplate: Footprint | null = null;
  public activeTracePoints: { x: number; y: number }[] = [];
  public pcbDesign: PCBDesign;

  constructor(boardWidth: number, boardHeight: number) {
    this.pcbDesign = new PCBDesign(boardWidth, boardHeight);
  }
}

// Main application class
export class PCBEditor {
  private state: EditorState;
  private canvas: HTMLCanvasElement;
  // private renderer: Renderer; // Your WebGPU rendering class

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.state = new EditorState(canvas.width, canvas.height);
    // this.renderer = new Renderer(canvas, this.state.pcbDesign);

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
    this.canvas.addEventListener("click", this.handleClick.bind(this));
    window.addEventListener("keydown", this.handleKeyDown.bind(this));

    // Example: UI buttons to change mode
    document.getElementById("place-res")?.addEventListener("click", () => {
      this.state.mode = "place-component";
      this.state.selectedComponentTemplate =
        this.state.pcbDesign.footprintLibrary.get("RES")!;
    });
    document.getElementById("draw-trace-btn")?.addEventListener("click", () => {
      this.state.mode = "draw-trace";
      this.state.activeTracePoints = [];
    });
  }

  private handleMouseMove(event: MouseEvent) {
    const mousePos = { x: event.offsetX, y: event.offsetY };
    if (
      this.state.mode === "place-component" ||
      this.state.mode === "draw-trace"
    ) {
      // We need to re-render to show the "ghost" component or trace segment
      this.render(mousePos);
    }
  }

  private handleClick(event: MouseEvent) {
    const clickPos = { x: event.offsetX, y: event.offsetY };

    switch (this.state.mode) {
      case "place-component":
        if (this.state.selectedComponentTemplate) {
          this.state.pcbDesign.addComponent(
            this.state.selectedComponentTemplate.name,
            clickPos,
            0
          );
          this.state.mode = "select"; // Revert to select mode after placing
        }
        break;
      case "draw-trace":
        this.state.activeTracePoints.push(clickPos);
        break;
      // case 'select': ... handle selection logic ... break;
    }
    this.render();
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (
        this.state.mode === "draw-trace" &&
        this.state.activeTracePoints.length > 1
      ) {
        // Finalize the trace
        this.state.pcbDesign.addTrace(this.state.activeTracePoints, 1); // e.g., 10 mil width
      }
      // Reset state
      this.state.mode = "select";
      this.state.activeTracePoints = [];
      this.render();
    }
  }

  private render(mousePos?: { x: number; y: number }) {
    // 1. Generate geometry from this.state.pcbDesign
    // 2. If in 'place-component' mode, add ghost geometry for the component at mousePos
    // 3. If in 'draw-trace' mode, add ghost geometry for the active trace line to mousePos
    // 4. Call the renderer to draw the geometry
    // this.renderer.render(generatedGeometry);
    console.log("Render triggered. Current mode:", this.state.mode);
  }
}
