import uvPreCompute from '../shaders/uvPreprocessCompute.wgsl?raw';
import wosCompute from '../shaders/wosCompute.wgsl?raw';
import wosRender from '../shaders/wosRender.wgsl?raw';

export interface Renderer {
  frame: (encoder: GPUCommandEncoder, texture_view: GPUTextureView) => void,
  updateCameraBuffer: (data: number[]) => void,
  getCanvasSize?: () => { width: number, height: number }
  setFpsCallback: (fpsCallback: (fps: number) => void) => void
}

export default async function init(
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  device: GPUDevice,
  camera: {
    getTransform: () => number[],
    getInverseTransform: () => number[],
    setRenderer?: (renderer: any) => void,
    getSelectionBounds: () => number[]
  }
) {
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: format,
  });

  // BASIC GEOMETRY BUFFER (JUST CIRCLES FOR NOW)
    const circles = [
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

    // const circles = [
    //     // Center large circle
    //     { center: [0.0, 0.0], radius: 0.18, boundary_value: 1.0 },
        
    //     // First ring - 6 circles around center
    //     { center: [0.55, 0.0], radius: 0.11, boundary_value: 0.9 },
    //     { center: [-0.55, 0.0], radius: 0.11, boundary_value: 0.9 },
    //     { center: [0.275, 0.476], radius: 0.11, boundary_value: 0.9 },
    //     { center: [-0.275, 0.476], radius: 0.11, boundary_value: 0.9 },
    //     { center: [0.275, -0.476], radius: 0.11, boundary_value: 0.9 },
    //     { center: [-0.275, -0.476], radius: 0.11, boundary_value: 0.9 },
        
    //     // Second ring - 12 circles in gaps
    //     { center: [0.74, 0.0], radius: 0.08, boundary_value: 0.7 },
    //     { center: [-0.74, 0.0], radius: 0.08, boundary_value: 0.7 },
    //     { center: [0.37, 0.64], radius: 0.08, boundary_value: 0.7 },
    //     { center: [-0.37, 0.64], radius: 0.08, boundary_value: 0.7 },
    //     { center: [0.37, -0.64], radius: 0.08, boundary_value: 0.7 },
    //     { center: [-0.37, -0.64], radius: 0.08, boundary_value: 0.7 },
    //     { center: [0.63, 0.36], radius: 0.08, boundary_value: 0.7 },
    //     { center: [-0.63, 0.36], radius: 0.08, boundary_value: 0.7 },
    //     { center: [0.63, -0.36], radius: 0.08, boundary_value: 0.7 },
    //     { center: [-0.63, -0.36], radius: 0.08, boundary_value: 0.7 },
    //     { center: [0.0, 0.73], radius: 0.08, boundary_value: 0.7 },
    //     { center: [0.0, -0.73], radius: 0.08, boundary_value: 0.7 },
        
    //     // Third ring - 18 smaller circles
    //     { center: [0.85, 0.0], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.85, 0.0], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.425, 0.736], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.425, 0.736], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.425, -0.736], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.425, -0.736], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.76, 0.22], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.76, 0.22], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.76, -0.22], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.76, -0.22], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.54, 0.54], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.54, 0.54], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.54, -0.54], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.54, -0.54], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.22, 0.76], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.22, 0.76], radius: 0.045, boundary_value: 0.5 },
    //     { center: [0.22, -0.76], radius: 0.045, boundary_value: 0.5 },
    //     { center: [-0.22, -0.76], radius: 0.045, boundary_value: 0.5 },
        
    //     // Fourth ring - 24 tiny circles at corners
    //     { center: [0.88, 0.12], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.88, 0.12], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.88, -0.12], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.88, -0.12], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.68, 0.48], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.68, 0.48], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.68, -0.48], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.68, -0.48], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.48, 0.68], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.48, 0.68], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.48, -0.68], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.48, -0.68], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.12, 0.88], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.12, 0.88], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.12, -0.88], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.12, -0.88], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.65, 0.18], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.65, 0.18], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.65, -0.18], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.65, -0.18], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.18, 0.65], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.18, 0.65], radius: 0.025, boundary_value: 0.3 },
    //     { center: [0.18, -0.65], radius: 0.025, boundary_value: 0.3 },
    //     { center: [-0.18, -0.65], radius: 0.025, boundary_value: 0.3 },
    // ];

  const circleData = new Float32Array(circles.length * 4); 
  for (let i = 0; i < circles.length; i++) {
    const offset = i * 4;
    circleData[offset + 0] = circles[i].center[0];  // center.x
    circleData[offset + 1] = circles[i].center[1];  // center.y
    circleData[offset + 2] = circles[i].radius;
    circleData[offset + 3] = circles[i].boundary_value;
  }

  const circleGeomBuffer = device.createBuffer({
    label: 'circle geo buffer',
    size: circles.length * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  })

  device.queue.writeBuffer(circleGeomBuffer, 0, circleData);

  // =============================
  //    CAMERA BUFFER SETUP
  // =============================

  if (typeof camera.setRenderer === 'function') {
    camera.setRenderer({
      updateCameraBuffer: () => {
        device.queue.writeBuffer(cameraMatrixBuffer, 0, new Float32Array(camera.getInverseTransform()));
        device.queue.writeBuffer(wosValuesBuffer, 0, new Float32Array(canvas.width * canvas.height));
        device.queue.writeBuffer(selectionBuffer, 0, new Float32Array(camera.getSelectionBounds()));
        totalWalks = 0;
      },
      getCanvasSize: () => ({ width: canvas.width, height: canvas.height })
    });
  }

  // Camera matrix buffer
  const cameraMatrixBuffer = device.createBuffer({
    label: 'camera matrix buffer',
    size: 64, // 16 * 4 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cameraMatrixBuffer, 0, new Float32Array(camera.getInverseTransform()));

  // Camera selection buffer
  const selectionBuffer = device.createBuffer({
    label: 'camera selection buffer',
    size: 16, // 4 * 4 bytes (minX, minY, maxX, maxY)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(selectionBuffer, 0, new Float32Array(camera.getSelectionBounds()));

  // =============================
  //    UV PREPROCESS SETUP
  // =============================

  const wgSize_Pre = 8;
  const dispatchX_Pre = Math.ceil(canvas.width / wgSize_Pre);
  const dispatchY_Pre = Math.ceil(canvas.height / wgSize_Pre);
  const uvPre_Pipeline = device.createComputePipeline({
    label: 'uv preprocess compute',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: uvPreCompute }),
      entryPoint: 'main',
    },
  });

  // THIS IS THE SCREEN DIMS USED FOR PATHING
  const domainSizeBuffer = device.createBuffer({
    label: "Domain Size Buffer",
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const domainDimData = new Uint32Array([
    canvas.width,
    canvas.height
  ]);

  device.queue.writeBuffer(domainSizeBuffer, 0, domainDimData);

  // BIND GEOMETRY DATA
  
  const domainSizeBindGroup_uvPre = device.createBindGroup({
    label: 'domain size uvPre bg',
    layout: uvPre_Pipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: domainSizeBuffer}},
      {binding: 1, resource: {buffer: circleGeomBuffer}},
      {binding: 2, resource: {buffer: cameraMatrixBuffer}}
    ]
  });

  // THIS STORES UVs ON SCREEN FOR QUEERY POINTS
  const uvBuffer = device.createBuffer({
    label: 'uv buffer',
    size: canvas.width * canvas.height * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  const uvBindGroup_uvPre = device.createBindGroup({
    label: 'uv bg compute',
    layout: uvPre_Pipeline.getBindGroupLayout(1),
    entries: [{binding: 0, resource: {buffer: uvBuffer}}]
  });

  // ===============================
  //    WOS COMPUTE SHADER SETUP
  // ===============================

  const wgSize = 8;
  const dispatchX_wos = Math.ceil(canvas.width / wgSize);
  const dispatchY_wos = Math.ceil(canvas.height / wgSize);
  const wos_pipeline = device.createComputePipeline({
    label: 'wos compute',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: wosCompute }),
      entryPoint: 'main',
    },
  });

  let totalWalks = 0;
  const walkCountBuffer = device.createBuffer({
    label: "Walk Count Buffer",
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const domainSizeBindGroup_wos = device.createBindGroup({
    label: 'domain size wos bg',
    layout: wos_pipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: domainSizeBuffer}},
      {binding: 1, resource: {buffer: walkCountBuffer}},
      {binding: 2, resource: {buffer: circleGeomBuffer}},
    ]
  });

  const wosValuesBuffer = device.createBuffer({
    label: 'wos values buffer',
    size: canvas.width * canvas.height * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  const uvBindGroup_compute = device.createBindGroup({
    label: 'uv bg compute',
    layout: wos_pipeline.getBindGroupLayout(1),
    entries: [{binding: 0, resource: {buffer: uvBuffer}},
              {binding: 1, resource: {buffer: wosValuesBuffer}}]
  });

  const cameraUniformBindGroup_wos = device.createBindGroup({
    label: 'camera uniform bg',
    layout: wos_pipeline.getBindGroupLayout(2),
    entries: [
      {binding: 0, resource: {buffer: cameraMatrixBuffer}},
      {binding: 1, resource: {buffer: selectionBuffer}},
    ]
  });

  // ======================================
  //    OUTPUT VERT / FRAG FOR RENDERING
  // ======================================

  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        label: 'wos render vert',
        code: wosRender,
      }),
      entryPoint: 'vertMain',
    },
    fragment: {
      module: device.createShaderModule({
        label: 'wos render frag',
        code: wosRender,
      }),
      entryPoint: 'fragMain',
      targets: [{ format }],
    },
  }); 

  const domainSizeBindGroup_frag = device.createBindGroup({
    label: 'domain size frag bg',
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [{binding: 0, resource: {buffer: domainSizeBuffer}},
              {binding: 1, resource: {buffer: walkCountBuffer}}]
  });

  const uvBindGroup_frag = device.createBindGroup({
    label: 'uv bg frag',
    layout: renderPipeline.getBindGroupLayout(1),
    entries: [{binding: 0, resource: {buffer: uvBuffer}},
              {binding: 1, resource: {buffer: wosValuesBuffer}}]
  });

  // ===============================
  //    THIS RENDERS STUFF :)
  // ===============================

  let lastFpsTime = performance.now();
  let frameCount = 0;
  let fpsCallback: ((fps: number) => void) | null = null;

  function frame() {
    // FPS Monitoring
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      if (fpsCallback) {
        fpsCallback(frameCount);
      }
      frameCount = 0;
      lastFpsTime = now;
    }

    const commandEncoder = device.createCommandEncoder();

    const uvPreComputePass = commandEncoder.beginComputePass();
    uvPreComputePass.setPipeline(uvPre_Pipeline);
    uvPreComputePass.setBindGroup(0, domainSizeBindGroup_uvPre);
    uvPreComputePass.setBindGroup(1, uvBindGroup_uvPre);
    uvPreComputePass.dispatchWorkgroups(dispatchX_Pre, dispatchY_Pre);
    uvPreComputePass.end();

    totalWalks += 4; // IF YOU UPDATE THIS, UPDATE NUMBER IN wosCompute AND wosRender

    device.queue.writeBuffer(
        walkCountBuffer, 
        0, 
        new Uint32Array([totalWalks])
    );
    
    const wosComputePass = commandEncoder.beginComputePass();
    wosComputePass.setPipeline(wos_pipeline);
    wosComputePass.setBindGroup(0, domainSizeBindGroup_wos);
    wosComputePass.setBindGroup(1, uvBindGroup_compute);
    wosComputePass.setBindGroup(2, cameraUniformBindGroup_wos);
    wosComputePass.dispatchWorkgroups(dispatchX_wos, dispatchY_wos);
    wosComputePass.end();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: [0.0, 0.0, 0.0, 1.0],
        storeOp: 'store',
      }]
    });

    passEncoder.setPipeline(renderPipeline);
    passEncoder.setBindGroup(0, domainSizeBindGroup_frag);
    passEncoder.setBindGroup(1, uvBindGroup_frag);
    passEncoder.draw(3);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return {
    frame,
    updateCameraBuffer: (data: number[]) => {
      device.queue.writeBuffer(cameraMatrixBuffer, 0, new Float32Array(data));
    },
    getCanvasSize: () => ({ width: canvas.width, height: canvas.height }),
    setFpsCallback: (callback: (fps: number) => void) => {
      fpsCallback = callback;
    }
  };
}