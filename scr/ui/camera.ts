export class Camera2D {
  position: number[] = [0, 0];
  scale: number = 1;
  private panning = false;
  private selecting = false;
  private lastX = 0;
  private lastY = 0;
  renderer: {
    updateCameraBuffer: () => void;
    getCanvasSize?: () => { width: number; height: number };
  } | null = null;
  selectionStart: number[] | null = null;
  selectionEnd: number[] | null = null;
  private uiCanvas: HTMLCanvasElement | null = null;

  constructor() {}
  init(dom: HTMLElement, uiCanvas?: HTMLCanvasElement) {
    this.uiCanvas = uiCanvas ?? null;
    dom.addEventListener("mousedown", (e) => {
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
          (mouseY - this.position[1]) / this.scale,
        ];
        this.selectionEnd = [...this.selectionStart];
        this.drawSelectionBox();
      }
    });
    window.addEventListener("mousemove", (e) => {
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
          (mouseY - this.position[1]) / this.scale,
        ];
        this.drawSelectionBox();
      }
    });
    window.addEventListener("mouseup", (e) => {
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
        this.clearSelectionBox();
      }
    });
    dom.addEventListener("wheel", (e) => {
      const factor = e.deltaY < 0 ? 1.05 : 0.95;
      const rect = dom.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.zoom(factor, mouseX, mouseY);
    });
    dom.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  private drawSelectionBox() {
    if (!this.uiCanvas) return;
    const ctx = this.uiCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    if (this.selectionStart && this.selectionEnd) {
      const x1 = this.selectionStart[0] * this.scale + this.position[0];
      const y1 = this.selectionStart[1] * this.scale + this.position[1];
      const x2 = this.selectionEnd[0] * this.scale + this.position[0];
      const y2 = this.selectionEnd[1] * this.scale + this.position[1];
      ctx.save();
      ctx.strokeStyle = "rgba(0,128,255,0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.abs(x2 - x1),
        Math.abs(y2 - y1)
      );
      ctx.restore();
    }
  }

  clearSelectionBox() {
    if (!this.uiCanvas) return;
    const ctx = this.uiCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
  }

  translate(dx: number, dy: number) {
    this.position[0] += dx;
    this.position[1] += dy;
    if (this.renderer) this.renderer.updateCameraBuffer();
  }

  getSelectionBounds(): number[] {
    const canvasSize =
      this.renderer && typeof this.renderer.getCanvasSize === "function"
        ? this.renderer.getCanvasSize()
        : { width: 0, height: 0 };
    if (!this.selectionStart || !this.selectionEnd) {
      return [0, 0, canvasSize.width, canvasSize.height];
    }
    const x1 = this.selectionStart[0] * this.scale + this.position[0];
    const y1 = this.selectionStart[1] * this.scale + this.position[1];
    const x2 = this.selectionEnd[0] * this.scale + this.position[0];
    const y2 = this.selectionEnd[1] * this.scale + this.position[1];
    const minX = Math.max(0, Math.min(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxX = Math.min(canvasSize.width, Math.max(x1, x2));
    const maxY = Math.min(canvasSize.height, Math.max(y1, y2));
    return [minX, minY, maxX, maxY];
  }
}
