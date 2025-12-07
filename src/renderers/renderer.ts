import uvPreCompute from "/src/shaders/uvPreprocessCompute.wgsl?raw";
import wosCompute from "/src/shaders/wosCompute.wgsl?raw";
import wosRender from "/src/shaders/wosRender.wgsl?raw";

import { example_circles, example_segments } from "./example_data";
import { align } from "../utils/util";
import { BoundaryType, Circle, Segment } from "./renderTypes";

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
  geoms: Uint32Array; // LIST OF Geoms
  nodes: Float32Array; // LIST OF NODES
}

interface BVHTreeNode {
  node: BVHNode;
  geoms: Geom[];
  left?: BVHTreeNode;
  right?: BVHTreeNode;
}

function computeBBox(
  geoms: Geom[],
  circles: Circle[],
  segments: Segment[]
): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

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

// OLD BVH CREATION
// function subdivide(
//   geoms: Geom[],
//   centroids: [number, number][],
//   circles: Circle[],
//   segments: Segment[],
//   leafSize: number
// ): BVHTreeNode {
//   const [minX, minY, maxX, maxY] = computeBBox(geoms, circles, segments);

//   if (geoms.length <= leafSize) {
//     return {
//       node: {
//         bbox_min: [minX, minY],
//         bbox_max: [maxX, maxY],
//         is_leaf: true,
//         geom_start: -1,
//         geom_count: geoms.length,
//         left_child: -1,
//         right_child: -1,
//       },
//       geoms: geoms,
//     };
//   }

//   const extentX = maxX - minX;
//   const extentY = maxY - minY;

//   var splitAxis: 0 | 1 = 1;
//   if (extentX > extentY) {
//     splitAxis = 0;
//   }

//   var mid: number;
//   if (splitAxis == 0) {
//     mid = (maxX - minX) * 0.5 + minX;
//   } else {
//     mid = (maxY - minY) * 0.5 + minY;
//   }

//   var leftGeoms: Geom[] = [];
//   var rightGeoms: Geom[] = [];

//   geoms.forEach((geo) => {
//     var center: [number, number];
//     if (geo.type == 0) {
//       center = centroids[geo.index];
//     } else {
//       center = centroids[geo.index + circles.length];
//     }

//     if (center[splitAxis] < mid) {
//       leftGeoms.push(geo);
//     } else {
//       rightGeoms.push(geo);
//     }
//   });

//   if (leftGeoms.length === 0 || rightGeoms.length === 0) {
//     leftGeoms = [];
//     rightGeoms = [];

//     splitAxis = (splitAxis + 1) % 2;
//     if (splitAxis == 0) {
//       mid = (maxX - minX) * 0.5 + minX;
//     } else {
//       mid = (maxY - minY) * 0.5 + minY;
//     }

//     geoms.forEach((geo) => {
//       var center: [number, number];
//       if (geo.type == 0) {
//         center = centroids[geo.index];
//       } else {
//         center = centroids[geo.index + circles.length];
//       }

//       if (center[splitAxis] < mid) {
//         leftGeoms.push(geo);
//       } else {
//         rightGeoms.push(geo);
//       }
//     });
//   }

//   if (leftGeoms.length === 0 || rightGeoms.length === 0) {
//     return {
//       node: {
//         bbox_min: [minX, minY],
//         bbox_max: [maxX, maxY],
//         is_leaf: true,
//         geom_start: -1,
//         geom_count: geoms.length,
//         left_child: -1,
//         right_child: -1,
//       },
//       geoms: geoms,
//     };
//   }

//   const leftChild = subdivide(
//     leftGeoms,
//     centroids,
//     circles,
//     segments,
//     leafSize
//   );
//   const rightChild = subdivide(
//     rightGeoms,
//     centroids,
//     circles,
//     segments,
//     leafSize
//   );

//   return {
//     node: {
//       bbox_min: [minX, minY],
//       bbox_max: [maxX, maxY],
//       is_leaf: false,
//       geom_start: -1,
//       geom_count: -1,
//       left_child: -1,
//       right_child: -1,
//     },
//     geoms: [],
//     left: leftChild,
//     right: rightChild,
//   };
// }

function subdivide(
  geoms: Geom[],
  centroids: [number, number][],
  circles: Circle[],
  segments: Segment[],
  leafSize: number
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
      geoms: geoms,
    };
  }

  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const splitAxis = extentX > extentY ? 0 : 1;

  // PARTITION ABOUNT SPLIT AXIS
  const sorted = geoms.slice().sort((a, b) => {
    const centA = getCentroid(a, centroids, circles.length);
    const centB = getCentroid(b, centroids, circles.length);
    return centA[splitAxis] - centB[splitAxis];
  });

  const midIdx = Math.floor(sorted.length / 2);
  const leftGeoms = sorted.slice(0, midIdx);
  const rightGeoms = sorted.slice(midIdx);

  // RECURSE ON CHILDREN
  const leftChild = subdivide(
    leftGeoms,
    centroids,
    circles,
    segments,
    leafSize
  );
  const rightChild = subdivide(
    rightGeoms,
    centroids,
    circles,
    segments,
    leafSize
  );

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
    right: rightChild,
  };
}

function getCentroid(
  geo: Geom,
  centroids: [number, number][],
  numCircles: number
): [number, number] {
  if (geo.type === 0) {
    return centroids[geo.index];
  } else {
    return centroids[geo.index + numCircles];
  }
}

function bvhTreeGPU(
  parent: BVHTreeNode,
  flatNodes: BVHNode[],
  flatGeoms: Geom[]
): number {
  const myIndex = flatNodes.length;
  const node = { ...parent.node };

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

// USED FOR DEBUGGING BVH
// function printBVHStats(root: BVHTreeNode, depth: number = 0): void {
//   const leafSizes: number[] = [];
//   const depths: number[] = [];

//   function traverse(node: BVHTreeNode, d: number): void {
//     if (node.node.is_leaf) {
//       leafSizes.push(node.geoms.length);
//       depths.push(d);
//     } else {
//       if (node.left) traverse(node.left, d + 1);
//       if (node.right) traverse(node.right, d + 1);
//     }
//   }

//   traverse(root, 0);

//   const totalLeaves = leafSizes.length;
//   const totalGeoms = leafSizes.reduce((a, b) => a + b, 0);
//   const minLeaf = Math.min(...leafSizes);
//   const maxLeaf = Math.max(...leafSizes);
//   const avgLeaf = totalGeoms / totalLeaves;
//   const maxDepth = Math.max(...depths);
//   const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;

//   console.log("=== BVH Stats ===");
//   console.log(`Total leaves: ${totalLeaves}`);
//   console.log(`Total geometry: ${totalGeoms}`);
//   console.log(`Leaf sizes: min=${minLeaf}, max=${maxLeaf}, avg=${avgLeaf.toFixed(2)}`);
//   console.log(`Depth: max=${maxDepth}, avg=${avgDepth.toFixed(2)}`);

// }

export function buildBVH(
  circles: Circle[],
  segments: Segment[],
  leafSize: number = 8
): BVH {
  const geoms: Geom[] = [];
  const centroids: [number, number][] = [];

  circles.forEach((circle, i) => {
    geoms.push({
      type: 0,
      index: i,
    });

    centroids.push([circle.center[0], circle.center[1]]);
  });

  segments.forEach((segment, i) => {
    geoms.push({
      type: 1,
      index: i,
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
    circleData[offset + 0] = circles[i].center[0];
    circleData[offset + 1] = circles[i].center[1];
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
    uintView[3] = node.left_child === -1 ? 0xffffffff : node.left_child;
    uintView[4] = node.right_child === -1 ? 0xffffffff : node.right_child;

    uintView[5] = 0;
    uintView[6] = 0;
    uintView[7] = 0;
  }

  return {
    geoms: geomsData,
    nodes: nodeData,
  };
}

export class Renderer {
  private format: GPUTextureFormat;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext;
  private device: GPUDevice;

  private circleGeomBuffer: GPUBuffer;

  private boardTLBuffer: GPUBuffer;
  private boardSizeBuffer: GPUBuffer;

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

  private minMaxBValsBuffer: GPUBuffer;

  // BVH BUFFERS
  private bvhBindGroup_uvPre: GPUBindGroup;
  private bvhBindGroup_compute: GPUBindGroup;

  // DIRICHILET
  private bvhDirGeomsBuffer: GPUBuffer;
  private bvhDirNodeBuffer: GPUBuffer;

  // NEUMANN
  private bvhNeuGeomsBuffer: GPUBuffer;
  private bvhNeuNodeBuffer: GPUBuffer;

  private uvBindGroup_compute: GPUBindGroup;
  private domainSizeBindGroup_frag: GPUBindGroup;
  private uvBindGroup_frag: GPUBindGroup;
  private domainSizeBindGroup_wos: GPUBindGroup;
  private domainSizeBindGroup_uvPre: GPUBindGroup;
  private uvBindGroup_uvPre: GPUBindGroup;

  // SIM BUFFERS
  private wos_pipeline: GPUComputePipeline;
  private renderPipeline: GPURenderPipeline;
  private uvPre_Pipeline: GPUComputePipeline;

  private totalWalks = 0;

  private boardTL: [number, number]; // floats, world space
  private boardSize: [number, number]; // floats, world space

  private simRes: [number, number]; // integers, pixels
  private simTL: [number, number]; // floats, world space
  private simSize: [number, number]; // floats, world space

  private viewRes: [number, number]; // integers, pixels
  private viewTL: [number, number]; // floats, world space
  private viewSize: [number, number]; // floats, world space

  private minMaxBvals: [number, number] = [Number.MAX_VALUE, Number.MIN_VALUE]; // STORES THE MIN AND MAX B VALUE FOR COLOR REMAPPING

  private simUpdateId: number = 0;

  private fpsCallback: (fps: number) => void;

  private lastFpsTime: number;
  private frameCount: number = 0;
  private simulationEnabled: boolean = true;
  private uvPreprocessNeeded: boolean = true;

  constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    boardTL: [number, number] = [120, 90],
    boardSize: [number, number] = [60, 60],
    simRes: [number, number] = [canvas.width, canvas.height],
    simTL: [number, number] = boardTL,
    simSize: [number, number] = boardSize,
    viewRes: [number, number] = [canvas.width, canvas.height],
    viewTL: [number, number] = boardTL,
    viewSize: [number, number] = boardSize,
    simulationEnabled: boolean = true,
    fpsCallback: (fps: number) => void = () => {}
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.boardTL = boardTL;
    this.boardSize = boardSize;
    this.simRes = simRes;
    this.simTL = simTL;
    this.simSize = simSize;
    this.viewRes = viewRes;
    this.viewTL = viewTL;
    this.viewSize = viewSize;
    this.simulationEnabled = simulationEnabled;
    this.fpsCallback = fpsCallback;
    this.init();
    this.lastFpsTime = performance.now();
  }

  private init() {
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
    });

    this.simUpdateId += 1;

    const circles = example_circles;
    const segments = example_segments;

    // =============================
    // SETUP A BVH BUFFERS HERE
    // =============================

    this.createCircleBuffer(circles);
    this.createSegmentBuffer(segments);
    this.createBVHBuffers(circles, segments);

    // =============================
    //    Uniform buffers
    // =============================

    this.createSimPropertiesBuffers();
    this.createBoardPropertiesBuffers();

    this.createViewProperitiesBuffers();
    this.createMinMaxBValsBuffer();

    // UV BUFFERS

    this.createUVBuffer();

    // WOS BUFFERS

    this.createWalkCountBuffer();
    this.createWOSValuesBuffer();

    // =============================
    //    UV PREPROCESS SETUP
    // =============================

    this.createUVPrePipeline();
    this.createUVPrePipelineBindGroups();

    // ===============================
    //    WOS COMPUTE SHADER SETUP
    // ===============================

    this.createWOSPipeline();
    this.createWOSPipelineBindGroups();

    // ======================================
    //    OUTPUT VERT / FRAG FOR RENDERING
    // ======================================

    this.createWOSRenderPipeline();
    this.createWOSRenderBindGroups();

    // ===============================
    //    THIS RENDERS STUFF :)
    // ===============================
    this.totalWalks = 0;
    requestAnimationFrame(() => this.frame(this.simUpdateId));
  }

  updateParams({
    boardTL,
    boardSize,
    simRes,
    simTL,
    simSize,
    viewRes,
    viewTL,
    viewSize,
    simulationEnabled,
  }: {
    boardTL?: [number, number];
    boardSize?: [number, number];
    simRes?: [number, number];
    simTL?: [number, number];
    simSize?: [number, number];
    viewRes?: [number, number];
    viewTL?: [number, number];
    viewSize?: [number, number];
    simulationEnabled?: boolean;
  }) {
    // console.log("updateParams", {
    //   boardTL,
    //   boardSize,
    //   simRes,
    //   simTL,
    //   simSize,
    //   viewRes,
    //   viewTL,
    //   viewSize,
    //   simulationEnabled,
    // });
    const device = this.device;
    const canvas = this.canvas;
    if (boardTL) {
      this.boardTL = boardTL;
      const boardTLData = new Float32Array(this.boardTL);
      device.queue.writeBuffer(this.boardTLBuffer, 0, boardTLData);
    }
    if (boardSize) {
      this.boardSize = boardSize;
      const boardSizeData = new Float32Array(this.boardSize);
      device.queue.writeBuffer(this.boardSizeBuffer, 0, boardSizeData);
    }
    if (simRes) {
      this.simUpdateId += 1;
      this.simRes = simRes;
      const simResData = new Uint32Array(this.simRes);
      device.queue.writeBuffer(this.simResBuffer, 0, simResData);
      this.createUVBuffer();
      this.createWOSValuesBuffer();
      this.createAllBindGroups();
      this.resetSim(false);
    }
    if (simTL) {
      this.simTL = simTL;
      const simTLData = new Float32Array(this.simTL);
      device.queue.writeBuffer(this.simTLBuffer, 0, simTLData);
    }
    if (simSize) {
      this.simSize = simSize;
      const simSizeData = new Float32Array(this.simSize);
      device.queue.writeBuffer(this.simSizeBuffer, 0, simSizeData);
    }
    if (viewRes) {
      this.viewRes = viewRes;
      const viewResData = new Uint32Array(this.viewRes);
      device.queue.writeBuffer(this.viewResBuffer, 0, viewResData);
    }
    if (viewTL) {
      this.viewTL = viewTL;
      const viewTLData = new Float32Array(this.viewTL);
      device.queue.writeBuffer(this.viewTLBuffer, 0, viewTLData);
    }
    if (viewSize) {
      this.viewSize = viewSize;
      const viewSizeData = new Float32Array(this.viewSize);
      device.queue.writeBuffer(this.viewSizeBuffer, 0, viewSizeData);
    }
    if (simulationEnabled !== undefined) {
      this.simulationEnabled = simulationEnabled;
    }
  }

  private createCircleBuffer(circles: Circle[]) {
    const circleData = new Float32Array(circles.length * 4);
    for (let i = 0; i < circles.length; i++) {
      const offset = i * 4;
      circleData[offset + 0] = circles[i].center[0]; // center.x
      circleData[offset + 1] = circles[i].center[1]; // center.y
      circleData[offset + 2] = circles[i].radius;
      circleData[offset + 3] = circles[i].boundary_value;

      if (circles[i].boundary_value < this.minMaxBvals[0]) {
        this.minMaxBvals[0] = circles[i].boundary_value;
      }

      if (circles[i].boundary_value > this.minMaxBvals[1]) {
        this.minMaxBvals[1] = circles[i].boundary_value;
      }
    }

    this.circleGeomBuffer?.destroy();
    this.circleGeomBuffer = this.device.createBuffer({
      label: "circle geo buffer",
      size: circles.length * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(this.circleGeomBuffer, 0, circleData);
  }

  private createSegmentBuffer(segments: Segment[]) {
    const segmentData = new Float32Array(segments.length * 6);
    for (let i = 0; i < segments.length; i++) {
      const offset = i * 6;
      segmentData[offset + 0] = segments[i].start[0];
      segmentData[offset + 1] = segments[i].start[1];
      segmentData[offset + 2] = segments[i].end[0];
      segmentData[offset + 3] = segments[i].end[1];
      segmentData[offset + 4] = segments[i].widthRadius;
      segmentData[offset + 5] = segments[i].boundary_value;

      this.minMaxBvals[0] = Math.min(
        this.minMaxBvals[0],
        segments[i].boundary_value
      );
      this.minMaxBvals[1] = Math.max(
        this.minMaxBvals[1],
        segments[i].boundary_value
      );
    }

    this.segmentGeomBuffer?.destroy();
    this.segmentGeomBuffer = this.device.createBuffer({
      label: "segment geo buffer",
      size: align(segments.length * 6 * 4, 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(this.segmentGeomBuffer, 0, segmentData);
  }

  private createBVHBuffers(circles: Circle[], segments: Segment[]) {
    const device = this.device;

    // BVH BUFFERS
    // DIRICHILET

    const dir_circles = circles.filter(
      (circle) => circle.boundary_type === BoundaryType.DIRICHILET
    );
    const dir_segments = segments.filter(
      (segment) => segment.boundary_type === BoundaryType.DIRICHILET
    );

    const BVH_Dir = buildBVH(dir_circles, dir_segments, 8); // CHANGE LATER
    this.bvhDirGeomsBuffer?.destroy();
    this.bvhDirGeomsBuffer = device.createBuffer({
      label: "bvh Dir geoms buffer",
      size: align(BVH_Dir.geoms.byteLength, 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bvhDirNodeBuffer?.destroy();
    this.bvhDirNodeBuffer = device.createBuffer({
      label: "bvh Dir node buffer",
      size: align(BVH_Dir.nodes.byteLength, 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // @ts-ignore
    device.queue.writeBuffer(this.bvhDirGeomsBuffer, 0, BVH_Dir.geoms);
    // @ts-ignore
    device.queue.writeBuffer(this.bvhDirNodeBuffer, 0, BVH_Dir.nodes);

    // NEUMANN
    const neu_circles = circles.filter(
      (circle) => circle.boundary_type === BoundaryType.NEUMANN
    );
    const neu_segments = segments.filter(
      (segment) => segment.boundary_type === BoundaryType.NEUMANN
    );

    const BVH_Neu = buildBVH(neu_circles, neu_segments, 8); // CHANGE LATER
    this.bvhNeuGeomsBuffer?.destroy();
    this.bvhNeuGeomsBuffer = device.createBuffer({
      label: "bvh Neu geoms buffer",
      size: align(BVH_Neu.geoms.byteLength, 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bvhNeuNodeBuffer?.destroy();
    this.bvhNeuNodeBuffer = device.createBuffer({
      label: "bvh Neu node buffer",
      size: align(BVH_Neu.nodes.byteLength, 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // @ts-ignore
    device.queue.writeBuffer(this.bvhNeuGeomsBuffer, 0, BVH_Neu.geoms);
    // @ts-ignore
    device.queue.writeBuffer(this.bvhNeuNodeBuffer, 0, BVH_Neu.nodes);
  }

  private createUVPrePipeline() {
    this.uvPre_Pipeline = this.device.createComputePipeline({
      label: "uv preprocess compute",
      layout: "auto",
      compute: {
        module: this.device.createShaderModule({ code: uvPreCompute }),
        entryPoint: "main",
      },
    });
  }

  private createSimPropertiesBuffers() {
    const device = this.device;

    this.simResBuffer?.destroy();
    this.simResBuffer = device.createBuffer({
      label: "Sim Res Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simResData = new Uint32Array(this.simRes);
    device.queue.writeBuffer(this.simResBuffer, 0, simResData);

    this.simTLBuffer?.destroy();
    this.simTLBuffer = device.createBuffer({
      label: "Sim TL Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simTLData = new Float32Array(this.simTL);
    device.queue.writeBuffer(this.simTLBuffer, 0, simTLData);

    this.simSizeBuffer?.destroy();
    this.simSizeBuffer = device.createBuffer({
      label: "Sim Size Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simSizeData = new Float32Array(this.simSize);
    device.queue.writeBuffer(this.simSizeBuffer, 0, simSizeData);
  }

  private createBoardPropertiesBuffers() {
    const device = this.device;

    this.boardTLBuffer?.destroy();
    this.boardTLBuffer = device.createBuffer({
      label: "Board TL Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const boardTLData = new Float32Array(this.boardTL);
    device.queue.writeBuffer(this.boardTLBuffer, 0, boardTLData);

    this.boardSizeBuffer?.destroy();
    this.boardSizeBuffer = device.createBuffer({
      label: "Board Size Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const boardSizeData = new Float32Array(this.boardSize);
    device.queue.writeBuffer(this.boardSizeBuffer, 0, boardSizeData);
  }

  private createUVPrePipelineBindGroups() {
    this.domainSizeBindGroup_uvPre = this.device.createBindGroup({
      label: "domain size uvPre bg",
      layout: this.uvPre_Pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.boardTLBuffer } },
        { binding: 4, resource: { buffer: this.boardSizeBuffer } },
        { binding: 5, resource: { buffer: this.circleGeomBuffer } },
        { binding: 6, resource: { buffer: this.segmentGeomBuffer } },
      ],
    });

    this.uvBindGroup_uvPre = this.device.createBindGroup({
      label: "uv bg compute",
      layout: this.uvPre_Pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.uvBuffer } }],
    });

    this.bvhBindGroup_uvPre = this.device.createBindGroup({
      label: "bvh uvPre BG",
      layout: this.uvPre_Pipeline.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: this.bvhDirGeomsBuffer } },
        { binding: 1, resource: { buffer: this.bvhDirNodeBuffer } },
        { binding: 2, resource: { buffer: this.bvhNeuGeomsBuffer } },
        { binding: 3, resource: { buffer: this.bvhNeuNodeBuffer } },
      ],
    });
  }

  private createUVBuffer() {
    // THIS STORES UVs ON SCREEN FOR QUEERY POINTS
    this.uvBuffer?.destroy();
    this.uvBuffer = this.device.createBuffer({
      label: "uv buffer",
      size: align(this.simRes[0] * this.simRes[1] * 8, 16),
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
  }

  private createWOSPipeline() {
    this.wos_pipeline = this.device.createComputePipeline({
      label: "wos compute",
      layout: "auto",
      compute: {
        module: this.device.createShaderModule({ code: wosCompute }),
        entryPoint: "main",
      },
    });
  }

  private createWalkCountBuffer() {
    this.walkCountBuffer?.destroy();
    this.walkCountBuffer = this.device.createBuffer({
      label: "Walk Count Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createWOSValuesBuffer() {
    const device = this.device;
    this.wosValuesBuffer?.destroy();
    this.wosValuesBuffer = device.createBuffer({
      label: "wos values buffer",
      size: align(this.simRes[0] * this.simRes[1] * 4, 16),
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
  }

  private createWOSPipelineBindGroups() {
    const device = this.device;

    this.domainSizeBindGroup_wos = device.createBindGroup({
      label: "domain size wos bg",
      layout: this.wos_pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.boardTLBuffer } },
        { binding: 4, resource: { buffer: this.boardSizeBuffer } },
        { binding: 5, resource: { buffer: this.walkCountBuffer } },
        { binding: 6, resource: { buffer: this.circleGeomBuffer } },
        { binding: 7, resource: { buffer: this.segmentGeomBuffer } },
      ],
    });

    this.uvBindGroup_compute = device.createBindGroup({
      label: "uv bg compute",
      layout: this.wos_pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.uvBuffer } },
        { binding: 1, resource: { buffer: this.wosValuesBuffer } },
      ],
    });

    this.bvhBindGroup_compute = device.createBindGroup({
      label: "bvh bind group compute",
      layout: this.wos_pipeline.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: this.bvhDirGeomsBuffer } },
        { binding: 1, resource: { buffer: this.bvhDirNodeBuffer } },
        { binding: 2, resource: { buffer: this.bvhNeuGeomsBuffer } },
        { binding: 3, resource: { buffer: this.bvhNeuNodeBuffer } },
      ],
    });
  }

  private createWOSRenderPipeline() {
    const device = this.device;
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
  }

  private createViewProperitiesBuffers() {
    const device = this.device;

    this.viewResBuffer?.destroy();
    this.viewResBuffer = device.createBuffer({
      label: "View Res Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewResData = new Uint32Array(this.viewRes);

    device.queue.writeBuffer(this.viewResBuffer, 0, viewResData);

    this.viewTLBuffer?.destroy();
    this.viewTLBuffer = device.createBuffer({
      label: "View TL Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewTLData = new Float32Array(this.viewTL);

    device.queue.writeBuffer(this.viewTLBuffer, 0, viewTLData);

    this.viewSizeBuffer?.destroy();
    this.viewSizeBuffer = device.createBuffer({
      label: "View Size Buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const viewSizeData = new Float32Array(this.viewSize);
    device.queue.writeBuffer(this.viewSizeBuffer, 0, viewSizeData);
  }

  private createMinMaxBValsBuffer() {
    const device = this.device;

    this.minMaxBValsBuffer?.destroy();
    this.minMaxBValsBuffer = device.createBuffer({
      label: "min max bval buffer",
      size: 16, // 16 Byte Alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(
      this.minMaxBValsBuffer,
      0,
      new Float32Array(this.minMaxBvals)
    );
  }

  private createWOSRenderBindGroups() {
    this.domainSizeBindGroup_frag = this.device.createBindGroup({
      label: "domain size frag bg",
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simResBuffer } },
        { binding: 1, resource: { buffer: this.simTLBuffer } },
        { binding: 2, resource: { buffer: this.simSizeBuffer } },
        { binding: 3, resource: { buffer: this.boardTLBuffer } },
        { binding: 4, resource: { buffer: this.boardSizeBuffer } },
        { binding: 5, resource: { buffer: this.viewResBuffer } },
        { binding: 6, resource: { buffer: this.viewTLBuffer } },
        { binding: 7, resource: { buffer: this.viewSizeBuffer } },
        { binding: 8, resource: { buffer: this.walkCountBuffer } },
        { binding: 9, resource: { buffer: this.minMaxBValsBuffer } },
      ],
    });

    this.uvBindGroup_frag = this.device.createBindGroup({
      label: "uv bg frag",
      layout: this.renderPipeline.getBindGroupLayout(1),
      entries: [
        // { binding: 0, resource: { buffer: this.uvBuffer } },
        { binding: 0, resource: { buffer: this.wosValuesBuffer } },
      ],
    });
  }

  private createAllBindGroups() {
    this.createUVPrePipelineBindGroups();
    this.createWOSPipelineBindGroups();
    this.createWOSRenderBindGroups();
  }

  updateGeometry(circles: Circle[], segments: Segment[]) {
    this.simUpdateId += 1; // prevent renders during this time
    this.minMaxBvals = [Number.MAX_VALUE, Number.MIN_VALUE];

    // geom buffers
    this.createCircleBuffer(circles);
    this.createSegmentBuffer(segments);

    this.device.queue.writeBuffer(
      this.minMaxBValsBuffer,
      0,
      new Float32Array(this.minMaxBvals)
    );

    // bvh
    this.createBVHBuffers(circles, segments);

    // recreate bind groups

    this.createAllBindGroups();

    this.resetSim(false);
  }

  resetSim(updateSimId: boolean = true) {
    if (updateSimId) {
      this.simUpdateId++;
    }
    this.simulationEnabled = true;
    this.totalWalks = 0;
    this.device.queue.writeBuffer(
      this.wosValuesBuffer,
      0,
      new Float32Array(this.wosValuesBuffer.size / 4).fill(0)
    );
    this.uvPreprocessNeeded = true;
    requestAnimationFrame(() => this.frame(this.simUpdateId));
  }

  private frame(simUpdateId: number) {
    // console.log("frame: ", simUpdateId, " and ", this.simUpdateId);
    // if (simUpdateId !== this.simUpdateId) {
    //   console.log("frame: ", simUpdateId, " != ", this.simUpdateId);
    //   return;
    // }

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fpsCallback(this.frameCount);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    const canvas = this.canvas;
    const context = this.context;
    const device = this.device;

    const commandEncoder = device.createCommandEncoder();
    if (this.simulationEnabled) {
      if (this.uvPreprocessNeeded) {
        console.log("UV PRE RAN");
        const uvPreComputePass = commandEncoder.beginComputePass();
        uvPreComputePass.setPipeline(this.uvPre_Pipeline);
        uvPreComputePass.setBindGroup(0, this.domainSizeBindGroup_uvPre);
        uvPreComputePass.setBindGroup(1, this.uvBindGroup_uvPre);
        uvPreComputePass.setBindGroup(2, this.bvhBindGroup_uvPre);

        const wgSize_Pre = 8;
        const dispatchX_Pre = Math.ceil(this.simRes[0] / wgSize_Pre);
        const dispatchY_Pre = Math.ceil(this.simRes[1] / wgSize_Pre);
        uvPreComputePass.dispatchWorkgroups(dispatchX_Pre, dispatchY_Pre);
        uvPreComputePass.end();
        this.uvPreprocessNeeded = false;
      }

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
    }
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
