import './style.css';
import init from './renderers/renderer';
import { assert } from './utils/util';
import { Camera2D } from './ui/camera';

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

  const canvas = document.querySelector<HTMLCanvasElement>('#webgpu-canvas');
  const uiCanvas = document.querySelector<HTMLCanvasElement>('#ui-canvas');
  assert(canvas !== null && uiCanvas !== null);
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  uiCanvas.width = canvas.width;
  uiCanvas.height = canvas.height;

  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  const camera = new Camera2D();
  camera.init(canvas, uiCanvas);

  init(canvas, context, device, camera);

})();