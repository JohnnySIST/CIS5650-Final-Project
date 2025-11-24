export class Camera2D {
  position: number[] = [0, 0];
  scale: number = 1;
  private panning = false;
  private selecting = false;
  private lastX = 0;
  private lastY = 0;
  renderer: { updateCameraBuffer: () => void; getCanvasSize?: () => { width: number, height: number } } | null = null;
  selectionStart: number[] | null = null;
  selectionEnd: number[] | null = null;

  constructor() {}

  setRenderer(renderer: { updateCameraBuffer: () => void }) {
    this.renderer = renderer;
  }

  init(dom: HTMLElement) {
    dom.addEventListener('mousedown', (e) => {
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.button === 2) {
        this.panning = true;
      } else if (e.button === 0) {
        this.selecting = true;
        const rect = dom.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        this.selectionStart = [
          (mouseX - this.position[0]) / this.scale,
          (mouseY - this.position[1]) / this.scale
        ];
        this.selectionEnd = [...this.selectionStart];
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.panning) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.translate(dx, dy);
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      } else if (this.selecting) {
        const rect = dom.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        this.selectionEnd = [
          (mouseX - this.position[0]) / this.scale,
          (mouseY - this.position[1]) / this.scale
        ];
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.panning = false;
      } else if (e.button === 0) {
        this.selecting = false;
        if (this.selectionStart && this.selectionEnd) {
          const x1 = this.selectionStart[0] * this.scale + this.position[0];
          const y1 = this.selectionStart[1] * this.scale + this.position[1];
          const x2 = this.selectionEnd[0] * this.scale + this.position[0];
          const y2 = this.selectionEnd[1] * this.scale + this.position[1];
          if (Math.abs(x2 - x1) < 10 || Math.abs(y2 - y1) < 10) {
            this.selectionStart = null;
            this.selectionEnd = null;
          }
          this.renderer?.updateCameraBuffer();
        }
      }
    });
    dom.addEventListener('wheel', (e) => {
      const factor = e.deltaY < 0 ? 1.05 : 0.95;
      const rect = dom.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.zoom(factor, mouseX, mouseY);
    });
    dom.addEventListener('contextmenu', (e) => {
      e.preventDefault();
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

  getSelectionBounds(): number[] | null {
    const canvasSize = this.renderer && typeof this.renderer.getCanvasSize === 'function'
      ? this.renderer.getCanvasSize()
      : { width: 0, height: 0 };
    if (!this.selectionStart || !this.selectionEnd) {
      return [
        0, 0,
        canvasSize.width, canvasSize.height
      ];
    }
    const x1 = this.selectionStart[0] * this.scale + this.position[0];
    const y1 = this.selectionStart[1] * this.scale + this.position[1];
    const x2 = this.selectionEnd[0] * this.scale + this.position[0];
    const y2 = this.selectionEnd[1] * this.scale + this.position[1];
    const minX = Math.max(0, Math.min(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxX = Math.min(canvasSize.width, Math.max(x1, x2));
    const maxY = Math.min(canvasSize.height, Math.max(y1, y2));
    return [
      minX, minY,
      maxX, maxY
    ];
  }
}