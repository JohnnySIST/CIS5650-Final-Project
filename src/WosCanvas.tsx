import React, { useRef, useEffect, useState } from "react";
import { assert, makeRegexFromWildcardString } from "./utils/util";

import {
  Circle as RenderCircle,
  Renderer,
  Segment as RenderSegment,
} from "./renderers/renderer";
import "./style.css";

import { parseKicadPcb, KicadPcb, FootprintPad, Segment } from "kicadts";

type Vec2 = { x: number; y: number };
type EditorMode = "select";
interface EditorState {
  mode: EditorMode;
  isPanning: boolean;
}

export default function WosCanvas({
  fpsCallback,
}: {
  fpsCallback?: (fps: number) => void;
}) {
  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);

  const [traceWidth, setTraceWidth] = useState(5);

  const [editorState, setEditorState] = useState<EditorState>({
    mode: "select",
    isPanning: false,
  });

  const [simRes, setSimRes] = useState<[number, number]>(
    webgpuCanvasRef.current
      ? [webgpuCanvasRef.current.width, webgpuCanvasRef.current.height]
      : [1920, 1080]
  ); // integers, pixels
  const [simTL, setSimTL] = useState<[number, number]>([120, 90]); // floats, world space
  const [simSize, setSimSize] = useState<[number, number]>([60, 60]); // floats, world space

  const [viewRes, setViewRes] = useState<[number, number]>([
    webgpuCanvasRef.current ? webgpuCanvasRef.current.width : 1920,
    webgpuCanvasRef.current ? webgpuCanvasRef.current.height : 1080,
  ]); // integers, pixels
  const [viewTL, setViewTL] = useState<[number, number]>(simTL); // floats, world space
  const [viewSize, setViewSize] = useState<[number, number]>(simSize); // floats, world space

  const [renderer, setRenderer] = useState<Renderer | null>(null);

  const [pcbDesign, setPcbDesign] = useState<KicadPcb | null>(null);

  const targetPads: FootprintPad[] = [];
  const targetSegments: Segment[] = [];

  const [selectedPad, setSelectedPad] = useState<FootprintPad | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [targetLayer, setTargetLayer] = useState("B.Cu");

  function getMouseWorldPosition(e: MouseEvent): Vec2 {
    if (!webgpuCanvasRef.current) {
      return { x: 0, y: 0 };
    }
    const rect = webgpuCanvasRef.current.getBoundingClientRect();

    // 1. Get mouse position in canvas uv coordinates
    const canvasU = (e.clientX - rect.left) / rect.width;
    const canvasV = (e.clientY - rect.top) / rect.height;

    // 2. Convert from canvas coordinates to world coordinates
    const worldX = canvasU * viewSize[0] + viewTL[0];
    const worldY = canvasV * viewSize[1] + viewTL[1];

    return { x: worldX, y: worldY };
  }

  useEffect(() => {
    (async () => {
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

      const canvas = webgpuCanvasRef.current;
      const uiCanvas = uiCanvasRef.current;
      assert(canvas !== null && uiCanvas !== null);
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      uiCanvas.width = canvas.width;
      uiCanvas.height = canvas.height;

      const context = canvas.getContext("webgpu") as GPUCanvasContext;

      const device = await adapter.requestDevice({
        requiredLimits: {
          maxComputeWorkgroupStorageSize:
            adapter.limits.maxComputeWorkgroupStorageSize,
          maxStorageBufferBindingSize:
            adapter.limits.maxStorageBufferBindingSize,
          maxStorageBuffersPerShaderStage: 10,
        },
      });

      console.log("Device", device);

      setRenderer(
        new Renderer(
          canvas,
          context,
          device,
          simRes,
          simTL,
          simSize,
          viewRes,
          viewTL,
          viewSize,
          fpsCallback
        )
      );

      console.log("Renderer", renderer);

      // const camera = new Camera2D();
      // camera.init(canvas, uiCanvas);

      window.addEventListener("mouseup", (e) => {
        if (e.button === 1) {
          setEditorState({ ...editorState, isPanning: false });
          canvas.style.cursor = "default";
        }
      });

      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          setEditorState({ ...editorState, mode: "select" });
        }
      });
    })();
  }, [webgpuCanvasRef.current, uiCanvasRef.current]);

  async function refreshSimulation() {
    console.log("Refreshing simulation");
    if (!renderer || !pcbDesign) {
      console.log("Renderer", renderer);
      console.log("PCB Design", pcbDesign);
      return;
    }
    console.log("Refreshing simulation 2");
    const drawAbleFootprintPads = pcbDesign.footprints.flatMap((footprint) => {
      return footprint.fpPads
        .filter((pad) => {
          return (
            (pad.shape === "circle" || pad.shape === "oval") &&
            pad.layers?.layers.some((layer) => {
              return makeRegexFromWildcardString(layer).test(targetLayer);
            })
          );
        })
        .map((pad) => {
          return {
            x: (footprint.position?.x || 0) + (pad.at?.x || 0), // TODO: Apply rotation
            y: (footprint.position?.y || 0) + (pad.at?.y || 0),
            radius: (pad.size?.height || 0) / 2,
          };
        });
    });

    const drawAbleSegments = pcbDesign.segments.filter((segment) => {
      return segment.layer?.names.some((layer) => {
        return makeRegexFromWildcardString(layer).test(targetLayer);
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
        start: [segment.startPoint?.x || 0, segment.startPoint?.y || 0],
        end: [segment.endPoint?.x || 0, segment.endPoint?.y || 0],
        widthRadius: (segment.width || 0) / 2,
        boundary_value: Math.random(),
      };
    });
    console.log("Found segments:", drawAbleSegments);

    await renderer.setCircles(renderCircles, renderSegments);
  }

  useEffect(() => {
    (async () => {
      await renderer?.updateParams({
        viewTL: viewTL,
        viewSize: viewSize,
      });
    })();
    console.log("Updated renderer");
  }, [renderer, viewTL, viewSize, pcbDesign]);

  useEffect(() => {
    refreshSimulation();
  }, [renderer, pcbDesign]);

  function downloadFile(
    content: string,
    fileName: string,
    contentType: string
  ) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const updateTraceWidth = (width: number) => {
    setTraceWidth(width);
    if (selectedPad) {
      selectedPad.width = width;
    }
    if (selectedSegment) {
      selectedSegment.width = width;
    }
    if (selectedPad || selectedSegment) {
      refreshSimulation();
    }
  };

  return (
    <>
      <div id="controls">
        <div
          id="trace-controls"
          style={{
            display: "inline-block",
            marginLeft: "10px",
            verticalAlign: "middle",
          }}
        >
          <label htmlFor="trace-width-slider">Trace Width:</label>
          <input
            type="range"
            id="trace-width-slider"
            min={1}
            max={50}
            value={traceWidth}
            style={{ verticalAlign: "middle" }}
            onChange={(e) => updateTraceWidth(Number(e.target.value))}
          />
          <input
            type="number"
            id="trace-width-input"
            min={1}
            max={50}
            value={traceWidth}
            style={{ width: "50px", verticalAlign: "middle" }}
            onChange={(e) => updateTraceWidth(Number(e.target.value))}
          />
        </div>
        <button
          id="import-kicad-btn"
          onClick={() => document.getElementById("kicad-file-input")?.click()}
        >
          Import KiCad PCB
        </button>
        <input
          type="file"
          id="kicad-file-input"
          accept=".kicad_pcb"
          style={{ display: "none" }}
          onChange={async (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
              const file = target.files[0];
              const content = await file.text();
              const pcb = parseKicadPcb(content);
              setPcbDesign(pcb);
              console.log("Parsed KiCad PCB file:", pcb);
            }
          }}
        />

        <button
          id="export-kicad-btn"
          onClick={() => {
            downloadFile(
              pcbDesign?.getString() || "",
              "pcb.kicad_pcb",
              "text/plain"
            );
          }}
        >
          Export to KiCad
        </button>
      </div>
      <div
        style={{
          position: "relative",
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <canvas
          id="ui-canvas"
          ref={uiCanvasRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
        <canvas
          id="webgpu-canvas"
          ref={webgpuCanvasRef}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}
          onClick={(e) => {
            const clickPos = getMouseWorldPosition(e.nativeEvent);
            switch (editorState.mode) {
              case "select":
                if (!pcbDesign) {
                  return;
                }
                const drawAbleFootprintPads: FootprintPad[] =
                  pcbDesign.footprints.flatMap((footprint) => {
                    return (
                      footprint.fpPads
                        .filter((pad) => {
                          return (
                            (pad.shape === "circle" || pad.shape === "oval") &&
                            pad.layers?.layers.some((layer) => {
                              return makeRegexFromWildcardString(layer).test(
                                targetLayer
                              );
                            })
                          );
                        })
                        .find((pad) => {
                          const centerX =
                            (footprint.position?.x || 0) + (pad.at?.x || 0);
                          const centerY =
                            (footprint.position?.y || 0) + (pad.at?.y || 0);
                          const dist = Math.sqrt(
                            (centerX - clickPos.x) ** 2 +
                              (centerY - clickPos.y) ** 2
                          );
                          return dist < (pad.size?.height || 0) / 2;
                        }) ?? []
                    );
                  });
                console.log("drawAbleFootprintPads", drawAbleFootprintPads);
                setSelectedPad(drawAbleFootprintPads[0] ?? null);

                setSelectedSegment(
                  pcbDesign.segments
                    .filter((segment) => {
                      return segment.layer?.names.some((layer) => {
                        return makeRegexFromWildcardString(layer).test(
                          targetLayer
                        );
                      });
                    })
                    .find((segment) => {
                      if (
                        !segment ||
                        !segment.end ||
                        !segment.start ||
                        !segment.width
                      ) {
                        return false;
                      }
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
                    }) ?? null
                );
                break;
            }
          }}
          onWheel={(e) => {
            e.preventDefault();

            const worldPosBeforeZoom = getMouseWorldPosition(e.nativeEvent);

            const zoomFactor = 1.1;
            const zoomInOutFactor = e.deltaY > 0 ? zoomFactor : 1 / zoomFactor;
            const newViewSize: [number, number] = [
              viewSize[0] * zoomInOutFactor,
              viewSize[1] * zoomInOutFactor,
            ];
            const zoomMinClamp = 0.1;
            const zoomMaxClamp = 1000;
            newViewSize[0] = Math.max(
              zoomMinClamp,
              Math.min(newViewSize[0], zoomMaxClamp)
            );
            newViewSize[1] = Math.max(
              zoomMinClamp,
              Math.min(newViewSize[1], zoomMaxClamp)
            );
            setViewSize(newViewSize);

            const worldPosAfterZoom = getMouseWorldPosition(e.nativeEvent);

            // Calculate the world space difference and scale it by the new zoom to get the screen space pan adjustment
            const dx = worldPosAfterZoom.x - worldPosBeforeZoom.x;
            const dy = worldPosAfterZoom.y - worldPosBeforeZoom.y;

            // Apply the adjustment to the pan
            setViewTL([viewTL[0] - dx, viewTL[1] - dy]);
          }}
          onMouseMove={(e) => {
            if (editorState.isPanning) {
              // We need to scale the movement by the canvas's CSS vs internal resolution
              // to ensure 1:1 panning at any display size.
              if (!uiCanvasRef.current) {
                return;
              }
              const rect = uiCanvasRef.current.getBoundingClientRect();

              setViewTL([
                viewTL[0] - (e.movementX / rect.width) * viewSize[0],
                viewTL[1] - (e.movementY / rect.height) * viewSize[1],
              ]);
            }
          }}
          onMouseDown={(e) => {
            // Middle mouse button for panning
            if (e.button === 1) {
              if (!uiCanvasRef.current) {
                return;
              }
              setEditorState({ ...editorState, isPanning: true });
              uiCanvasRef.current.style.cursor = "grabbing";
              e.preventDefault();
            }
          }}
        />
      </div>
    </>
  );
}
