import React, { useRef, useEffect, useState } from "react";
import { PCBEditor } from "./main";
import { assert } from "./utils/util";

import {
  Circle as RenderCircle,
  Renderer,
  Segment as RenderSegment,
} from "./renderers/renderer";
import "./style.css";

import { parseKicadPcb, KicadPcb, FootprintPad, Segment } from "kicadts";

interface WosCanvasProps {
  fpsCallback?: (fps: number) => void;
}

type Vec2 = { x: number; y: number };
type EditorMode = "select";
interface EditorState {
  mode: EditorMode;
  isPanning: boolean;
}

export default function WosCanvas({ fpsCallback }: WosCanvasProps) {
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

  const renderer = new Renderer(
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
  );

  const targetPads: FootprintPad[] = [];
  const targetSegments: Segment[] = [];

  const selectedPad: FootprintPad | null = null;
  const selectedSegment: Segment | null = null;
  const targetLayer = "B.Cu";

  let editor: PCBEditor | null = null;

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

      // const camera = new Camera2D();
      // camera.init(canvas, uiCanvas);

      editor = new PCBEditor(canvas, context, device, fpsCallback);
    })();
  }, []);

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
            onChange={(e) => setTraceWidth(Number(e.target.value))}
          />
          <input
            type="number"
            id="trace-width-input"
            min={1}
            max={50}
            value={traceWidth}
            style={{ width: "50px", verticalAlign: "middle" }}
            onChange={(e) => setTraceWidth(Number(e.target.value))}
          />
        </div>
        <button id="import-kicad-btn">Import KiCad PCB</button>
        <input
          type="file"
          id="kicad-file-input"
          accept=".kicad_pcb"
          style={{ display: "none" }}
        />

        <button id="export-kicad-btn">Export to KiCad</button>
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
          id="webgpu-canvas"
          ref={webgpuCanvasRef}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}
        />
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
      </div>
    </>
  );
}
