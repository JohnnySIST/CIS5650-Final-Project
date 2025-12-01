import {
  Circle as RenderCircle,
  Renderer,
  Segment as RenderSegment,
} from "./renderers/renderer";
import "./style.css";
import { assert } from "./utils/util";

import { parseKicadPcb, KicadPcb, FootprintPad, Segment } from "kicadts";

// =============================================================================
// Data Structures
// =============================================================================

export class PCBEditor {
  private pcbDesign: KicadPcb | null = null;

  private renderer: Renderer;

  constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    fpsCallback?: (fps: number) => void
  ) {
    this.renderer = new Renderer(
      canvas,
      context,
      device,
      this.simRes,
      this.simTL,
      this.simSize,
      this.viewRes,
      this.viewTL,
      this.viewSize,
      fpsCallback
    );
    this.init();
  }

  private async init() {
    this.setupEventListeners();
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
      const zoomMaxClamp = 1000;
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
        case "select":
          const drawAbleFootprintPads: FootprintPad[] =
            this.pcbDesign?.footprints.flatMap((footprint) => {
              return (
                footprint.fpPads
                  .filter((pad) => {
                    return (
                      (pad.shape === "circle" || pad.shape === "oval") &&
                      pad.layers.layers.some((layer) => {
                        return makeRegexFromWildcardString(layer).test(
                          this.targetLayer
                        );
                      })
                    );
                  })
                  .find((pad) => {
                    const centerX = footprint.position.x + pad.at.x;
                    const centerY = footprint.position.y + pad.at.y;
                    const dist = Math.sqrt(
                      (centerX - clickPos.x) ** 2 + (centerY - clickPos.y) ** 2
                    );
                    return dist < pad.size.height / 2;
                  }) ?? []
              );
            });
          console.log("drawAbleFootprintPads", drawAbleFootprintPads);
          this.selectedPad = drawAbleFootprintPads[0] ?? null;

          this.selectedSegment =
            this.pcbDesign?.segments
              .filter((segment) => {
                return segment.layer.names.some((layer) => {
                  return makeRegexFromWildcardString(layer).test(
                    this.targetLayer
                  );
                });
              })
              .find((segment) => {
                const ABX = segment.end.x - segment.start.x;
                const ABY = segment.end.y - segment.start.y;

                const APX = clickPos.x - segment.start.x;
                const APY = clickPos.y - segment.start.y;

                const ABAP = ABX * APX + ABY * APY;

                const ABAB = ABX * ABX + ABY * ABY;

                const t = ABAP / ABAB;

                if (t < 0) {
                  const dist = Math.sqrt(
                    (segment.start.x - clickPos.x) ** 2 +
                      (segment.start.y - clickPos.y) ** 2
                  );
                  return dist < segment.width / 2;
                }
                if (t > 1) {
                  const dist = Math.sqrt(
                    (segment.end.x - clickPos.x) ** 2 +
                      (segment.end.y - clickPos.y) ** 2
                  );
                  return dist < segment.width / 2;
                }

                const projX = segment.start.x + t * ABX;
                const projY = segment.start.y + t * ABY;

                const dist = Math.sqrt(
                  (projX - clickPos.x) ** 2 + (projY - clickPos.y) ** 2
                );
                return dist < segment.width / 2;
              }) ?? null;
          break;
      }
    });

    const traceWidthSlider = document.getElementById(
      "trace-width-slider"
    ) as HTMLInputElement;
    const traceWidthInput = document.getElementById(
      "trace-width-input"
    ) as HTMLInputElement;

    traceWidthSlider.addEventListener("input", () => {
      const width = Number(traceWidthSlider.value);
      traceWidthInput.value = width.toString();
      if (this.selectedPad) {
        this.selectedPad.size.height = width;
        this.refreshSimulation(); // Re-render to show ghost trace with new width
      }
      if (this.selectedSegment) {
        this.selectedSegment.width = width;
        this.refreshSimulation(); // Re-render to show ghost trace with new width
      }
    });

    traceWidthInput.addEventListener("input", () => {
      const width = Number(traceWidthInput.value);
      traceWidthSlider.value = width.toString();
      if (this.selectedPad) {
        this.selectedPad.size.height = width;
        this.refreshSimulation(); // Re-render to show ghost trace with new width
      }
      if (this.selectedSegment) {
        this.selectedSegment.width = width;
        this.refreshSimulation(); // Re-render to show ghost trace with new width
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
          this.pcbDesign = pcb;
          console.log("Parsed KiCad PCB file:", pcb);
          this.refreshSimulation();
        }
      });

    document
      .getElementById("export-kicad-btn")
      ?.addEventListener("click", () => {
        this.exportToKiCad();
      });
  }

  private refreshSimulation() {
    const drawAbleFootprintPads = this.pcbDesign?.footprints.flatMap(
      (footprint) => {
        return footprint.fpPads
          .filter((pad) => {
            return (
              (pad.shape === "circle" || pad.shape === "oval") &&
              pad.layers.layers.some((layer) => {
                return makeRegexFromWildcardString(layer).test(
                  this.targetLayer
                );
              })
            );
          })
          .map((pad) => {
            return {
              x: footprint.position.x + pad.at.x, // TODO: Apply rotation
              y: footprint.position.y + pad.at.y,
              radius: pad.size.height / 2,
            };
          });
      }
    );

    const drawAbleSegments = this.pcbDesign?.segments.filter((segment) => {
      return segment.layer.names.some((layer) => {
        return makeRegexFromWildcardString(layer).test(this.targetLayer);
      });
    });

    const renderCircles: RenderCircle[] = drawAbleFootprintPads.map((pad) => {
      return {
        center: [pad.x, pad.y],
        radius: pad.radius,
        boundary_value: Math.random(),
      };
    });
    console.log("Found pads:", drawAbleFootprintPads);

    const renderSegments: RenderSegment[] = drawAbleSegments.map((segment) => {
      return {
        start: [segment.startPoint.x, segment.startPoint.y],
        end: [segment.endPoint.x, segment.endPoint.y],
        widthRadius: segment.width / 2,
        boundary_value: Math.random(),
      };
    });
    console.log("Found segments:", drawAbleSegments);

    this.renderer.setCircles(renderCircles, renderSegments);
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
