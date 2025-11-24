import { vec2 } from 'wgpu-matrix';

export class Camera2D {
  position: vec2 = vec2.create(0, 0);
  scale: number = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  renderer: { updateCameraBuffer: () => void } | null = null;

  constructor() {}

  setRenderer(renderer: { updateCameraBuffer: () => void }) {
    this.renderer = renderer;
  }

  init(dom: HTMLElement) {
    dom.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.translate(dx, dy);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    dom.addEventListener('wheel', (e) => {
      const factor = e.deltaY < 0 ? 1.05 : 0.95;
      const rect = dom.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.zoom(factor, mouseX, mouseY);
    });
  }

  translate(dx: number, dy: number) {
    this.position[0] += dx;
    this.position[1] += dy;
    if (this.renderer) this.renderer.updateCameraBuffer();
  }

  zoom(factor: number, centerX?: number, centerY?: number) {
    let cx = centerX ?? 0;
    let cy = centerY ?? 0;
    cx = (cx - this.position[0]) / this.scale;
    cy = (cy - this.position[1]) / this.scale;
    this.position[0] -= cx * (factor - 1) * this.scale;
    this.position[1] -= cy * (factor - 1) * this.scale;
    this.scale *= factor;
    if (this.scale < 0.01) this.scale = 0.01;
    if (this.scale > 100) this.scale = 100;
    if (this.renderer) this.renderer.updateCameraBuffer();
  }

  getTransform(): number[] {
    return [
      this.scale, 0, 0, 0,
      0, this.scale, 0, 0,
      0, 0, 1, 0,
      this.position[0], this.position[1], 0, 1
    ];
  }

  getInverseTransform(): number[] {
    const invScale = 1 / this.scale;
    return [
      invScale, 0, 0, 0,
      0, invScale, 0, 0,
      0, 0, 1, 0,
      -this.position[0] * invScale, -this.position[1] * invScale, 0, 1
    ];
  }
}
