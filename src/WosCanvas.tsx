import React, { useRef, useEffect } from 'react';
import { startWebGPURender } from '../scr/main';

interface WosCanvasProps {
  fpsCallback?: (fps: number) => void;
}

export default function WosCanvas({ fpsCallback }: WosCanvasProps) {
  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function initRenderer() {
      const renderer = await startWebGPURender();
      if (renderer && fpsCallback) {
        renderer.setFpsCallback(fpsCallback);
      }
    }
    initRenderer();
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas
        id="webgpu-canvas"
        ref={webgpuCanvasRef}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: 1 }}
      />
      <canvas
        id="ui-canvas"
        ref={uiCanvasRef}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, pointerEvents: 'none' }}
      />
    </div>
  );
}
