import Button from "@mui/material/Button";
import React, { useRef, useEffect, useState, useMemo } from "react";
import { assert, makeRegexFromWildcardString } from "./utils/util";
import TraceWidthSlider from "./ui/TraceWidthSlider";
import { distanceToLineSegment } from "./utils/mathUtils";

import {
  BoundaryType,
  Circle as RenderCircle,
  Segment as RenderSegment,
} from "./renderers/renderTypes";
import "./style.css";
import { Renderer } from "./renderers/renderer";

import {
  parseKicadPcb,
  KicadPcb,
  FootprintPad,
  Segment,
  Footprint,
} from "kicadts";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";

function downloadFile(content: string, fileName: string, contentType: string) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

type Vec2 = { x: number; y: number };
type EditorMode = "select";

type BoundaryInfo = {
  boundaryValue: number;
  boundaryType: BoundaryType;
};

type BoundarySegment = Segment & BoundaryInfo;
type BoundaryPad = FootprintPad & BoundaryInfo;
type BoundaryFootprint = Omit<Footprint, "fpPads"> & { fpPads: BoundaryPad[] };

type BoundaryPadFullRef = [BoundaryPad, BoundaryFootprint];

function getFullPosition(padFullRef: BoundaryPadFullRef) {
  const pad = padFullRef[0];
  const footprint = padFullRef[1];
  return {
    x: (footprint.position?.x || 0) + (pad.at?.x || 0), // TODO: Apply rotation
    y: (footprint.position?.y || 0) + (pad.at?.y || 0),
  };
}

export default function WosCanvas({
  fpsCallback,
  simulationEnabled,
}: {
  fpsCallback?: (fps: number) => void;
  simulationEnabled: boolean;
}) {
  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);
  const adapterRef = useRef<GPUAdapter | null>(null);
  const deviceRef = useRef<GPUDevice | null>(null);
  const gpuContextRef = useRef<GPUCanvasContext | null>(null);

  const [traceWidth, setTraceWidth] = useState(5);

  const [editorMode, setEditorMode] = useState<EditorMode>("select");
  const [isPanning, setIsPanning] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [selectionStart, setSelectionStart] = useState<[number, number] | null>(
    null
  ); // world space
  const [selectionEnd, setSelectionEnd] = useState<[number, number] | null>(
    null
  ); // world space

  const rendererRef = useRef<Renderer | null>(null);

  const [pcbDesign, setPcbDesign] = useState<KicadPcb | null>(null);

  const targetPads: FootprintPad[] = [];

  const [targetSegments, setTargetSegments] = useState<BoundarySegment[]>([]);
  const [targetFootprints, setTargetFootprints] = useState<BoundaryFootprint[]>(
    []
  );

  const [selectedPad, setSelectedPad] = useState<BoundaryPadFullRef | null>(
    null
  );
  const [selectedSegment, setSelectedSegment] =
    useState<BoundarySegment | null>(null);

  const [mouseDownSelectedPad, setMouseDownSelectedPad] =
    useState<BoundaryPadFullRef | null>(null);
  const [mouseDownSelectedSegment, setMouseDownSelectedSegment] =
    useState<BoundarySegment | null>(null);

  const [targetLayer, setTargetLayer] = useState("B.Cu");

  const edgeCutSegments = useMemo(() => {
    console.log("edge cut segments updated");
    return pcbDesign?.graphicLines.filter((line) => {
      return line.layer?.names.some((layer) => {
        return makeRegexFromWildcardString(layer).test("Edge.Cuts");
      });
    });
  }, [pcbDesign]);

  const boardTL: [number, number] = useMemo(() => {
    console.log("boardTL updated");
    return (
      edgeCutSegments?.reduce(
        (acc, line) => {
          return [
            Math.min(acc[0], line.start?.x || Number.POSITIVE_INFINITY),
            Math.min(acc[1], line.start?.y || Number.POSITIVE_INFINITY),
          ];
        },
        [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
      ) ?? [120, 90]
    );
  }, [edgeCutSegments]);

  const boardBR: [number, number] = useMemo(() => {
    console.log("boardBR updated");
    return (
      edgeCutSegments?.reduce(
        (acc, line) => {
          return [
            Math.max(acc[0], line.end?.x || Number.NEGATIVE_INFINITY),
            Math.max(acc[1], line.end?.y || Number.NEGATIVE_INFINITY),
          ];
        },
        [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
      ) ?? [180, 150]
    );
  }, [edgeCutSegments]);

  const boardSize: [number, number] = useMemo(() => {
    console.log("boardSize updated");
    return [boardBR[0] - boardTL[0], boardBR[1] - boardTL[1]];
  }, [boardBR, boardTL]);

  const [simRes, setSimRes] = useState<[number, number]>(
    webgpuCanvasRef.current
      ? [webgpuCanvasRef.current.width, webgpuCanvasRef.current.height]
      : [720, 480]
  ); // integers, pixels
  const [simTL, setSimTL] = useState<[number, number]>([...boardTL]); // floats, world space
  const [simSize, setSimSize] = useState<[number, number]>([...boardSize]); // floats, world space

  // const [viewRes, setViewRes] = useState<[number, number]>([
  //   webgpuCanvasRef.current ? webgpuCanvasRef.current.width : 1920,
  //   webgpuCanvasRef.current ? webgpuCanvasRef.current.height : 1080,
  // ]); // integers, pixels
  const viewRes: [number, number] = [
    webgpuCanvasRef.current ? webgpuCanvasRef.current.width : 1920,
    webgpuCanvasRef.current ? webgpuCanvasRef.current.height : 1080,
  ];
  const [viewTL, setViewTL] = useState<[number, number]>(simTL); // floats, world space
  const [viewSize, setViewSize] = useState<[number, number]>(simSize); // floats, world space

  const [reactDummyVariableRender, setReactDummyVariableRender] = useState(0);
  const [reactDummyVariable2D, setReactDummyVariable2D] = useState(0);

  function getWorldPositionFromCanvasUV(
    canvasU: number,
    canvasV: number,
    suppliedViewSize?: [number, number],
    suppliedViewTL?: [number, number]
  ): Vec2 {
    const tempViewSize = suppliedViewSize || viewSize;
    const tempViewTL = suppliedViewTL || viewTL;
    const worldX = canvasU * tempViewSize[0] + tempViewTL[0];
    const worldY = canvasV * tempViewSize[1] + tempViewTL[1];
    return { x: worldX, y: worldY };
  }

  function scaleCanvasPositionToCanvasUV(
    x: number,
    y: number
  ): { u: number; v: number } {
    if (!webgpuCanvasRef.current) {
      return { u: 0, v: 0 };
    }
    const rect = webgpuCanvasRef.current.getBoundingClientRect();
    const canvasU = x / rect.width;
    const canvasV = y / rect.height;
    return { u: canvasU, v: canvasV };
  }

  function scaleCanvasUVToCanvasPosition(
    u: number,
    v: number
  ): { x: number; y: number } {
    if (!webgpuCanvasRef.current) {
      return { x: 0, y: 0 };
    }
    const rect = webgpuCanvasRef.current.getBoundingClientRect();
    const x = u * rect.width;
    const y = v * rect.height;
    return { x, y };
  }

  function scaleCanvasUVToWorldPosition(
    u: number,
    v: number
  ): { x: number; y: number } {
    const worldX = u * viewSize[0];
    const worldY = v * viewSize[1];
    return { x: worldX, y: worldY };
  }

  function scaleWorldPositionToCanvasUV(
    x: number,
    y: number
  ): { u: number; v: number } {
    const canvasU = x / viewSize[0];
    const canvasV = y / viewSize[1];
    return { u: canvasU, v: canvasV };
  }

  function scaleWorldPositionToCanvasPosition(
    x: number,
    y: number
  ): { x: number; y: number } {
    const { u, v } = scaleWorldPositionToCanvasUV(x, y);
    return scaleCanvasUVToCanvasPosition(u, v);
  }

  function getCanvasUVFromEvent(e: MouseEvent): { u: number; v: number } {
    if (!webgpuCanvasRef.current) {
      return { u: 0, v: 0 };
    }
    const rect = webgpuCanvasRef.current.getBoundingClientRect();
    const canvasU = (e.clientX - rect.left) / rect.width;
    const canvasV = (e.clientY - rect.top) / rect.height;
    return { u: canvasU, v: canvasV };
  }

  function getCanvasUVFromCanvasPosition(
    x: number,
    y: number
  ): { u: number; v: number } {
    if (!webgpuCanvasRef.current) {
      return { u: 0, v: 0 };
    }
    const rect = webgpuCanvasRef.current.getBoundingClientRect();
    const canvasU = (x - rect.left) / rect.width;
    const canvasV = (y - rect.top) / rect.height;
    return { u: canvasU, v: canvasV };
  }

  function getMouseWorldPosition(
    e: MouseEvent,
    suppliedViewSize?: [number, number],
    suppliedViewTL?: [number, number]
  ): Vec2 {
    const { u: canvasU, v: canvasV } = getCanvasUVFromEvent(e);
    return getWorldPositionFromCanvasUV(
      canvasU,
      canvasV,
      suppliedViewSize,
      suppliedViewTL
    );
  }

  function getCanvasUVFromWorldPosition(
    worldX: number,
    worldY: number
  ): { u: number; v: number } {
    const canvasU = (worldX - viewTL[0]) / viewSize[0];
    const canvasV = (worldY - viewTL[1]) / viewSize[1];
    return { u: canvasU, v: canvasV };
  }

  function getCanvasPositionFromCanvasUV(
    canvasU: number,
    canvasV: number
  ): { x: number; y: number } {
    if (!webgpuCanvasRef.current) {
      return { x: 0, y: 0 };
    }
    const rect = webgpuCanvasRef.current.getBoundingClientRect();
    const x = canvasU * rect.width + rect.left;
    const y = canvasV * rect.height + rect.top;
    return { x, y };
  }

  function getCanvasPositionFromWorldPosition(
    worldX: number,
    worldY: number
  ): { x: number; y: number } {
    const { u: canvasU, v: canvasV } = getCanvasUVFromWorldPosition(
      worldX,
      worldY
    );
    return getCanvasPositionFromCanvasUV(canvasU, canvasV);
  }

  useEffect(() => {
    rendererRef.current?.updateParams({
      simulationEnabled: simulationEnabled,
    });
  }, [simulationEnabled]);

  useEffect(() => {
    (async () => {
      if (navigator.gpu === undefined) {
        const h = document.querySelector("#title") as HTMLElement;
        h.innerText = "WebGPU is not supported in this browser.";
        return;
      }

      adapterRef.current =
        adapterRef.current ||
        (await navigator.gpu.requestAdapter({
          powerPreference: "high-performance",
        }));
      if (adapterRef.current === null) {
        const h = document.querySelector("#title") as HTMLElement;
        h.innerText = "No adapter is available for WebGPU.";
        return;
      }

      const canvas = webgpuCanvasRef.current;
      const uiCanvas = uiCanvasRef.current;
      if (!canvas || !uiCanvas) {
        const h = document.querySelector("#title") as HTMLElement;
        h.innerText = "Canvas is not available.";
        return;
      }
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      uiCanvas.width = canvas.width;
      uiCanvas.height = canvas.height;

      gpuContextRef.current =
        gpuContextRef.current ||
        (canvas.getContext("webgpu") as GPUCanvasContext);

      deviceRef.current =
        deviceRef.current ||
        (await adapterRef.current.requestDevice({
          requiredLimits: {
            maxComputeWorkgroupStorageSize:
              adapterRef.current.limits.maxComputeWorkgroupStorageSize,
            maxStorageBufferBindingSize:
              adapterRef.current.limits.maxStorageBufferBindingSize,
            maxStorageBuffersPerShaderStage: 10,
          },
        }));
      if (!deviceRef.current) {
        const h = document.querySelector("#title") as HTMLElement;
        h.innerText = "Device is not available.";
        return;
      }

      console.log("Device", deviceRef.current);

      if (!rendererRef.current) {
        console.log("CREATING NEW RENDERER");
        rendererRef.current = new Renderer(
          canvas,
          gpuContextRef.current!,
          deviceRef.current!,
          boardTL,
          boardSize,
          simRes,
          simTL,
          simSize,
          viewRes,
          viewTL,
          viewSize,
          simulationEnabled,
          fpsCallback
        );
      }
    })();
  }, [webgpuCanvasRef.current, uiCanvasRef.current]);

  // const currentLayerFootprintPads = useMemo(() => {
  //   return (
  //     pcbDesign?.footprints.flatMap((footprint) => {
  //       return footprint.fpPads.filter((pad) => {
  //         return (
  //           (pad.shape === "circle" || pad.shape === "oval") &&
  //           pad.layers?.layers.some((layer) => {
  //             return makeRegexFromWildcardString(layer).test(targetLayer);
  //           })
  //         );
  //       });
  //     }) ?? []
  //   );
  // }, [pcbDesign, targetLayer, reactDummyVariable]);

  const drawAbleFootprintPads =
    targetFootprints.flatMap((footprint) => {
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
            ...getFullPosition([pad, footprint]),
            radius: (pad.size?.width || 0) / 2,
            boundary_value: pad.boundaryValue,
            boundary_type: pad.boundaryType,
          };
        });
    }) ?? [];

  const renderCircles: RenderCircle[] = drawAbleFootprintPads.map((pad) => {
    return {
      center: [pad.x, pad.y],
      radius: pad.radius,
      boundary_value: pad.boundary_value,
      boundary_type: pad.boundary_type,
    };
  });

  const drawAbleSegments =
    targetSegments.filter((segment) => {
      return segment.layer?.names.some((layer) => {
        return makeRegexFromWildcardString(layer).test(targetLayer);
      });
    }) ?? [];

  const renderSegments: RenderSegment[] = drawAbleSegments.map((segment) => {
    return {
      start: [segment.start?.x || 0, segment.start?.y || 0],
      end: [segment.end?.x || 0, segment.end?.y || 0],
      widthRadius: (segment.width || 0) / 2,
      boundary_value: segment.boundaryValue,
      boundary_type: segment.boundaryType,
    };
  });

  function refreshSimulation() {
    console.log("Possibly refreshing simulation");
    if (!rendererRef.current || !pcbDesign) {
      console.log("sike not refreshing: ");
      console.log("Renderer", rendererRef.current);
      console.log("PCB Design", pcbDesign);
      return;
    }
    console.log("Actually refreshing simulation for real");
    console.log("Found pads:", drawAbleFootprintPads);
    console.log("Found segments:", drawAbleSegments);

    console.log("renderCircles", renderCircles);
    console.log("renderSegments", renderSegments);

    rendererRef.current.updateGeometry(renderCircles, renderSegments);
  }

  function getPadsAtPosition(pos: {
    x: number;
    y: number;
  }): BoundaryPadFullRef[] {
    return targetFootprints.flatMap((footprint) => {
      return (
        footprint.fpPads
          .filter((pad) => {
            return (
              (pad.shape === "circle" || pad.shape === "oval") &&
              pad.layers?.layers.some((layer) => {
                return makeRegexFromWildcardString(layer).test(targetLayer);
              })
            );
          })
          .filter((pad) => {
            const center = getFullPosition([pad, footprint]);
            const dist = Math.sqrt(
              (center.x - pos.x) ** 2 + (center.y - pos.y) ** 2
            );
            return dist < (pad.size?.height || 0) / 2;
          })
          .map((pad) => [pad, footprint] satisfies BoundaryPadFullRef) ?? []
      );
    });
  }

  function getSegmentsAtPosition(pos: { x: number; y: number }) {
    return targetSegments
      .filter((segment) => {
        return segment.layer?.names.some((layer) => {
          return makeRegexFromWildcardString(layer).test(targetLayer);
        });
      })
      .filter((segment) => {
        if (!segment || !segment.end || !segment.start || !segment.width) {
          return false;
        }
        const dist = distanceToLineSegment(pos, segment.start, segment.end);
        return dist < segment.width / 2;
      });
  }

  useEffect(() => {
    if (!uiCanvasRef.current) return;
    const ctx = uiCanvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
    if (isSelecting && selectionStart && selectionEnd) {
      const p1 = getCanvasPositionFromWorldPosition(...selectionStart);
      const p2 = getCanvasPositionFromWorldPosition(...selectionEnd);

      ctx.save();
      ctx.strokeStyle = "rgba(0,128,255,0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        Math.min(p1.x, p2.x),
        Math.min(p1.y, p2.y),
        Math.abs(p2.x - p1.x),
        Math.abs(p2.y - p1.y)
      );
      ctx.restore();
    }

    if (selectedPad) {
    }

    if (
      selectedSegment &&
      selectedSegment.start &&
      selectedSegment.end &&
      selectedSegment.width
    ) {
      const p1 = getCanvasPositionFromWorldPosition(
        selectedSegment.start.x,
        selectedSegment.start.y
      );
      const p2 = getCanvasPositionFromWorldPosition(
        selectedSegment.end.x,
        selectedSegment.end.y
      );
      const canvasWidth = scaleWorldPositionToCanvasPosition(
        selectedSegment.width,
        0
      ).x;
      ctx.save();
      ctx.strokeStyle = "rgba(0,128,255,0.6)";
      ctx.lineWidth = canvasWidth;
      const circleR = 0.001;
      ctx.beginPath();
      ctx.moveTo(p1.x + circleR, p1.y);
      ctx.arc(p1.x, p1.y, circleR, 0, Math.PI * 2);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p2.x + circleR, p2.y);
      ctx.arc(p2.x, p2.y, circleR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (selectedPad) {
      const padPos = getFullPosition(selectedPad);
      const center = getCanvasPositionFromWorldPosition(padPos.x, padPos.y);
      const width = scaleWorldPositionToCanvasPosition(
        selectedPad[0].size?.width || 0,
        0
      ).x;
      const circleR = 0.001;
      ctx.save();
      ctx.strokeStyle = "rgba(0,128,255,0.6)";
      ctx.lineWidth = width;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(center.x + circleR, center.y);
      ctx.arc(center.x, center.y, circleR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    uiCanvasRef.current,
    selectionStart,
    selectionEnd,
    isSelecting,
    selectedPad,
    selectedSegment,
    viewTL,
    viewSize,
    reactDummyVariableRender,
    reactDummyVariable2D,
  ]);

  useEffect(() => {
    rendererRef.current?.updateParams({
      viewTL: viewTL,
      viewSize: viewSize,
    });
    // console.log("Updated renderer view", viewTL, viewSize);
  }, [rendererRef.current, viewTL, viewSize]);

  useEffect(() => {
    rendererRef.current?.updateParams({
      viewRes: viewRes,
    });
    // console.log("Updated renderer res", viewRes);
  }, [rendererRef.current, viewRes]);

  useEffect(() => {
    rendererRef.current?.updateParams({
      simTL: simTL,
      simSize: simSize,
    });
    rendererRef.current?.resetSim();
    console.log("Updated rendererRef.current sim", simTL, simSize);
  }, [rendererRef.current, simTL, simSize]);

  useEffect(() => {
    rendererRef.current?.updateParams({
      simRes: simRes,
    });
    console.log("Updated renderer sim res", simRes);
  }, [rendererRef.current, simRes]);

  useEffect(() => {
    rendererRef.current?.updateParams({
      boardTL: boardTL,
      boardSize: boardSize,
    });
    console.log("Updated renderer board", boardTL, boardSize);
  }, [rendererRef.current, boardTL, boardSize]);

  useEffect(() => {
    setSimTL(boardTL);
    setSimSize(boardSize);
  }, [boardTL, boardSize]);

  useEffect(() => {
    refreshSimulation();
    console.log("Refreshed simulation");
  }, [rendererRef.current, pcbDesign, reactDummyVariableRender]);

  const updateTraceWidth = (width: number) => {
    setTraceWidth(width);
    if (selectedPad) {
      if (!selectedPad[0].size) {
        selectedPad[0].size = {
          width: width,
          height: width,
        };
      } else {
        selectedPad[0].size.width = width;
      }
      console.log("Updated selected pad", selectedPad);
    }
    if (selectedSegment) {
      selectedSegment.width = width;
    }
    if (selectedPad || selectedSegment) {
      console.log("Updated selected pad or segment");
      setReactDummyVariableRender((prev) => prev + 1);
    }
  };

  const [resMenuAnchorEl, setResMenuAnchorEl] =
    React.useState<null | HTMLElement>(null);
  const resmenuopen = Boolean(resMenuAnchorEl);
  const handleResMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setResMenuAnchorEl(event.currentTarget);
  };
  const handleResMenuClose = (resolution: [number, number]) => {
    setSimRes([...resolution]);
    setResMenuAnchorEl(null);
  };

  return (
    <>
      <div style={{ position: "absolute", top: 24, right: 12, zIndex: 2000 }}>
        <TraceWidthSlider
          value={traceWidth}
          min={1}
          max={50}
          onChange={updateTraceWidth}
        />
      </div>
      <div
        id="controls"
        style={{
          position: "absolute",
          top: 20,
          left: 24,
          zIndex: 1000,
        }}
      >
        <Button
          id="import-kicad-btn"
          variant="contained"
          color="primary"
          sx={{
            position: "fixed",
            right: 32,
            top: 120,
            fontSize: "0.95rem",
          }}
          onClick={() => document.getElementById("kicad-file-input")?.click()}
        >
          Import KiCad PCB
        </Button>
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
              setTargetSegments(
                pcb?.segments.map((segment) =>
                  Object.assign(segment, {
                    boundaryValue: Math.random(),
                    boundaryType: BoundaryType.NEUMANN,
                  })
                ) || []
              );

              setTargetFootprints(
                pcb?.footprints.map((footprint) =>
                  Object.assign(footprint, {
                    fpPads: footprint.fpPads.map((pad) =>
                      Object.assign(pad, {
                        boundaryValue: Math.random(),
                        boundaryType: BoundaryType.DIRICHILET,
                      })
                    ),
                  })
                ) || []
              );

              console.log("Parsed KiCad PCB file:", pcb);
            }
          }}
        />
        <Button
          id="export-kicad-btn"
          variant="contained"
          color="primary"
          sx={{
            position: "fixed",
            right: 32,
            top: 170,
            fontSize: "0.95rem",
          }}
          onClick={() => {
            downloadFile(
              pcbDesign?.getString() || "",
              "pcb.kicad_pcb",
              "text/plain"
            );
          }}
        >
          Export to KiCad
        </Button>
        <Button
          id="basic-button"
          aria-controls={resmenuopen ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={resmenuopen ? "true" : undefined}
          variant="contained"
          color="primary"
          sx={{
            position: "fixed",
            right: 32,
            top: 220,
            fontSize: "0.95rem",
          }}
          onClick={handleResMenuClick}
        >
          Sim Resolution
        </Button>
        <Menu
          id="basic-menu"
          anchorEl={resMenuAnchorEl}
          open={resmenuopen}
          onClose={handleResMenuClose}
          slotProps={{
            list: {
              "aria-labelledby": "basic-button",
            },
          }}
        >
          <MenuItem onClick={() => handleResMenuClose([1920, 1080])}>
            1920x1080
          </MenuItem>
          <MenuItem onClick={() => handleResMenuClose([1280, 720])}>
            1280x720
          </MenuItem>
          <MenuItem onClick={() => handleResMenuClose([720, 480])}>
            720x480
          </MenuItem>
        </Menu>
        {(selectedPad || selectedSegment) && (
          <div
            style={{
              position: "fixed",
              right: 32,
              top: 270,
              backgroundColor: "white",
              padding: "16px",
              borderRadius: "4px",
              boxShadow:
                "0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)",
              fontFamily: "Roboto, Helvetica, Arial, sans-serif",
              fontSize: "0.95rem",
              color: "black",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              minWidth: "200px",
            }}
          >
            {selectedPad && (
              <div style={{ marginBottom: selectedSegment ? "8px" : "0" }}>
                <strong>Selected Pad</strong>
                <br />
                Width: {selectedPad[0].size?.width.toFixed(3) ?? "N/A"}
              </div>
            )}
            {selectedSegment && (
              <div>
                <strong>Selected Segment</strong>
                <br />
                Width: {selectedSegment.width?.toFixed(3) ?? "N/A"}
              </div>
            )}

            <FormControl fullWidth size="small">
              <InputLabel id="boundary-type-label">Boundary Type</InputLabel>
              <Select
                labelId="boundary-type-label"
                value={
                  selectedPad?.[0].boundaryType ??
                  selectedSegment?.boundaryType ??
                  BoundaryType.DIRICHILET
                }
                label="Boundary Type"
                onChange={(e) => {
                  const newVal = e.target.value as BoundaryType;
                  if (selectedPad) selectedPad[0].boundaryType = newVal;
                  if (selectedSegment) selectedSegment.boundaryType = newVal;
                  setReactDummyVariableRender((prev) => prev + 1);
                }}
              >
                <MenuItem value={BoundaryType.DIRICHILET}>Dirichlet</MenuItem>
                <MenuItem value={BoundaryType.NEUMANN}>Neumann</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Boundary Value"
              type="number"
              size="small"
              fullWidth
              value={
                selectedPad?.[0].boundaryValue ??
                selectedSegment?.boundaryValue ??
                0
              }
              onChange={(e) => {
                const newVal = parseFloat(e.target.value);
                if (selectedPad) selectedPad[0].boundaryValue = newVal;
                if (selectedSegment) selectedSegment.boundaryValue = newVal;
                setReactDummyVariableRender((prev) => prev + 1);
              }}
            />
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <canvas
          id="webgpu-canvas"
          ref={webgpuCanvasRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
        <canvas
          id="ui-canvas"
          ref={uiCanvasRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 2,
          }}
          onWheel={(e) => {
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
            // newViewSize[1] = Math.max(
            //   zoomMinClamp,
            //   Math.min(newViewSize[1], zoomMaxClamp)
            // );
            newViewSize[1] = (newViewSize[0] / viewRes[0]) * viewRes[1];
            setViewSize(newViewSize);

            const worldPosAfterZoom = getMouseWorldPosition(
              e.nativeEvent,
              newViewSize
            );

            // Calculate the world space difference and scale it by the new zoom to get the screen space pan adjustment
            const dx = worldPosAfterZoom.x - worldPosBeforeZoom.x;
            const dy = worldPosAfterZoom.y - worldPosBeforeZoom.y;

            // Apply the adjustment to the pan
            setViewTL([viewTL[0] - dx, viewTL[1] - dy]);
          }}
          onMouseMove={(e) => {
            const uvMove = scaleCanvasPositionToCanvasUV(
              e.movementX,
              e.movementY
            );

            const worldMove = scaleCanvasUVToWorldPosition(uvMove.u, uvMove.v);
            if (isPanning) {
              // We need to scale the movement by the canvas's CSS vs internal resolution
              // to ensure 1:1 panning at any display size.
              if (!uiCanvasRef.current || !webgpuCanvasRef.current) {
                return;
              }

              setViewTL((prevViewTL) => [
                prevViewTL[0] - worldMove.x,
                prevViewTL[1] - worldMove.y,
              ]);
            }
            if (isSelecting) {
              const newSelectionEnd = getMouseWorldPosition(e.nativeEvent);
              setSelectionEnd([newSelectionEnd.x, newSelectionEnd.y]);
            }
            if (isDragging) {
              if (
                selectedSegment &&
                selectedSegment.start &&
                selectedSegment.end
              ) {
                // console.log("Dragging segment");
                // console.log(worldMove);
                const newStart = {
                  x: selectedSegment.start.x + worldMove.x,
                  y: selectedSegment.start.y + worldMove.y,
                };
                const newEnd = {
                  x: selectedSegment.end.x + worldMove.x,
                  y: selectedSegment.end.y + worldMove.y,
                };
                selectedSegment.start = newStart;
                selectedSegment.end = newEnd;
                // console.log(selectedSegment);
                setReactDummyVariable2D((prev) => prev + 1);
              }
              if (selectedPad && selectedPad[1] && selectedPad[1].position) {
                console.log("Dragging pad");
                selectedPad[1].position.x += worldMove.x;
                selectedPad[1].position.y += worldMove.y;
                setReactDummyVariable2D((prev) => prev + 1);
              }
            }
          }}
          onMouseDown={(e) => {
            // Middle mouse button for panning
            if (e.button === 1) {
              if (!uiCanvasRef.current) {
                return;
              }
              setIsPanning(true);
              uiCanvasRef.current.style.cursor = "grabbing";
              e.preventDefault();
            } else if (e.button === 0) {
              if (!uiCanvasRef.current) {
                return;
              }

              const worldPos = getMouseWorldPosition(e.nativeEvent);

              const possiblePads = getPadsAtPosition(worldPos);
              const possibleSegments = getSegmentsAtPosition(worldPos);

              if (
                selectedSegment &&
                possibleSegments.some((segment) => segment === selectedSegment)
              ) {
                setIsDragging(true);
              } else if (
                selectedPad &&
                possiblePads.some((pad) => pad[0] === selectedPad[0])
              ) {
                setIsDragging(true);
              } else {
                setMouseDownSelectedPad(getPadsAtPosition(worldPos)[0] ?? null);
                setMouseDownSelectedSegment(
                  getSegmentsAtPosition(worldPos)[0] ?? null
                );

                setIsSelecting(true);
                const newSelectionStart: [number, number] = [
                  worldPos.x,
                  worldPos.y,
                ];
                const newSelectionEnd: [number, number] = [
                  ...newSelectionStart,
                ];

                setSelectionStart(newSelectionStart);
                setSelectionEnd(newSelectionEnd);
              }
            }
          }}
          onMouseUp={(e) => {
            if (e.button === 1) {
              if (!uiCanvasRef.current) {
                return;
              }
              setIsPanning(false);
              uiCanvasRef.current.style.cursor = "default";
            } else if (e.button === 0) {
              if (!uiCanvasRef.current) {
                return;
              }
              if (isSelecting) {
                setIsSelecting(false);
                if (selectionStart && selectionEnd) {
                  const minX = Math.min(selectionStart[0], selectionEnd[0]);
                  const maxX = Math.max(selectionStart[0], selectionEnd[0]);
                  const minY = Math.min(selectionStart[1], selectionEnd[1]);
                  const maxY = Math.max(selectionStart[1], selectionEnd[1]);
                  const width = maxX - minX;
                  const height = maxY - minY;
                  console.log("Selected area:", minX, minY, width, width);
                  const canvasUVArea = scaleWorldPositionToCanvasUV(
                    width,
                    height
                  );
                  if (canvasUVArea.u < 0.01 || canvasUVArea.v < 0.01) {
                    if (mouseDownSelectedPad || mouseDownSelectedSegment) {
                      setSelectedPad(mouseDownSelectedPad);
                      setSelectedSegment(mouseDownSelectedSegment);
                    } else {
                      setSimTL(boardTL);
                      setSimSize(boardSize);
                    }
                  } else {
                    setSimTL([minX, minY]);
                    setSimSize([width, height]);
                  }

                  setSelectionStart(null);
                  setSelectionEnd(null);
                }
              }
              if (isDragging) {
                setIsDragging(false);
                setReactDummyVariableRender((prev) => prev + 1);
              }
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditorMode("select");
            }
          }}
        />
      </div>
    </>
  );
}
