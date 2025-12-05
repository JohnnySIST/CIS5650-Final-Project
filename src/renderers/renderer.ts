import { FpCircleCenter } from "kicadts";
import uvPreCompute from "/src/shaders/uvPreprocessCompute.wgsl?raw";
import wosCompute from "/src/shaders/wosCompute.wgsl?raw";
import wosRender from "/src/shaders/wosRender.wgsl?raw";

export interface Circle {
  center: [number, number];
  radius: number;
  boundary_value: number;
}
export interface Segment {
  start: [number, number];
  end: [number, number];
  widthRadius: number;
  boundary_value: number;
}

interface Grid {
  gridRes: [number, number];
  gridCells: Uint32Array; // Pairs of two values (start, length) for indices into cellGeoms
  cellGeoms: Uint32Array; // list of geoms for each cell 
}

interface Geom {
  type: number; // 0 indicates circle, 1 indicates segment
  index: number; 
}

interface BVHNode {
  bbox_min: [number, number];
  bbox_max: [number, number];
  
  is_leaf: boolean;
  geom_start: number;
  geom_count: number;
  
  left_child: number;
  right_child: number;
}

interface BVH {
  geoms: Uint32Array;       // LIST OF Geoms
  nodes: Float32Array;      // LIST OF NODES
}

interface BVHTreeNode {
  node: BVHNode;
  geoms: Geom[];
  left?: BVHTreeNode;
  right?: BVHTreeNode;
}

// OLD INCORRECT CLOSEST POINT SPACIAL GRID 
function buildGrid(
  circles: Circle[],
  segments: Segment[],
  simTL: [number, number],
  simSize: [number, number],
  gridRes: [number, number] = [32, 32]
): Grid {
  const [gridW, gridH] = gridRes;
  const cellSize = [simSize[0] / gridW, simSize[1] / gridH];

  const cellBoundaries: Geom[][] = [];
  for (let i = 0; i < gridW * gridH; i++) {
    cellBoundaries.push([]);
  }

  function addToCells(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    geomType: number,
    geomIndex: number
  ) {
    minX = Math.max(minX, simTL[0]);
    minY = Math.max(minY, simTL[1]);
    maxX = Math.min(maxX, simTL[0] + simSize[0]);
    maxY = Math.min(maxY, simTL[1] + simSize[1]);

    const cellMinX = Math.floor((minX - simTL[0]) / cellSize[0]);
    const cellMinY = Math.floor((minY - simTL[1]) / cellSize[1]);
    const cellMaxX = Math.floor((maxX - simTL[0]) / cellSize[0]);
    const cellMaxY = Math.floor((maxY - simTL[1]) / cellSize[1]);

    for (let cy = Math.max(0, cellMinY); cy <= Math.min(gridH - 1, cellMaxY); cy++) {
      for (let cx = Math.max(0, cellMinX); cx <= Math.min(gridW - 1, cellMaxX); cx++) {
        const cellIdx = cy * gridW + cx;
        
        cellBoundaries[cellIdx].push({ type: geomType, index: geomIndex });
      }
    }
  }

  circles.forEach((circle, i) => {
    const [cx, cy] = circle.center;
    const r = circle.radius;
    addToCells(cx - r, cy - r, cx + r, cy + r, 0, i);
  });

  segments.forEach((seg, i) => {
    const [x1, y1] = seg.start;
    const [x2, y2] = seg.end;
    const r = seg.widthRadius;

    const minX = Math.min(x1, x2) - r;
    const minY = Math.min(y1, y2) - r;
    const maxX = Math.max(x1, x2) + r;
    const maxY = Math.max(y1, y2) + r;

    addToCells(minX, minY, maxX, maxY, 1, i);
  });

  let totalRefs = 0;
  cellBoundaries.forEach((cell) => (totalRefs += cell.length));

  const gridCells = new Uint32Array(gridW * gridH * 2);
  const cellGeoms = new Uint32Array(totalRefs * 2);
  
  let currentIdx = 0;
  // Loop fills them with data:
  cellBoundaries.forEach((cell, cellIdx) => {
    gridCells[cellIdx * 2] = currentIdx;
    gridCells[cellIdx * 2 + 1] = cell.length;
    
    cell.forEach(ref => {
      cellGeoms[currentIdx * 2] = ref.type;
      cellGeoms[currentIdx * 2 + 1] = ref.index;
      currentIdx++;
    });
  });

  return { gridRes, gridCells, cellGeoms };
}

function computeBBox(
  geoms: Geom[],
  circles: Circle[],
  segments: Segment[]
): [number, number, number, number] {
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const geom of geoms) {
    if (geom.type === 0) {
      // CIRCLE
      const circle = circles[geom.index];
      minX = Math.min(minX, circle.center[0] - circle.radius);
      minY = Math.min(minY, circle.center[1] - circle.radius);
      maxX = Math.max(maxX, circle.center[0] + circle.radius);
      maxY = Math.max(maxY, circle.center[1] + circle.radius);
    } else {
      // SEGMENT
      const seg = segments[geom.index];
      const segMinX = Math.min(seg.start[0], seg.end[0]) - seg.widthRadius;
      const segMinY = Math.min(seg.start[1], seg.end[1]) - seg.widthRadius;
      const segMaxX = Math.max(seg.start[0], seg.end[0]) + seg.widthRadius;
      const segMaxY = Math.max(seg.start[1], seg.end[1]) + seg.widthRadius;
      
      minX = Math.min(minX, segMinX);
      minY = Math.min(minY, segMinY);
      maxX = Math.max(maxX, segMaxX);
      maxY = Math.max(maxY, segMaxY);
    }
  }
  
  return [minX, minY, maxX, maxY];
}

function subdivide (
  geoms: Geom[],
  centroids: [number, number][],
  circles: Circle[],
  segments: Segment[],
  leafSize: number,
): BVHTreeNode {
  const [minX, minY, maxX, maxY] = computeBBox(geoms, circles, segments);
  
  if (geoms.length <= leafSize) {
    return {
      node: {
        bbox_min: [minX, minY],
        bbox_max: [maxX, maxY],
        is_leaf: true,
        geom_start: -1,
        geom_count: geoms.length,
        left_child: -1,
        right_child: -1,
      },
      geoms: geoms
    };
  }
  
  const extentX = maxX - minX;
  const extentY = maxY - minY;

  var splitAxis: 0 | 1 = 1;
  if (extentX > extentY) {
    splitAxis = 0;
  }

  var mid: number;
  if (splitAxis == 0) {
    mid = (maxX - minX) * 0.5 + minX;
  } else {
    mid = (maxY - minY) * 0.5 + minY;
  }

  var leftGeoms: Geom[] = [];
  var rightGeoms: Geom[] = [];

  geoms.forEach(geo => {
    var center: [number, number];
    if (geo.type == 0) {
      center = centroids[geo.index];
    } else {
      center = centroids[geo.index + circles.length];
    }

    if (center[splitAxis] < mid) {
      leftGeoms.push(geo);
    } else {
      rightGeoms.push(geo);
    }
  });

  if (leftGeoms.length === 0 || rightGeoms.length === 0) {
    leftGeoms = [];
    rightGeoms = [];

    splitAxis = (splitAxis + 1) % 2;
    if (splitAxis == 0) {
      mid = (maxX - minX) * 0.5 + minX;
    } else {
      mid = (maxY - minY) * 0.5 + minY;
    }

    geoms.forEach(geo => {
      var center: [number, number];
      if (geo.type == 0) {
        center = centroids[geo.index];
      } else {
        center = centroids[geo.index + circles.length];
      }

      if (center[splitAxis] < mid) {
        leftGeoms.push(geo);
      } else {
        rightGeoms.push(geo);
      }
    });
  }

  if (leftGeoms.length === 0 || rightGeoms.length === 0) {
      return {
        node: {
          bbox_min: [minX, minY],
          bbox_max: [maxX, maxY],
          is_leaf: true,
          geom_start: -1,
          geom_count: geoms.length,
          left_child: -1,
          right_child: -1,
        },
        geoms: geoms
      };
  }

  const leftChild = subdivide(leftGeoms, centroids, circles, segments, leafSize);
  const rightChild = subdivide(rightGeoms, centroids, circles, segments, leafSize);

  return {
    node: {
      bbox_min: [minX, minY],
      bbox_max: [maxX, maxY],
      is_leaf: false,
      geom_start: -1,
      geom_count: -1,
      left_child: -1,
      right_child: -1,
    },
    geoms: [],
    left: leftChild,
    right: rightChild
  };
}

function bvhTreeGPU(
  parent: BVHTreeNode,
  flatNodes: BVHNode[],
  flatGeoms: Geom[]
): number {
  const myIndex = flatNodes.length;
  const node = {...parent.node};
  
  if (node.is_leaf) {
    node.geom_start = flatGeoms.length;
    node.geom_count = parent.geoms.length;
    flatGeoms.push(...parent.geoms);
    flatNodes.push(node);
    
  } else {
    flatNodes.push(node);

    const leftIdx = bvhTreeGPU(parent.left!, flatNodes, flatGeoms);
    const rightIdx = bvhTreeGPU(parent.right!, flatNodes, flatGeoms);
    
    // Update child indices
    flatNodes[myIndex].left_child = leftIdx;
    flatNodes[myIndex].right_child = rightIdx;
  }
  
  return myIndex;
}


export function buildBVH(
  circles: Circle[],
  segments: Segment[],
  leafSize: number = 4
): BVH {
  const geoms: Geom[] = [];
  const centroids: [number, number][] = [];
  
  circles.forEach((circle, i) => {
    geoms.push({
      type: 0,
      index: i
    });

    centroids.push([circle.center[0], circle.center[1]]);
  });
  
  segments.forEach((segment, i) => {
    geoms.push({
      type: 1,
      index: i
    });
    const centerX = (segment.start[0] + segment.end[0]) / 2;
    const centerY = (segment.start[1] + segment.end[1]) / 2;
    centroids.push([centerX, centerY]);
  });

  const rootNode = subdivide(geoms, centroids, circles, segments, leafSize);

  const flatNodes: BVHNode[] = [];
  const flatGeoms: Geom[] = [];
  bvhTreeGPU(rootNode, flatNodes, flatGeoms);

  const circleData = new Float32Array(circles.length * 4);
    for (let i = 0; i < circles.length; i++) {
      const offset = i * 4;
      circleData[offset + 0] = circles[i].center[0]; // center.x
      circleData[offset + 1] = circles[i].center[1]; // center.y
      circleData[offset + 2] = circles[i].radius;
      circleData[offset + 3] = circles[i].boundary_value;
    }

  const geomsData = new Uint32Array(flatGeoms.length * 2);
  for (let i = 0; i < flatGeoms.length; i++) {
    const offset = i * 2;
    geomsData[offset + 0] = flatGeoms[i].type;
    geomsData[offset + 1] = flatGeoms[i].index;
  }

  const nodeData = new Float32Array(flatNodes.length * 12);
  for (let i = 0; i < flatNodes.length; i++) {
    const offset = i * 12;
    const node = flatNodes[i];
    nodeData[offset + 0] = node.bbox_min[0];
    nodeData[offset + 1] = node.bbox_min[1];
    nodeData[offset + 2] = node.bbox_max[0];
    nodeData[offset + 3] = node.bbox_max[1];
    
    const uintView = new Uint32Array(nodeData.buffer, (offset + 4) * 4, 5);
    uintView[0] = node.is_leaf ? 1 : 0;
    uintView[1] = node.geom_start === -1 ? 0 : node.geom_start;
    uintView[2] = node.geom_count === -1 ? 0 : node.geom_count;
    uintView[3] = node.left_child === -1 ? 0xFFFFFFFF : node.left_child;
    uintView[4] = node.right_child === -1 ? 0xFFFFFFFF : node.right_child;

    uintView[5] = 0; // _pad0
    uintView[6] = 0; // _pad1
    uintView[7] = 0; // _pad2
  }

  return {
    geoms: geomsData,
    nodes: nodeData
  };
}

const example_circles: Circle[] = [
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

const example_segments: Segment[] = [
  { start: [-1, -1], end: [1, 1], widthRadius: 0.05, boundary_value: 0.5 },
  { start: [1, -1], end: [-1, 1], widthRadius: 0.05, boundary_value: 0.5 },
];

export class Renderer {
  private format: GPUTextureFormat;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext;
  private device: GPUDevice;

  private circleGeomBuffer: GPUBuffer;
  private simResBuffer: GPUBuffer;
  private simTLBuffer: GPUBuffer;
  private simSizeBuffer: GPUBuffer;
  private viewResBuffer: GPUBuffer;
  private viewTLBuffer: GPUBuffer;
  private viewSizeBuffer: GPUBuffer;
  private walkCountBuffer: GPUBuffer;
  private wosValuesBuffer: GPUBuffer;
  private uvBuffer: GPUBuffer;
  private segmentGeomBuffer: GPUBuffer;
  
  // GRID BUFFERS:
  private gridBindGroup_uvPre: GPUBindGroup;
  private gridBindGroup_compute: GPUBindGroup;
  private gridResBuffer: GPUBuffer;
  private gridCellsBuffer: GPUBuffer;
  private gridIndicesBuffer: GPUBuffer;

  // BVH BUFFERS
  private bvhBindGroup_compute: GPUBindGroup;
  private bvhGeomsBuffer: GPUBuffer;
  private bvhNodeBuffer: GPUBuffer;

  private uvBindGroup_compute: GPUBindGroup;
  private domainSizeBindGroup_frag: GPUBindGroup;
  private uvBindGroup_frag: GPUBindGroup;
  private domainSizeBindGroup_wos: GPUBindGroup;
  private domainSizeBindGroup_uvPre: GPUBindGroup;
  private uvBindGroup_uvPre: GPUBindGroup;

  private wos_pipeline: GPUComputePipeline;
  private renderPipeline: GPURenderPipeline;
  private uvPre_Pipeline: GPUComputePipeline;

  private totalWalks = 0;

  private simRes: [number, number]; // integers, pixels
  private simTL: [number, number]; // floats, world space
  private simSize: [number, number]; // floats, world space

  private viewRes: [number, number]; // integers, pixels
  private viewTL: [number, number]; // floats, world space
  private viewSize: [number, number]; // floats, world space

  private simUpdateId: number = 0;

  constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    simRes: [number, number] = [canvas.width, canvas.height],
    simTL: [number, number] = [-0.9, -0.9],
    simSize: [number, number] = [1.8, 1.8],
    viewRes: [number, number] = [canvas.width, canvas.height],
    viewTL: [number, number] = [-1, -1],
    viewSize: [number, number] = [2, 2]
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.simRes = simRes;
    this.simTL = simTL;
    this.simSize = simSize;
    this.viewRes = viewRes;
    this.viewTL = viewTL;
    this.viewSize = viewSize;
    this.init();
  }

  private async init() {
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
    });

    this.setCircles();
  }

  async updateParams({
    simRes,
    simTL,
    simSize,
    viewRes,
    viewTL,
    viewSize,
  }: {
    simRes?: [number, number];
    simTL?: [number, number];
    simSize?: [number, number];
    viewRes?: [number, number];
    viewTL?: [number, number];
    viewSize?: [number, number];
  }) {
    const device = this.device;
    const canvas = this.canvas;
    if (simRes) {
      this.simRes = simRes;
      const simResData = new Uint32Array([this.simRes[0], this.simRes[1]]);
      device.queue.writeBuffer(this.simResBuffer, 0, simResData);
    }
    if (simTL) {
      this.simTL = simTL;
      const simTLData = new Float32Array([this.simTL[0], this.simTL[1]]);
      device.queue.writeBuffer(this.simTLBuffer, 0, simTLData);
    }
    if (simSize) {
      this.simSize = simSize;
      const simSizeData = new Float32Array([this.simSize[0], this.simSize[1]]);
      device.queue.writeBuffer(this.simSizeBuffer, 0, simSizeData);
    }
    if (viewRes) {
      this.viewRes = viewRes;
      const viewResData = new Uint32Array([this.viewRes[0], this.viewRes[1]]);
      device.queue.writeBuffer(this.viewResBuffer, 0, viewResData);
    }
    if (viewTL) {
      this.viewTL = viewTL;
      const viewTLData = new Float32Array([this.viewTL[0], this.viewTL[1]]);
      device.queue.writeBuffer(this.viewTLBuffer, 0, viewTLData);
    }
    if (viewSize) {
      this.viewSize = viewSize;
      const viewSizeData = new Float32Array([
        this.viewSize[0],
        this.viewSize[1],
      ]);
      device.queue.writeBuffer(this.viewSizeBuffer, 0, viewSizeData);
    }
  }

  async setCircles(
    circles: Circle[] = example_circles,
    segments: Segment[] = example_segments
  ) {
    this.simUpdateId += 1;
    const canvas = this.canvas;
    const context = this.context;
    const device = this.device;

    const circleData = new Float32Array(circles.length * 4);
    for (let i = 0; i < circles.length; i++) {
      const offset = i * 4;
      circleData[offset + 0] = circles[i].center[0]; // center.x
      circleData[offset + 1] = circles[i].center[1]; // center.y
      circleData[offset + 2] = circles[i].radius;
      circleData[offset + 3] = circles[i].boundary_value;
    }

    this.circleGeomBuffer = device.createBuffer({
      label: "circle geo buffer",
      size: circles.length * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.circleGeomBuffer, 0, circleData);

    const segmentData = new Float32Array(segments.length * 6);
    for (let i = 0; i < segments.length; i++) {
      const offset = i * 6;
      segmentData[offset + 0] = segments[i].start[0]; // start.x
      segmentData[offset + 1] = segments[i].start[1]; // start.y
      segmentData[offset + 2] = segments[i].end[0]; // end.x
      segmentData[offset + 3] = segments[i].end[1]; // end.y
      segmentData[offset + 4] = segments[i].widthRadius;
      segmentData[offset + 5] = segments[i].boundary_value;
    }

    this.segmentGeomBuffer = device.createBuffer({
      label: "segment geo buffer",
      size: segments.length * 6 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.segmentGeomBuffer, 0, segmentData);

    // =============================
    // SETUP A BVH OR GRID STRUCTURE HERE 
    // =============================
    
    // const gridData = buildGrid(circles, segments, this.simTL, this.simSize, [8,8]);

    // this.gridResBuffer = device.createBuffer({
    //     label: "grid resolution",
    //     size: 2 * 4,
    //     usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    // });
    // device.queue.writeBuffer(this.gridResBuffer, 0, new Uint32Array(gridData.gridRes));

    // this.gridCellsBuffer = device.createBuffer({
    //     label: "grid cells",
    //     size: gridData.gridCells.byteLength,
    //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    // });
    // device.queue.writeBuffer(this.gridCellsBuffer, 0, new Uint32Array(gridData.gridCells));

    // this.gridIndicesBuffer = device.createBuffer({
    //     label: "grid indices",
    //     size: gridData.cellGeoms.byteLength,
    //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    // });
    // device.queue.writeBuffer(this.gridIndicesBuffer, 0,  new Uint32Array(gridData.cellGeoms));
    

    // BVH BUFFERS 
    const BVH = buildBVH(circles, segments, 4);

    this.bvhGeomsBuffer = device.createBuffer({
      label: 'bvh geoms buffer',
      size: BVH.geoms.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bvhNodeBuffer = device.createBuffer({
      label: 'bvh node buffer',
      size: BVH.nodes.byteLength, 
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // =============================
    //    UV PREPROCESS SETUP
    // =============================

    this.uvPre_Pipeline = device.createComputePipeline({
      label: "uv preprocess compute",
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: uvPreCompute }),
        entryPoint: "main",
      },
    });

    // THIS IS THE SCREEN DIMS USED FOR PATHING
    this.simResBuffer = device.createBuffer({
      label: "Sim Res Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simResData = new Uint32Array(this.simRes);

    device.queue.writeBuffer(this.simResBuffer, 0, simResData);

    this.simTLBuffer = device.createBuffer({
      label: "Sim TL Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simTLData = new Float32Array(this.simTL);

    device.queue.writeBuffer(this.simTLBuffer, 0, simTLData);

    this.simSizeBuffer = device.createBuffer({
      label: "Sim Size Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simSizeData = new Float32Array(this.simSize);

    device.queue.writeBuffer(this.simSizeBuffer, 0, simSizeData);

    // BIND GEOMETRY DATA
    this.domainSizeBindGroup_uvPre = device.createBindGroup({
      label: "domain size uvPre bg",
      layout: this.uvPre_Pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.circleGeomBuffer } },
        { binding: 4, resource: { buffer: this.segmentGeomBuffer } },
      ],
    });

    // BIND GRID
    // this.gridBindGroup_uvPre = device.createBindGroup({
    //   label: "grid bg",
    //   layout: this.uvPre_Pipeline.getBindGroupLayout(2),
    //   entries: [
    //     { binding: 0, resource: { buffer: this.gridResBuffer} },
    //     { binding: 1, resource: { buffer: this.gridCellsBuffer} },
    //     { binding: 2, resource: { buffer: this.gridIndicesBuffer} }
    //   ],
    // });

    // THIS STORES UVs ON SCREEN FOR QUEERY POINTS
    this.uvBuffer = device.createBuffer({
      label: "uv buffer",
      size: this.simRes[0] * this.simRes[1] * 8,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    this.uvBindGroup_uvPre = device.createBindGroup({
      label: "uv bg compute",
      layout: this.uvPre_Pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.uvBuffer } }],
    });

    // ===============================
    //    WOS COMPUTE SHADER SETUP
    // ===============================

    this.wos_pipeline = device.createComputePipeline({
      label: "wos compute",
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: wosCompute }),
        entryPoint: "main",
      },
    });

    this.walkCountBuffer = device.createBuffer({
      label: "Walk Count Buffer",
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.domainSizeBindGroup_wos = device.createBindGroup({
      label: "domain size wos bg",
      layout: this.wos_pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.walkCountBuffer } },
        { binding: 4, resource: { buffer: this.circleGeomBuffer } },
        { binding: 5, resource: { buffer: this.segmentGeomBuffer } },
      ],
    });

    this.wosValuesBuffer = device.createBuffer({
      label: "wos values buffer",
      size: canvas.width * canvas.height * 4,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    this.uvBindGroup_compute = device.createBindGroup({
      label: "uv bg compute",
      layout: this.wos_pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.uvBuffer } },
        { binding: 1, resource: { buffer: this.wosValuesBuffer } },
      ],
    });

    // this.gridBindGroup_compute = device.createBindGroup({
    //   label: "grid bg wos",
    //   layout: this.wos_pipeline.getBindGroupLayout(2),
    //   entries: [
    //     { binding: 0, resource: { buffer: this.gridResBuffer} },
    //     { binding: 1, resource: { buffer: this.gridCellsBuffer} },
    //     { binding: 2, resource: { buffer: this.gridIndicesBuffer} }
    //   ],
    // });

    this.bvhBindGroup_compute = device.createBindGroup({
      label: 'bvh bind group',
      layout: this.wos_pipeline.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: this.bvhGeomsBuffer} },
        { binding: 1, resource: { buffer: this.bvhNodeBuffer } }
      ]
    });

    // ======================================
    //    OUTPUT VERT / FRAG FOR RENDERING
    // ======================================

    this.renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          label: "wos render vert",
          code: wosRender,
        }),
        entryPoint: "vertMain",
      },
      fragment: {
        module: device.createShaderModule({
          label: "wos render frag",
          code: wosRender,
        }),
        entryPoint: "fragMain",
        targets: [{ format: this.format }],
      },
    });

    this.viewResBuffer = device.createBuffer({
      label: "View Res Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewResData = new Uint32Array(this.viewRes);

    device.queue.writeBuffer(this.viewResBuffer, 0, viewResData);

    this.viewTLBuffer = device.createBuffer({
      label: "View TL Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewTLData = new Float32Array(this.viewTL);

    device.queue.writeBuffer(this.viewTLBuffer, 0, viewTLData);

    this.viewSizeBuffer = device.createBuffer({
      label: "View Size Buffer",
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewSizeData = new Float32Array(this.viewSize);

    device.queue.writeBuffer(this.viewSizeBuffer, 0, viewSizeData);

    this.domainSizeBindGroup_frag = device.createBindGroup({
      label: "domain size frag bg",
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.viewResBuffer } },
        { binding: 4, resource: { buffer: this.viewTLBuffer } },
        { binding: 5, resource: { buffer: this.viewSizeBuffer } },
        { binding: 6, resource: { buffer: this.walkCountBuffer } },
      ],
    });

    this.uvBindGroup_frag = device.createBindGroup({
      label: "uv bg frag",
      layout: this.renderPipeline.getBindGroupLayout(1),
      entries: [
        // { binding: 0, resource: { buffer: this.uvBuffer } },
        { binding: 0, resource: { buffer: this.wosValuesBuffer } },
      ],
    });

    // ===============================
    //    THIS RENDERS STUFF :)
    // ===============================

    requestAnimationFrame(() => this.frame(this.simUpdateId));
  }

  private frame(simUpdateId: number) {
    if (simUpdateId !== this.simUpdateId) {
      return;
    }
    const canvas = this.canvas;
    const context = this.context;
    const device = this.device;

    const commandEncoder = device.createCommandEncoder();

    const uvPreComputePass = commandEncoder.beginComputePass();
    uvPreComputePass.setPipeline(this.uvPre_Pipeline);
    uvPreComputePass.setBindGroup(0, this.domainSizeBindGroup_uvPre);
    uvPreComputePass.setBindGroup(1, this.uvBindGroup_uvPre);

    const wgSize_Pre = 8;
    const dispatchX_Pre = Math.ceil(this.simRes[0] / wgSize_Pre);
    const dispatchY_Pre = Math.ceil(this.simRes[1] / wgSize_Pre);
    uvPreComputePass.dispatchWorkgroups(dispatchX_Pre, dispatchY_Pre);
    uvPreComputePass.end();

    this.totalWalks += 1; // IF YOU UPDATE THIS, UPDATE NUMBER IN wosCompute AND wosRender

    device.queue.writeBuffer(
      this.walkCountBuffer,
      0,
      new Uint32Array([this.totalWalks])
    );

    const wosComputePass = commandEncoder.beginComputePass();
    wosComputePass.setPipeline(this.wos_pipeline);
    wosComputePass.setBindGroup(0, this.domainSizeBindGroup_wos);
    wosComputePass.setBindGroup(1, this.uvBindGroup_compute);
    wosComputePass.setBindGroup(2, this.bvhBindGroup_compute);
    const wgSize = 8;
    const dispatchX_wos = Math.ceil(this.simRes[0] / wgSize);
    const dispatchY_wos = Math.ceil(this.simRes[1] / wgSize);
    wosComputePass.dispatchWorkgroups(dispatchX_wos, dispatchY_wos);
    wosComputePass.end();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: [0.0, 0.0, 0.0, 1.0],
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(this.renderPipeline);
    passEncoder.setBindGroup(0, this.domainSizeBindGroup_frag);
    passEncoder.setBindGroup(1, this.uvBindGroup_frag);
    passEncoder.draw(3);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(() => this.frame(simUpdateId));
  }
}
