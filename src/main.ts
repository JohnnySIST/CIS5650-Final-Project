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
  public isPanning: boolean = false;
}

class PCBEditor {
  private canvas: HTMLCanvasElement;
  private state: EditorState = new EditorState();

  private pcbDesign: KicadPcb | null = null;

  private renderer: Renderer;

  private simRes: [number, number]; // integers, pixels
  private simTL: [number, number]; // floats, world space
  private simSize: [number, number]; // floats, world space

  private viewRes: [number, number]; // integers, pixels
  private viewTL: [number, number]; // floats, world space
  private viewSize: [number, number]; // floats, world space

  constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice
  ) {
    this.canvas = canvas;
    this.simRes = [canvas.width, canvas.height];
    this.simTL = [0, 0];
    this.simSize = [200, 200];
    this.viewRes = [canvas.width, canvas.height];
    this.viewTL = [0, 0];
    this.viewSize = [200, 200];

    this.renderer = new Renderer(
      canvas,
      context,
      device,
      this.simRes,
      this.simTL,
      this.simSize,
      this.viewRes,
      this.viewTL,
      this.viewSize
    );
    this.init();
  }

  private async init() {
    this.setupEventListeners();
    // this.render();
  }

  private getMouseWorldPosition(e: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();

    // 1. Get mouse position in canvas uv coordinates
    const canvasU = (e.clientX - rect.left) / rect.width;
    const canvasV = (e.clientY - rect.top) / rect.height;

    // 2. Convert from canvas coordinates to world coordinates
    const worldX = canvasU * this.viewSize[0] + this.viewTL[0];
    const worldY = canvasV * this.viewSize[1] + this.viewTL[1];

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

        this.viewTL[0] -= (e.movementX / rect.width) * this.viewSize[0];
        this.viewTL[1] -= (e.movementY / rect.height) * this.viewSize[1];

        this.renderer.updateParams({ viewTL: this.viewTL });
      }
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();

      const worldPosBeforeZoom = this.getMouseWorldPosition(e);

      const zoomFactor = 1.1;
      const oldZoom = this.viewSize[0];
      const zoomInOutFactor = e.deltaY > 0 ? zoomFactor : 1 / zoomFactor;
      this.viewSize[0] *= zoomInOutFactor;
      this.viewSize[1] *= zoomInOutFactor;
      const zoomMinClamp = 0.1;
      const zoomMaxClamp = 10;
      this.viewSize[0] = Math.max(
        zoomMinClamp,
        Math.min(this.viewSize[0], zoomMaxClamp)
      );
      this.viewSize[1] = Math.max(
        zoomMinClamp,
        Math.min(this.viewSize[1], zoomMaxClamp)
      );

      const worldPosAfterZoom = this.getMouseWorldPosition(e);

      // Calculate the world space difference and scale it by the new zoom to get the screen space pan adjustment
      const dx = worldPosAfterZoom.x - worldPosBeforeZoom.x;
      const dy = worldPosAfterZoom.y - worldPosBeforeZoom.y;

      // Apply the adjustment to the pan
      this.viewTL[0] -= dx;
      this.viewTL[1] -= dy;

      this.renderer.updateParams({
        viewTL: this.viewTL,
        viewSize: this.viewSize,
      });
    });

    this.canvas.addEventListener("click", (e) => {
      const clickPos = this.getMouseWorldPosition(e);
      switch (this.state.mode) {
      }
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

          // const footprintPads = pcb.footprints.flatMap((footprint) => {
          //   return footprint.fpPads.filter((pad) => {
          //     return pad.layers.layers.some((layer) => {
          //       return makeRegexFromWildcardString(layer).test(targetLayer);
          //     });
          //   });
          // });

          // const segments = pcb.segments.filter((segment) => {
          //   return segment.layer.names.some((layer) => {
          //     return makeRegexFromWildcardString(layer).test(targetLayer);
          //   });
          // });

          // console.log("Found pads:", footprintPads);
          // console.log("Found segments:", segments);

          const drawAbleFootprintPads = pcb.footprints.flatMap((footprint) => {
            return footprint.fpPads
              .filter((pad) => {
                return (
                  pad.shape === "circle" &&
                  pad.layers.layers.some((layer) => {
                    return makeRegexFromWildcardString(layer).test(targetLayer);
                  })
                );
              })
              .map((pad) => {
                return {
                  x: footprint.position.x + pad.at.x,
                  y: footprint.position.y + pad.at.y,
                  radius: pad.size.height / 2,
                };
              });
          });

          this.renderer.setCircles(
            drawAbleFootprintPads.map((pad) => {
              return {
                center: [pad.x, pad.y],
                radius: pad.radius,
                boundary_value: Math.random(),
              };
            })
          );
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

  const editor = new PCBEditor(canvas, context, device);

  console.log("Main function completed");
}

await main();
