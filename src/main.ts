import { Renderer } from "./renderers/renderer";
import "./style.css";
import { assert } from "./utils/util";

import { parseKicadPcb, KicadPcb, Segment, FootprintPad } from "kicadts";

// =============================================================================
// Data Structures
// =============================================================================
type Vec2 = { x: number; y: number };
type EditorMode = "select";

function makeRegexFromWildcardString(str: string): RegExp {
  let escapedPattern = str.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

  // Replace wildcard characters with regex equivalents
  let regexPattern = escapedPattern.replace(/\*/g, ".*");

  // Anchor the regex to match the entire string
  return new RegExp(`^${regexPattern}$`);
}

class EditorState {
  public mode: EditorMode = "select";
  public pan: Vec2 = { x: 0, y: 0 }; // board coordinates
  public zoom: number = 1.0; // scale factor
  public isPanning: boolean = false;
}

class PCBEditor {
  private canvas: HTMLCanvasElement;
  private state: EditorState = new EditorState();

  private pcbDesign: KicadPcb | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.init();
  }

  private async init() {
    this.setupEventListeners();
    // this.render();
  }

  private getMouseWorldPosition(e: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    // 1. Get mouse position in canvas pixel coordinates
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    // 2. Convert from canvas coordinates to world coordinates
    const worldX = (canvasX - this.state.pan.x) / this.state.zoom;
    const worldY = (canvasY - this.state.pan.y) / this.state.zoom;

    return { x: worldX, y: worldY };
  }

  private setupEventListeners() {
    this.canvas.addEventListener("mousedown", (e) => {
      // Middle mouse button for panning
      if (e.button === 1) {
        this.state.isPanning = true;
        this.canvas.style.cursor = "grabbing";
        e.preventDefault();
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 1) {
        this.state.isPanning = false;
        this.canvas.style.cursor = "default";
      }
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.state.isPanning) {
        // We need to scale the movement by the canvas's CSS vs internal resolution
        // to ensure 1:1 panning at any display size.
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        this.state.pan.x += e.movementX * scaleX;
        this.state.pan.y += e.movementY * scaleY;
        // this.render();
      }
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();

      const worldPosBeforeZoom = this.getMouseWorldPosition(e);

      const zoomFactor = 1.1;
      const oldZoom = this.state.zoom;
      this.state.zoom *= e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
      this.state.zoom = Math.max(0.1, Math.min(this.state.zoom, 10)); // Clamp zoom

      const worldPosAfterZoom = this.getMouseWorldPosition(e);

      // Calculate the world space difference and scale it by the new zoom to get the screen space pan adjustment
      const dx = (worldPosAfterZoom.x - worldPosBeforeZoom.x) * this.state.zoom;
      const dy = (worldPosAfterZoom.y - worldPosBeforeZoom.y) * this.state.zoom;

      // Apply the adjustment to the pan
      this.state.pan.x += dx;
      this.state.pan.y += dy;

      // this.render();
    });

    this.canvas.addEventListener("click", (e) => {
      const clickPos = this.getMouseWorldPosition(e);
      switch (this.state.mode) {
      }
      // this.render();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.state.mode = "select";
        // this.render();
      }
    });

    document
      .getElementById("import-kicad-btn")
      ?.addEventListener("click", () => {
        document.getElementById("kicad-file-input")?.click();
      });

    document
      .getElementById("kicad-file-input")
      ?.addEventListener("change", async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          const file = target.files[0];
          const content = await file.text();
          const pcb = parseKicadPcb(content);
          console.log("Parsed KiCad PCB file:", pcb);

          const targetLayer = "B.Cu";

          const footprintPads = pcb.footprints.flatMap((footprint) => {
            return footprint.fpPads.filter((pad) => {
              return pad.layers.layers.some((layer) => {
                return makeRegexFromWildcardString(layer).test(targetLayer);
              });
            });
          });

          const segments = pcb.segments.filter((segment) => {
            return segment.layer.names.some((layer) => {
              return makeRegexFromWildcardString(layer).test(targetLayer);
            });
          });

          console.log("Found pads:", footprintPads);
          console.log("Found segments:", segments);
        }
      });

    document
      .getElementById("export-kicad-btn")
      ?.addEventListener("click", () => {
        this.exportToKiCad();
      });
  }

  private exportToKiCad() {
    this.downloadFile(
      this.pcbDesign?.getString() || "",
      "pcb.kicad_pcb",
      "text/plain"
    );
  }

  private downloadFile(content: string, fileName: string, contentType: string) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// =============================================================================
// Main Execution
// =============================================================================
async function main() {
  console.log("Main function started");
  if (navigator.gpu === undefined) {
    const h = document.querySelector("#title") as HTMLElement;
    h.innerText = "WebGPU is not supported in this browser.";
    return;
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (adapter === null) {
    const h = document.querySelector("#title") as HTMLElement;
    h.innerText = "No adapter is available for WebGPU.";
    return;
  }

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxComputeWorkgroupStorageSize:
        adapter.limits.maxComputeWorkgroupStorageSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxStorageBuffersPerShaderStage: 10,
    },
  });

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  assert(canvas !== null, "Could not find canvas element");
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  const context = canvas.getContext("webgpu") as GPUCanvasContext;

  new PCBEditor(canvas);

  new Renderer(canvas, context, device);

  console.log("Main function completed");
}

await main();
