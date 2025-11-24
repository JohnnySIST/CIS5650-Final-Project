import uvPreCompute from '../shaders/uvPreprocessCompute.wgsl?raw';
import wosCompute from '../shaders/wosCompute.wgsl?raw';
import wosRender from '../shaders/wosRender.wgsl?raw';

export interface Renderer {
  frame: (encoder: GPUCommandEncoder, texture_view: GPUTextureView) => void,
  updateCameraBuffer: (data: number[]) => void,
  getCanvasSize?: () => { width: number, height: number }
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
    ];

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
  function frame() {
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

}