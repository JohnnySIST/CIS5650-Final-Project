import "./style.css";
import { assert } from "./utils/util";

// =============================================================================
// Shaders
// =============================================================================
const pcbShader = `
struct Uniforms {
  projectionMatrix: mat3x3<f32>,
};
@binding(0) @group(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vertMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let pos3 = uniforms.projectionMatrix * vec3(input.position, 1.0);
    output.position = vec4(pos3.xy, 0.0, 1.0);
    output.color = input.color;
    return output;
}

@fragment
fn fragMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
`;

// =============================================================================
// Data Structures
// =============================================================================
type Vec2 = { x: number; y: number };

interface Pad {
  position: Vec2; // Relative to the footprint's origin
  shape: "rect" | "circle";
  size: { width: number; height: number };
}

interface Footprint {
  name: string;
  pads: Pad[];
}

interface PlacedComponent {
  id: number;
  footprint: Footprint;
  position: Vec2;
  rotation: number; // In radians
}

interface Trace {
  id: number;
  points: Vec2[];
  width: number;
}

class PCBDesign {
  public components: PlacedComponent[] = [];
  public traces: Trace[] = [];
  public footprintLibrary: Map<string, Footprint> = new Map();
  private nextId = 0;

  constructor() {
    this.footprintLibrary.set("DIP-8", {
      name: "DIP-8",
      pads: Array.from({ length: 8 }, (_, i) => ({
        position: {
          x: (i < 4 ? -1 : 1) * 6,
          y: (i < 4 ? 1 : -1) * (12 - (i % 4) * 8),
        },
        shape: "rect",
        size: { width: 4, height: 4 },
      })),
    });
  }

  addComponent(footprintName: string, position: Vec2): PlacedComponent | null {
    const footprint = this.footprintLibrary.get(footprintName);
    if (!footprint) return null;
    const newComponent: PlacedComponent = {
      id: this.nextId++,
      footprint,
      position,
      rotation: 0,
    };
    this.components.push(newComponent);
    return newComponent;
  }

  addTrace(points: Vec2[], width: number): Trace {
    const newTrace: Trace = { id: this.nextId++, points, width };
    this.traces.push(newTrace);
    return newTrace;
  }
}

// =============================================================================
// Editor State and Control
// =============================================================================
type EditorMode = "select" | "place-component" | "draw-trace";

class EditorState {
  public mode: EditorMode = "select";
  public selectedFootprint: Footprint | null = null;
  public activeTracePoints: Vec2[] = [];
  public pcbDesign: PCBDesign = new PCBDesign();
  public mousePos: Vec2 = { x: 0, y: 0 };
  public pan: Vec2 = { x: 0, y: 0 };
  public zoom: number = 1.0;
  public isPanning: boolean = false;
  public traceWidth: number = 5;
}

class PCBEditor {
  private canvas: HTMLCanvasElement;
  private state: EditorState = new EditorState();
  private renderer: Renderer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.init();
  }

  private async init() {
    this.renderer = await Renderer.create(this.canvas);
    if (!this.renderer) {
      const h = document.querySelector("#title") as HTMLElement;
      h.innerText = "Could not initialize WebGPU renderer.";
      return;
    }
    this.setupEventListeners();
    this.render();
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
        this.render();
      }

      this.state.mousePos = this.getMouseWorldPosition(e);

      if (
        this.state.mode === "place-component" ||
        this.state.mode === "draw-trace"
      ) {
        this.render();
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

      this.render();
    });

    this.canvas.addEventListener("click", (e) => {
      const clickPos = this.getMouseWorldPosition(e);
      switch (this.state.mode) {
        case "place-component":
          if (this.state.selectedFootprint) {
            this.state.pcbDesign.addComponent(
              this.state.selectedFootprint.name,
              clickPos
            );
            this.state.mode = "select";
          }
          break;
        case "draw-trace":
          this.state.activeTracePoints.push(clickPos);
          break;
      }
      this.render();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (
          this.state.mode === "draw-trace" &&
          this.state.activeTracePoints.length > 1
        ) {
          this.state.pcbDesign.addTrace(
            this.state.activeTracePoints,
            this.state.traceWidth
          );
        }
        this.state.mode = "select";
        this.state.activeTracePoints = [];
        this.render();
      }
    });

    document.getElementById("place-dip8-btn")?.addEventListener("click", () => {
      this.state.mode = "place-component";
      this.state.selectedFootprint =
        this.state.pcbDesign.footprintLibrary.get("DIP-8")!;
    });

    document.getElementById("draw-trace-btn")?.addEventListener("click", () => {
      this.state.mode = "draw-trace";
      this.state.activeTracePoints = [];
    });

    const traceWidthSlider = document.getElementById(
      "trace-width-slider"
    ) as HTMLInputElement;
    const traceWidthInput = document.getElementById(
      "trace-width-input"
    ) as HTMLInputElement;

    traceWidthSlider.addEventListener("input", () => {
      const width = Number(traceWidthSlider.value);
      this.state.traceWidth = width;
      traceWidthInput.value = width.toString();
      this.render(); // Re-render to show ghost trace with new width
    });

    traceWidthInput.addEventListener("input", () => {
      const width = Number(traceWidthInput.value);
      this.state.traceWidth = width;
      traceWidthSlider.value = width.toString();
      this.render(); // Re-render to show ghost trace with new width
    });

    document.getElementById("export-obj-btn")?.addEventListener("click", () => {
      this.exportToObj();
    });
  }

  private render() {
    if (!this.renderer) return;

    const vertices: number[] = [];
    const PAD_COLOR = [0.8, 0.6, 0.2, 1.0]; // Gold
    const TRACE_COLOR = [0.2, 0.7, 0.2, 1.0]; // Green

    // Generate geometry for placed components
    for (const comp of this.state.pcbDesign.components) {
      for (const pad of comp.footprint.pads) {
        const pos = {
          x: comp.position.x + pad.position.x,
          y: comp.position.y + pad.position.y,
        };
        this.addQuad(vertices, pos, pad.size, PAD_COLOR);
      }
    }

    // Generate geometry for traces
    for (const trace of this.state.pcbDesign.traces) {
      for (let i = 0; i < trace.points.length - 1; i++) {
        this.addTraceSegment(
          vertices,
          trace.points[i],
          trace.points[i + 1],
          trace.width,
          TRACE_COLOR
        );
      }
    }

    // Generate "ghost" geometry for current mode
    if (this.state.mode === "place-component" && this.state.selectedFootprint) {
      for (const pad of this.state.selectedFootprint.pads) {
        const pos = {
          x: this.state.mousePos.x + pad.position.x,
          y: this.state.mousePos.y + pad.position.y,
        };
        this.addQuad(vertices, pos, pad.size, [...PAD_COLOR.slice(0, 3), 0.5]);
      }
    }

    if (this.state.mode === "draw-trace") {
      const points = [...this.state.activeTracePoints, this.state.mousePos];
      for (let i = 0; i < points.length - 1; i++) {
        this.addTraceSegment(
          vertices,
          points[i],
          points[i + 1],
          this.state.traceWidth,
          [...TRACE_COLOR.slice(0, 3), 0.5]
        );
      }
    }

    this.renderer.render(
      new Float32Array(vertices),
      this.state.pan,
      this.state.zoom
    );
  }

  private exportToObj() {
    const pcb = this.state.pcbDesign;
    const copperThickness = 1.0; // A small thickness for the OBJ model

    let objVertices: string[] = [];
    let objFaces: string[] = [];
    let vertexOffset = 1; // OBJ files are 1-indexed

    const pushCuboid = (vo: number) => {
      objFaces.push(`f ${vo + 0} ${vo + 1} ${vo + 2} ${vo + 3}`); // Bottom
      objFaces.push(`f ${vo + 4} ${vo + 5} ${vo + 6} ${vo + 7}`); // Top
      objFaces.push(`f ${vo + 0} ${vo + 1} ${vo + 4} ${vo + 5}`); // bo ttom Side
      objFaces.push(`f ${vo + 0} ${vo + 4} ${vo + 7} ${vo + 3}`); // left side
      objFaces.push(`f ${vo + 2} ${vo + 3} ${vo + 7} ${vo + 6}`); // top side
      objFaces.push(`f ${vo + 1} ${vo + 2} ${vo + 6} ${vo + 5}`); // right side
    };

    // Export Components (Pads)
    for (const comp of pcb.components) {
      for (const pad of comp.footprint.pads) {
        const pos = {
          x: comp.position.x + pad.position.x,
          y: comp.position.y + pad.position.y,
        };
        const size = pad.size;
        const w2 = size.width / 2;
        const h2 = size.height / 2;

        // Define the 8 vertices of the cuboid for the pad
        const padVerts = [
          { x: pos.x - w2, y: pos.y - h2, z: 0 }, // 0: bottom-left
          { x: pos.x + w2, y: pos.y - h2, z: 0 }, // 1: bottom-right
          { x: pos.x + w2, y: pos.y + h2, z: 0 }, // 2: bottom-top-right
          { x: pos.x - w2, y: pos.y + h2, z: 0 }, // 3: bottom-top-left
          { x: pos.x - w2, y: pos.y - h2, z: copperThickness }, // 4: top-left
          { x: pos.x + w2, y: pos.y - h2, z: copperThickness }, // 5: top-right
          { x: pos.x + w2, y: pos.y + h2, z: copperThickness }, // 6: top-top-right
          { x: pos.x - w2, y: pos.y + h2, z: copperThickness }, // 7: top-top-left
        ];

        padVerts.forEach((v) => objVertices.push(`v ${v.x} ${v.y} ${v.z}`));

        pushCuboid(vertexOffset);
        vertexOffset += 8;
      }
    }

    // Export Traces
    for (const trace of pcb.traces) {
      for (let i = 0; i < trace.points.length - 1; i++) {
        const p1 = trace.points[i];
        const p2 = trace.points[i + 1];
        const w2 = trace.width / 2;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;

        const nx = -dy / len;
        const ny = dx / len;

        // Define the 8 vertices of the cuboid for the trace segment
        const segVerts = [
          { x: p1.x + nx * w2, y: p1.y + ny * w2, z: 0 }, // 0
          { x: p1.x - nx * w2, y: p1.y - ny * w2, z: 0 }, // 1
          { x: p2.x - nx * w2, y: p2.y - ny * w2, z: 0 }, // 2
          { x: p2.x + nx * w2, y: p2.y + ny * w2, z: 0 }, // 3
          { x: p1.x + nx * w2, y: p1.y + ny * w2, z: copperThickness }, // 4
          { x: p1.x - nx * w2, y: p1.y - ny * w2, z: copperThickness }, // 5
          { x: p2.x - nx * w2, y: p2.y - ny * w2, z: copperThickness }, // 6
          { x: p2.x + nx * w2, y: p2.y + ny * w2, z: copperThickness }, // 7
        ];

        segVerts.forEach((v) => objVertices.push(`v ${v.x} ${v.y} ${v.z}`));

        pushCuboid(vertexOffset);
        vertexOffset += 8;
      }
    }

    const objContent = [
      "# PCB Export from WebGPU Editor",
      ...objVertices,
      ...objFaces,
    ].join("\n");

    this.downloadFile(objContent, "pcb.obj", "text/plain");
  }

  private downloadFile(content: string, fileName: string, contentType: string) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private addQuad(
    vertices: number[],
    pos: Vec2,
    size: { width: number; height: number },
    color: number[]
  ) {
    const w2 = size.width / 2;
    const h2 = size.height / 2;
    const p1 = [pos.x - w2, pos.y - h2];
    const p2 = [pos.x + w2, pos.y - h2];
    const p3 = [pos.x + w2, pos.y + h2];
    const p4 = [pos.x - w2, pos.y + h2];

    vertices.push(
      ...p1,
      ...color,
      ...p2,
      ...color,
      ...p4,
      ...color,
      ...p2,
      ...color,
      ...p3,
      ...color,
      ...p4,
      ...color
    );
  }

  private addTraceSegment(
    vertices: number[],
    p1: Vec2,
    p2: Vec2,
    width: number,
    color: number[]
  ) {
    const w2 = width / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;

    const nx = -dy / len; // Perpendicular vector
    const ny = dx / len;

    const v1 = [p1.x + nx * w2, p1.y + ny * w2];
    const v2 = [p1.x - nx * w2, p1.y - ny * w2];
    const v3 = [p2.x + nx * w2, p2.y + ny * w2];
    const v4 = [p2.x - nx * w2, p2.y - ny * w2];

    vertices.push(
      ...v1,
      ...color,
      ...v2,
      ...color,
      ...v3,
      ...color,
      ...v2,
      ...color,
      ...v4,
      ...color,
      ...v3,
      ...color
    );
  }
}

// =============================================================================
// Renderer
// =============================================================================
class Renderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private uniformBindGroup: GPUBindGroup;
  private vertexBufferMaxEntries = 60000; // Max vertices (10k triangles)

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
    uniformBuffer: GPUBuffer,
    uniformBindGroup: GPUBindGroup
  ) {
    this.device = device;
    this.context = context;
    this.pipeline = pipeline;
    this.uniformBuffer = uniformBuffer;
    this.uniformBindGroup = uniformBindGroup;

    this.vertexBuffer = device.createBuffer({
      size: this.vertexBufferMaxEntries * 6 * Float32Array.BYTES_PER_ELEMENT, // pos(2) + color(4)
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  public static async create(
    canvas: HTMLCanvasElement
  ): Promise<Renderer | null> {
    if (navigator.gpu === undefined) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");
    assert(context !== null);
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });

    const shaderModule = device.createShaderModule({ code: pcbShader });

    const pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vertMain",
        buffers: [
          {
            arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT, // 2 pos, 4 color
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
              { shaderLocation: 1, offset: 2 * 4, format: "float32x4" }, // color
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragMain",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    const uniformBuffer = device.createBuffer({
      size: 12 * 4, // mat3x3<f32> but needs padding for std140
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    return new Renderer(
      device,
      context,
      pipeline,
      uniformBuffer,
      uniformBindGroup
    );
  }

  public render(vertices: Float32Array, pan: Vec2, zoom: number) {
    if (vertices.length > this.vertexBufferMaxEntries) {
      console.warn("Too many vertices! Some objects may not be rendered.");
      vertices = vertices.subarray(0, this.vertexBufferMaxEntries);
    }

    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);

    const { width, height } = this.context.canvas;

    // This matrix now combines projection, scaling (zoom), and translation (pan)
    // It transforms world-space coordinates directly to clip-space
    const projectionMatrix = new Float32Array([
      (2 / width) * zoom,
      0,
      0,
      0,
      0,
      (-2 / height) * zoom,
      0,
      0,
      -1 + (pan.x * 2) / width,
      1 - (pan.y * 2) / height,
      1,
      0,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, projectionMatrix);

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setBindGroup(0, this.uniformBindGroup);
    passEncoder.draw(vertices.length / 6); // 6 numbers per vertex (pos2, color4)
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}

// =============================================================================
// Main Execution
// =============================================================================
function main() {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  assert(canvas !== null, "Could not find canvas element");

  canvas.width = 1920;
  canvas.height = 1080;

  new PCBEditor(canvas);
}

main();
