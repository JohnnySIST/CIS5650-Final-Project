import './style.css';
import wosCompute from './shaders/wosCompute.wgsl/?raw';
import wosRender from './shaders/wosRender.wgsl?raw';
import { assert } from './utils/util';

(async () => {
  
  if (navigator.gpu === undefined) {
    const h = document.querySelector('#title') as HTMLElement;
    h.innerText = 'WebGPU is not supported in this browser.';
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (adapter === null) {
    const h = document.querySelector('#title') as HTMLElement;
    h.innerText = 'No adapter is available for WebGPU.';
    return;
  }
  
  const device = await adapter.requestDevice({
    requiredLimits: { 
      maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxStorageBuffersPerShaderStage: 10
     },
  });

  const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
  assert(canvas !== null);
  
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: format,
  });

  // HELLO TRIANGLE BUFFERS / PIPELINE
//   const vertexData = new Float32Array([
//     0, 0.5,
//     -0.5, -0.5,
//     0.5, -0.5 
//   ]);
//   const vertexBuffer = device.createBuffer({
//     size: vertexData.byteLength,
//     usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
//   });
//   device.queue.writeBuffer(vertexBuffer, 0, vertexData);

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

  // COMPUTE SHADER SETUP
  const resultTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | 
            GPUTextureUsage.TEXTURE_BINDING 
  });

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const wgSize = 8;
  const dispatchX = Math.ceil(canvas.width / wgSize);
  const dispatchY = Math.ceil(canvas.height / wgSize);
  const wos_pipeline = device.createComputePipeline({
    label: 'wos compute',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: wosCompute }),
      entryPoint: 'main',
    },
  });

  const wosBindGroup = device.createBindGroup({
    label: 'wos texture bg',
    layout: wos_pipeline.getBindGroupLayout(0),
    entries: [{binding: 0, resource: resultTexture.createView() }]
  });

  // BIND GROUP FOR RENDERING TEXTURE IN FRAG
  const renderBindGroup = device.createBindGroup({
    label: 'wos result texture bg',
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [ { binding: 0, resource: resultTexture.createView() },
               { binding: 1, resource: sampler }]
  });
  

  // THIS RENDERS STUFF :)
   function frame() {
    const commandEncoder = device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(wos_pipeline);
    computePass.setBindGroup(0, wosBindGroup);
    computePass.dispatchWorkgroups(dispatchX, dispatchY);
    computePass.end();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: [0.0, 0.0, 0.0, 1.0],
        storeOp: 'store',
      }]
    });
    
    passEncoder.setPipeline(renderPipeline);
    //passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setBindGroup(0, renderBindGroup);
    passEncoder.draw(3);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

})();