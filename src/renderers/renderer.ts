import uvPreCompute from "/src/shaders/uvPreprocessCompute.wgsl?raw";
import wosCompute from "/src/shaders/wosCompute.wgsl?raw";
import wosRender from "/src/shaders/wosRender.wgsl?raw";

export interface Circle {
  center: [number, number];
  radius: number;
  boundary_value: number;
}

const example_circles: Circle[] = [
  // Large circles
  { center: [0.0, 0.0], radius: 0.15, boundary_value: 1.0 },
  { center: [-0.6, 0.4], radius: 0.15, boundary_value: 0.5 },
  { center: [0.6, -0.4], radius: 0.18, boundary_value: 0.8 },

  // Medium circles
  { center: [-0.7, -0.7], radius: 0.06, boundary_value: 0.3 },
  { center: [0.7, 0.7], radius: 0.07, boundary_value: 0.7 },
  { center: [0.3, 0.3], radius: 0.08, boundary_value: 0.9 },
  { center: [-0.3, -0.5], radius: 0.03, boundary_value: 0.4 },
  { center: [0.44, 0.04], radius: 0.05, boundary_value: 0.6 },

  // Small circles
  { center: [-0.1, 0.64], radius: 0.08, boundary_value: 1.0 },
  { center: [0.82, -0.7], radius: 0.07, boundary_value: 0.2 },
  { center: [-0.44, -0.1], radius: 0.09, boundary_value: 0.5 },
  { center: [0.16, -0.64], radius: 0.06, boundary_value: 0.8 },
  { center: [-0.76, 0.84], radius: 0.085, boundary_value: 0.35 },

  // Tiny circles (details)
  { center: [-0.16, -0.24], radius: 0.04, boundary_value: 0.65 },
  { center: [0.36, 0.76], radius: 0.045, boundary_value: 0.95 },
  { center: [0.64, 0.24], radius: 0.035, boundary_value: 0.45 },
  { center: [-0.5, 0.16], radius: 0.05, boundary_value: 0.75 },
  { center: [0.1, 0.84], radius: 0.038, boundary_value: 0.25 },
  { center: [0.76, -0.16], radius: 0.042, boundary_value: 0.55 },
  { center: [-0.64, -0.3], radius: 0.048, boundary_value: 0.85 },

  // Additional medium circles (new)
  { center: [-0.85, 0.0], radius: 0.08, boundary_value: 0.42 },
  { center: [0.85, 0.15], radius: 0.09, boundary_value: 0.68 },
  { center: [0.0, -0.75], radius: 0.07, boundary_value: 0.52 },
  { center: [-0.3, 0.85], radius: 0.06, boundary_value: 0.78 },
  { center: [0.5, 0.6], radius: 0.065, boundary_value: 0.33 },

  // Additional small circles (new)
  { center: [-0.9, -0.4], radius: 0.05, boundary_value: 0.61 },
  { center: [0.9, -0.25], radius: 0.048, boundary_value: 0.47 },
  { center: [-0.25, -0.85], radius: 0.052, boundary_value: 0.71 },
  { center: [0.38, -0.85], radius: 0.046, boundary_value: 0.39 },
  { center: [-0.82, 0.55], radius: 0.055, boundary_value: 0.88 },

  // Additional tiny circles (new)
  { center: [0.22, 0.52], radius: 0.035, boundary_value: 0.44 },
  { center: [-0.38, 0.62], radius: 0.032, boundary_value: 0.66 },
  { center: [0.52, -0.12], radius: 0.038, boundary_value: 0.54 },
  { center: [-0.12, 0.36], radius: 0.03, boundary_value: 0.82 },
  { center: [0.18, -0.32], radius: 0.034, boundary_value: 0.37 },
];

export class Renderer {
  private format: GPUTextureFormat;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext;
  private device: GPUDevice;

  private circleGeomBuffer: GPUBuffer;
  private simResBuffer: GPUBuffer;
  private simTLBuffer: GPUBuffer;
  private simSizeBuffer: GPUBuffer;
  private viewResBuffer: GPUBuffer;
  private viewTLBuffer: GPUBuffer;
  private viewSizeBuffer: GPUBuffer;
  private walkCountBuffer: GPUBuffer;
  private wosValuesBuffer: GPUBuffer;
  private uvBuffer: GPUBuffer;

  private uvBindGroup_compute: GPUBindGroup;
  private domainSizeBindGroup_frag: GPUBindGroup;
  private uvBindGroup_frag: GPUBindGroup;
  private domainSizeBindGroup_wos: GPUBindGroup;
  private domainSizeBindGroup_uvPre: GPUBindGroup;
  private uvBindGroup_uvPre: GPUBindGroup;

  private wos_pipeline: GPUComputePipeline;
  private renderPipeline: GPURenderPipeline;
  private uvPre_Pipeline: GPUComputePipeline;

  private totalWalks = 0;

  private simRes: [number, number]; // integers, pixels
  private simTL: [number, number]; // floats, world space
  private simSize: [number, number]; // floats, world space

  private viewRes: [number, number]; // integers, pixels
  private viewTL: [number, number]; // floats, world space
  private viewSize: [number, number]; // floats, world space

  constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    simRes: [number, number] = [canvas.width, canvas.height],
    simTL: [number, number] = [-0.9, -0.9],
    simSize: [number, number] = [1.8, 1.8],
    viewRes: [number, number] = [canvas.width, canvas.height],
    viewTL: [number, number] = [-1, -1],
    viewSize: [number, number] = [2, 2]
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.simRes = simRes;
    this.simTL = simTL;
    this.simSize = simSize;
    this.viewRes = viewRes;
    this.viewTL = viewTL;
    this.viewSize = viewSize;
    this.init();
  }

  private async init() {
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
    });

    this.setCircles();
  }

  async updateParams({
    simRes,
    simTL,
    simSize,
    viewRes,
    viewTL,
    viewSize,
  }: {
    simRes?: [number, number];
    simTL?: [number, number];
    simSize?: [number, number];
    viewRes?: [number, number];
    viewTL?: [number, number];
    viewSize?: [number, number];
  }) {
    const device = this.device;
    const canvas = this.canvas;
    if (simRes) {
      this.simRes = simRes;
      const simResData = new Uint32Array([this.simRes[0], this.simRes[1]]);
      device.queue.writeBuffer(this.simResBuffer, 0, simResData);
    }
    if (simTL) {
      this.simTL = simTL;
      const simTLData = new Float32Array([this.simTL[0], this.simTL[1]]);
      device.queue.writeBuffer(this.simTLBuffer, 0, simTLData);
    }
    if (simSize) {
      this.simSize = simSize;
      const simSizeData = new Float32Array([this.simSize[0], this.simSize[1]]);
      device.queue.writeBuffer(this.simSizeBuffer, 0, simSizeData);
    }
    if (viewRes) {
      this.viewRes = viewRes;
      const viewResData = new Uint32Array([this.viewRes[0], this.viewRes[1]]);
      device.queue.writeBuffer(this.viewResBuffer, 0, viewResData);
    }
    if (viewTL) {
      this.viewTL = viewTL;
      const viewTLData = new Float32Array([this.viewTL[0], this.viewTL[1]]);
      device.queue.writeBuffer(this.viewTLBuffer, 0, viewTLData);
    }
    if (viewSize) {
      this.viewSize = viewSize;
      const viewSizeData = new Float32Array([
        this.viewSize[0],
        this.viewSize[1],
      ]);
      device.queue.writeBuffer(this.viewSizeBuffer, 0, viewSizeData);
    }
  }

  async setCircles(circles: Circle[] = example_circles) {
    const canvas = this.canvas;
    const context = this.context;
    const device = this.device;
    const circleData = new Float32Array(circles.length * 4);
    for (let i = 0; i < circles.length; i++) {
      const offset = i * 4;
      circleData[offset + 0] = circles[i].center[0]; // center.x
      circleData[offset + 1] = circles[i].center[1]; // center.y
      circleData[offset + 2] = circles[i].radius;
      circleData[offset + 3] = circles[i].boundary_value;
    }

    this.circleGeomBuffer = device.createBuffer({
      label: "circle geo buffer",
      size: circles.length * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.circleGeomBuffer, 0, circleData);

    // =============================
    //    UV PREPROCESS SETUP
    // =============================

    this.uvPre_Pipeline = device.createComputePipeline({
      label: "uv preprocess compute",
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: uvPreCompute }),
        entryPoint: "main",
      },
    });

    // THIS IS THE SCREEN DIMS USED FOR PATHING
    this.simResBuffer = device.createBuffer({
      label: "Sim Res Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simResData = new Uint32Array(this.simRes);

    device.queue.writeBuffer(this.simResBuffer, 0, simResData);

    this.simTLBuffer = device.createBuffer({
      label: "Sim TL Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simTLData = new Float32Array(this.simTL);

    device.queue.writeBuffer(this.simTLBuffer, 0, simTLData);

    this.simSizeBuffer = device.createBuffer({
      label: "Sim Size Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simSizeData = new Float32Array(this.simSize);

    device.queue.writeBuffer(this.simSizeBuffer, 0, simSizeData);

    // BIND GEOMETRY DATA

    this.domainSizeBindGroup_uvPre = device.createBindGroup({
      label: "domain size uvPre bg",
      layout: this.uvPre_Pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.circleGeomBuffer } },
      ],
    });

    // THIS STORES UVs ON SCREEN FOR QUEERY POINTS
    this.uvBuffer = device.createBuffer({
      label: "uv buffer",
      size: this.simRes[0] * this.simRes[1] * 8,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    this.uvBindGroup_uvPre = device.createBindGroup({
      label: "uv bg compute",
      layout: this.uvPre_Pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.uvBuffer } }],
    });

    // ===============================
    //    WOS COMPUTE SHADER SETUP
    // ===============================

    this.wos_pipeline = device.createComputePipeline({
      label: "wos compute",
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: wosCompute }),
        entryPoint: "main",
      },
    });

    this.walkCountBuffer = device.createBuffer({
      label: "Walk Count Buffer",
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.domainSizeBindGroup_wos = device.createBindGroup({
      label: "domain size wos bg",
      layout: this.wos_pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.walkCountBuffer } },
        { binding: 4, resource: { buffer: this.circleGeomBuffer } },
      ],
    });

    this.wosValuesBuffer = device.createBuffer({
      label: "wos values buffer",
      size: canvas.width * canvas.height * 4,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    this.uvBindGroup_compute = device.createBindGroup({
      label: "uv bg compute",
      layout: this.wos_pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.uvBuffer } },
        { binding: 1, resource: { buffer: this.wosValuesBuffer } },
      ],
    });

    // ======================================
    //    OUTPUT VERT / FRAG FOR RENDERING
    // ======================================

    this.renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          label: "wos render vert",
          code: wosRender,
        }),
        entryPoint: "vertMain",
      },
      fragment: {
        module: device.createShaderModule({
          label: "wos render frag",
          code: wosRender,
        }),
        entryPoint: "fragMain",
        targets: [{ format: this.format }],
      },
    });

    this.viewResBuffer = device.createBuffer({
      label: "View Res Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewResData = new Uint32Array(this.viewRes);

    device.queue.writeBuffer(this.viewResBuffer, 0, viewResData);

    this.viewTLBuffer = device.createBuffer({
      label: "View TL Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewTLData = new Float32Array(this.viewTL);

    device.queue.writeBuffer(this.viewTLBuffer, 0, viewTLData);

    this.viewSizeBuffer = device.createBuffer({
      label: "View Size Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewSizeData = new Float32Array(this.viewSize);

    device.queue.writeBuffer(this.viewSizeBuffer, 0, viewSizeData);

    this.domainSizeBindGroup_frag = device.createBindGroup({
      label: "domain size frag bg",
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.viewResBuffer } },
        { binding: 4, resource: { buffer: this.viewTLBuffer } },
        { binding: 5, resource: { buffer: this.viewSizeBuffer } },
        { binding: 6, resource: { buffer: this.walkCountBuffer } },
      ],
    });

    this.uvBindGroup_frag = device.createBindGroup({
      label: "uv bg frag",
      layout: this.renderPipeline.getBindGroupLayout(1),
      entries: [
        // { binding: 0, resource: { buffer: this.uvBuffer } },
        { binding: 0, resource: { buffer: this.wosValuesBuffer } },
      ],
    });

    // ===============================
    //    THIS RENDERS STUFF :)
    // ===============================

    requestAnimationFrame(() => this.frame());
  }

  private frame() {
    const canvas = this.canvas;
    const context = this.context;
    const device = this.device;

    const commandEncoder = device.createCommandEncoder();

    const uvPreComputePass = commandEncoder.beginComputePass();
    uvPreComputePass.setPipeline(this.uvPre_Pipeline);
    uvPreComputePass.setBindGroup(0, this.domainSizeBindGroup_uvPre);
    uvPreComputePass.setBindGroup(1, this.uvBindGroup_uvPre);
    const wgSize_Pre = 8;
    const dispatchX_Pre = Math.ceil(this.simRes[0] / wgSize_Pre);
    const dispatchY_Pre = Math.ceil(this.simRes[1] / wgSize_Pre);
    uvPreComputePass.dispatchWorkgroups(dispatchX_Pre, dispatchY_Pre);
    uvPreComputePass.end();

    this.totalWalks += 4; // IF YOU UPDATE THIS, UPDATE NUMBER IN wosCompute AND wosRender

    device.queue.writeBuffer(
      this.walkCountBuffer,
      0,
      new Uint32Array([this.totalWalks])
    );

    const wosComputePass = commandEncoder.beginComputePass();
    wosComputePass.setPipeline(this.wos_pipeline);
    wosComputePass.setBindGroup(0, this.domainSizeBindGroup_wos);
    wosComputePass.setBindGroup(1, this.uvBindGroup_compute);
    const wgSize = 8;
    const dispatchX_wos = Math.ceil(this.simRes[0] / wgSize);
    const dispatchY_wos = Math.ceil(this.simRes[1] / wgSize);
    wosComputePass.dispatchWorkgroups(dispatchX_wos, dispatchY_wos);
    wosComputePass.end();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: [0.0, 0.0, 0.0, 1.0],
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(this.renderPipeline);
    passEncoder.setBindGroup(0, this.domainSizeBindGroup_frag);
    passEncoder.setBindGroup(1, this.uvBindGroup_frag);
    passEncoder.draw(3);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(() => this.frame());
  }
}
