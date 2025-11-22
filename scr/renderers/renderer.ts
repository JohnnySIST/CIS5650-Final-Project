import uvPreCompute from '../shaders/uvPreprocessCompute.wgsl?raw';
import wosCompute from '../shaders/wosCompute.wgsl?raw';
import wosRender from '../shaders/wosRender.wgsl?raw';

export interface Renderer {
  frame: (encoder: GPUCommandEncoder, texture_view: GPUTextureView) => void,
}

export default async function init(
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  device: GPUDevice
) {

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: format,
  });

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
  
  const domainSizeBindGroup_uvPre = device.createBindGroup({
    label: 'domain size uvPre bg',
    layout: uvPre_Pipeline.getBindGroupLayout(0),
    entries: [{binding: 0, resource: {buffer: domainSizeBuffer}}]
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
    entries: [{binding: 0, resource: {buffer: domainSizeBuffer}},
              {binding: 1, resource: {buffer: walkCountBuffer}}]
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

    totalWalks += 4;
    device.queue.writeBuffer(
        walkCountBuffer, 
        0, 
        new Uint32Array([totalWalks])
    );
    
    const wosComputePass = commandEncoder.beginComputePass();
    wosComputePass.setPipeline(wos_pipeline);
    wosComputePass.setBindGroup(0, domainSizeBindGroup_wos);
    wosComputePass.setBindGroup(1, uvBindGroup_compute);
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