import { Circle, Segment } from "./renderer";

export const example_circles: Circle[] = [
  // Large circles
  { center: [0.0, 0.0], radius: 0.15, boundary_value: 1.0 },
  { center: [-0.6, 0.4], radius: 0.15, boundary_value: 0.5 },
  { center: [0.6, -0.4], radius: 0.18, boundary_value: 0.8 },

  // Medium circles
  { center: [-0.7, -0.7], radius: 0.06, boundary_value: 0.3 },
  { center: [0.7, 0.7], radius: 0.07, boundary_value: 0.7 },
  { center: [0.3, 0.3], radius: 0.08, boundary_value: 0.9 },
  { center: [-0.3, -0.5], radius: 0.03, boundary_value: 0.4 },
  { center: [0.44, 0.04], radius: 0.05, boundary_value: 0.6 },

  // Small circles
  { center: [-0.1, 0.64], radius: 0.08, boundary_value: 1.0 },
  { center: [0.82, -0.7], radius: 0.07, boundary_value: 0.2 },
  { center: [-0.44, -0.1], radius: 0.09, boundary_value: 0.5 },
  { center: [0.16, -0.64], radius: 0.06, boundary_value: 0.8 },
  { center: [-0.76, 0.84], radius: 0.085, boundary_value: 0.35 },

  // Tiny circles (details)
  { center: [-0.16, -0.24], radius: 0.04, boundary_value: 0.65 },
  { center: [0.36, 0.76], radius: 0.045, boundary_value: 0.95 },
  { center: [0.64, 0.24], radius: 0.035, boundary_value: 0.45 },
  { center: [-0.5, 0.16], radius: 0.05, boundary_value: 0.75 },
  { center: [0.1, 0.84], radius: 0.038, boundary_value: 0.25 },
  { center: [0.76, -0.16], radius: 0.042, boundary_value: 0.55 },
  { center: [-0.64, -0.3], radius: 0.048, boundary_value: 0.85 },

  // Additional medium circles (new)
  { center: [-0.85, 0.0], radius: 0.08, boundary_value: 0.42 },
  { center: [0.85, 0.15], radius: 0.09, boundary_value: 0.68 },
  { center: [0.0, -0.75], radius: 0.07, boundary_value: 0.52 },
  { center: [-0.3, 0.85], radius: 0.06, boundary_value: 0.78 },
  { center: [0.5, 0.6], radius: 0.065, boundary_value: 0.33 },

  // Additional small circles (new)
  { center: [-0.9, -0.4], radius: 0.05, boundary_value: 0.61 },
  { center: [0.9, -0.25], radius: 0.048, boundary_value: 0.47 },
  { center: [-0.25, -0.85], radius: 0.052, boundary_value: 0.71 },
  { center: [0.38, -0.85], radius: 0.046, boundary_value: 0.39 },
  { center: [-0.82, 0.55], radius: 0.055, boundary_value: 0.88 },

  // Additional tiny circles (new)
  { center: [0.22, 0.52], radius: 0.035, boundary_value: 0.44 },
  { center: [-0.38, 0.62], radius: 0.032, boundary_value: 0.66 },
  { center: [0.52, -0.12], radius: 0.038, boundary_value: 0.54 },
  { center: [-0.12, 0.36], radius: 0.03, boundary_value: 0.82 },
  { center: [0.18, -0.32], radius: 0.034, boundary_value: 0.37 },
];

export const example_segments: Segment[] = [
  { start: [-1, -1], end: [1, 1], widthRadius: 0.05, boundary_value: 0.5 },
  { start: [1, -1], end: [-1, 1], widthRadius: 0.05, boundary_value: 0.5 },
];
