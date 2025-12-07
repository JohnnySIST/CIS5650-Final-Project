export enum BoundaryType {
  DIRICHILET = 0,
  NEUMANN = 1,
}

export interface Circle {
  center: [number, number];
  radius: number;
  boundary_value: number;
  boundary_type: BoundaryType;
}

export interface Segment {
  start: [number, number];
  end: [number, number];
  widthRadius: number;
  boundary_value: number;
  boundary_type: BoundaryType;
}
