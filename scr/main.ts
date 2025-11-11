import './style.css'
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
  
  canvas.width = 800;
  canvas.height = 600;
  
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: format,
  });


  const vertexData = new Float32Array([
    0, 0.5,      // top
    -0.5, -0.5,  // bottom-left
    0.5, -0.5    // bottom-right
  ]);

  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  
  device.queue.writeBuffer(vertexBuffer, 0, vertexData);

  const shaderModule = device.createShaderModule({
    code: `
      @vertex
      fn vertMain(@location(0) pos : vec2f) ->
          @builtin(position) vec4f {
          return vec4f(pos, 0, 1);
      }
      
      @fragment
      fn fragMain() -> @location(0) vec4f {
          return vec4f(1, 0, 0, 1);
      }`
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertMain',
      buffers: [{
        arrayStride: 8,  // 2 floats × 4 bytes
        attributes: [{
          shaderLocation: 0, 
          offset: 0, 
          format: 'float32x2'
        }]
      }],
    },
    fragment: {
      module: shaderModule, 
      entryPoint: 'fragMain',
      targets: [{ format }],
    },
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: [0.0, 0.0, 0.0, 1.0],
        storeOp: 'store',
      }]
    });
    
    passEncoder.setPipeline(pipeline);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.draw(3);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

})();