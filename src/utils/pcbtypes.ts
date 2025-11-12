// Represents a single connection point on a footprint
export interface Pad {
  position: { x: number; y: number }; // Relative to the footprint's origin
  shape: "rect" | "circle";
  size: { width: number; height: number }; // width/height for rect, radius in width for circle
}

// A template for a component's physical layout
export interface Footprint {
  name: string;
  pads: Pad[];
  // You could add silkscreen geometry here later
}

// An instance of a Footprint placed on the board
export interface PlacedComponent {
  id: number; // Unique ID for this instance
  footprint: Footprint;
  position: { x: number; y: number }; // Position on the PCB
  rotation: number; // In radians
}

// A copper trace connecting pads
export interface Trace {
  id: number; // Unique ID for this trace
  points: { x: number; y: number }[];
  width: number;
}

// The main container for your entire design
export class PCBDesign {
  public components: PlacedComponent[] = [];
  public traces: Trace[] = [];
  public footprintLibrary: Map<string, Footprint> = new Map();
  private nextId = 0;

  constructor(public width: number, public height: number) {
    // You can pre-populate the library here
    this.footprintLibrary.set("RES", {
      name: "RES",
      pads: [
        {
          position: { x: 0, y: 0 },
          shape: "rect",
          size: { width: 4, height: 4 },
        },
        {
          position: { x: 0, y: 20 },
          shape: "rect",
          size: { width: 4, height: 4 },
        },
      ],
    });
  }

  addComponent(
    footprintName: string,
    position: { x: number; y: number },
    rotation: number
  ): PlacedComponent | null {
    const footprint = this.footprintLibrary.get(footprintName);
    if (!footprint) {
      console.error(`Footprint ${footprintName} not found in library.`);
      return null;
    }
    const newComponent: PlacedComponent = {
      id: this.nextId++,
      footprint,
      position,
      rotation,
    };
    this.components.push(newComponent);
    return newComponent;
  }

  addTrace(points: { x: number; y: number }[], width: number): Trace {
    const newTrace: Trace = {
      id: this.nextId++,
      points,
      width,
    };
    this.traces.push(newTrace);
    return newTrace;
  }
}
