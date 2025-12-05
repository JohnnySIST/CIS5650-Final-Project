struct Circle {
    center: vec2f,
    radius: f32,
    boundary_value: f32 // ASSUME DIRCHLE BOUNDARY FOR NOW 
}

struct NeumannHit {
    dist: f32,
    normal: vec2f,
    flux: f32
}

struct Segment {
    start: vec2f,
    end: vec2f,
    widthRadius: f32,
    boundary_value: f32
}

struct Geom {
  geoType: u32,
  index: u32,
}

struct BVHNode {
  bbox_min: vec2f,
  bbox_max: vec2f,
  
  is_leaf: u32,
  geom_start: u32,
  geom_count: u32,
  
  left_child: u32,
  right_child: u32,

  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> simRes: vec2u;
@group(0) @binding(1) var<uniform> simTL: vec2f;
@group(0) @binding(2) var<uniform> simSize: vec2f;
@group(0) @binding(3) var<uniform> totalWalks: u32;
@group(0) @binding(4) var<storage> circles: array<Circle>;
@group(0) @binding(5) var<storage> segments: array<Segment>;

@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;
@group(1) @binding(1) var<storage, read_write> wos_valueList: array<f32>;

// @group(2) @binding(0) var<uniform> gridRes: vec2u;
// @group(2) @binding(1) var<storage> gridCells: array<u32>;
// @group(2) @binding(2) var<storage> gridGeoms: array<u32>;

@group(2) @binding(0) var<storage> bvhGeo: array<Geom>;
@group(2) @binding(1) var<storage> bvhNodes: array<BVHNode>;

fn distanceToSegment(worldPos: vec2f, segment: Segment) -> f32 {
    let AB = segment.end - segment.start;
    let AP = worldPos - segment.start;
    let t = dot(AP, AB) / dot(AB, AB);

    var dist = length(AP - AB * t);

    if t < 0.0 {
        dist = length(AP);
    } else if t > 1.0 {
        dist = length(worldPos - segment.end);
    }

    return dist - segment.widthRadius;
}

// fn randomFloat(state: ptr<function, u32>) -> f32 {
//     let a = 1664525u;
//     let c = 1013904223u;
//     *state = (*state * a + c);
//     return f32(*state) / 4294967296.0;
// }

fn pcg(state: ptr<function, u32>) -> u32 {
    let old = *state;
    *state = old * 747796405u + 2891336453u;
    let word = ((old >> ((old >> 28u) + 4u)) ^ old) * 277803737u;
    return (word >> 22u) ^ word;
}

fn randomFloat(state: ptr<function, u32>) -> f32 {
    return f32(pcg(state)) / 4294967296.0;
}

// Distance from point to AABB (0 if inside, distance to nearest edge if outside)
fn distanceToAABB(point: vec2f, bbox_min: vec2f, bbox_max: vec2f) -> f32 {
  let dx = max(max(bbox_min.x - point.x, 0.0), point.x - bbox_max.x);
  let dy = max(max(bbox_min.y - point.y, 0.0), point.y - bbox_max.y);
  return sqrt(dx * dx + dy * dy);
}

fn queryBVH(pos: vec2f) -> vec2f {
  var stack_ptr: i32 = 0;
  var stack: array<u32, 32>;
  stack[0] = 0u;
  
  var closest_dist = 1e10;
  var closest_boundary_value = 0.0;
  
  var iterations = 0u;
  
  while (stack_ptr >= 0) {
    iterations += 1u;
    if (iterations > 200u) { break; } // Safety
    
    let node_idx = stack[u32(stack_ptr)];
    stack_ptr -= 1;
    
    if (node_idx >= arrayLength(&bvhNodes)) { continue; }
    
    let node = bvhNodes[node_idx];
    
    // CRITICAL: Early exit if bbox is farther than current best
    let bbox_dist = distanceToAABB(pos, node.bbox_min, node.bbox_max);
    if (bbox_dist > abs(closest_dist)) {
      continue; // Skip this entire subtree
    }
    
    if (node.is_leaf == 1u) {
      // Test geometries in leaf
      for (var i = 0u; i < node.geom_count; i++) {
        let geom_idx = node.geom_start + i;
        if (geom_idx >= arrayLength(&bvhGeo)) { break; }
        
        let geom = bvhGeo[geom_idx];
        
        var dist: f32;
        var bVal: f32;
        
        if (geom.geoType == 0u) {
          if (geom.index >= arrayLength(&circles)) { continue; }
          let circle = circles[geom.index];
          dist = length(pos - circle.center) - circle.radius;
          bVal = circle.boundary_value;
        } else {
          if (geom.index >= arrayLength(&segments)) { continue; }
          let segment = segments[geom.index];
          dist = distanceToSegment(pos, segment);
          bVal = segment.boundary_value;
        }
        
        // Update closest (use abs for signed distance)
        if (abs(dist) < abs(closest_dist)) {
          closest_dist = dist;
          closest_boundary_value = bVal;
        }
      }
    } else {
      // Interior node - push children if they might be closer
        if (node.left_child != 0xFFFFFFFFu && node.left_child < arrayLength(&bvhNodes) && stack_ptr < 30) {
            let left_node = bvhNodes[node.left_child];
            let left_bbox_dist = distanceToAABB(pos, left_node.bbox_min, left_node.bbox_max);
            
            if (left_bbox_dist <= abs(closest_dist)) {
            stack_ptr += 1;
            stack[u32(stack_ptr)] = node.left_child;
            }
        }
        
        if (node.right_child != 0xFFFFFFFFu && node.right_child < arrayLength(&bvhNodes) && stack_ptr < 30) {
            let right_node = bvhNodes[node.right_child];
            let right_bbox_dist = distanceToAABB(pos, right_node.bbox_min, right_node.bbox_max);
            
            if (right_bbox_dist <= abs(closest_dist)) {
            stack_ptr += 1;
            stack[u32(stack_ptr)] = node.right_child;
            }
        }
    }
  }
  
  return vec2f(closest_dist, closest_boundary_value);
}

fn naiveClosestPoint(pos: vec2f) -> vec2f {
    var circleDistFinal = length(pos - circles[0].center) - circles[0].radius;
    var circlebValFinal = circles[0].boundary_value;
    for (var i = 1u; i < arrayLength(&circles); i++) {
        let curDist = length(pos - circles[i].center) - circles[i].radius;
        if curDist < circleDistFinal {
            circleDistFinal = curDist;
            circlebValFinal = circles[i].boundary_value;
        }
    }
    var segmentDistFinal = distanceToSegment(pos, segments[0]);
    var segmentbValFinal = segments[0].boundary_value;
    for (var i = 1u; i < arrayLength(&segments); i++) {
        let curDist = distanceToSegment(pos, segments[i]);
        if curDist < segmentDistFinal {
            segmentDistFinal = curDist;
            segmentbValFinal = segments[i].boundary_value;
        }
    }

    var result = vec2f(circleDistFinal, circlebValFinal);

    if (segmentDistFinal < circleDistFinal) {
        result = vec2f(segmentDistFinal, segmentbValFinal);
    }

    return result;
}

// REGULAR WoS
fn distanceToBoundaryWoS(pos: vec2f) -> vec2f {
    let simBR = simTL + simSize;

    let boxDist = min(
        min(pos.x - simTL.x, simBR.x - pos.x),
        min(pos.y - simTL.y, simBR.y - pos.y)
    );

    let magic = bvhGeo[0];
    let moreMagic = bvhNodes[0];
    
    var result = queryBVH(pos);//naiveClosestPoint(pos);
    if (boxDist < result[0]) {
        result[0] = boxDist;
        result[1] = 0.0;
    }

    return result;
}

fn walkOnSpheres(startPos: vec2f, rngState: ptr<function, u32>) -> f32 {
    var pos = startPos;
    var temp = 0.0;
    let epsilon = 0.1; // was 2.0
    let maxSteps = 20;

    for (var step = 0; step < maxSteps; step++) {
        let boundaryResult = distanceToBoundaryWoS(pos);
        let dist = boundaryResult[0];
        temp = boundaryResult[1];

        if dist < epsilon {
            return temp;
        }

        let angle = randomFloat(rngState) * 6.28318530718;
        let offset = vec2f(cos(angle), sin(angle)) * dist * 0.99;
        pos += offset;
    }

    return temp;
}

// WALK ON STARS
fn dTBDirichlet(pos: vec2f) -> vec2f {
    var circleDistFinal = length(pos - circles[0].center) - circles[0].radius;
    var circlebValFinal = circles[0].boundary_value;
    for (var i = 1u; i < arrayLength(&circles); i++) {
        let curDist = length(pos - circles[i].center) - circles[i].radius;
        if curDist < circleDistFinal {
            circleDistFinal = curDist;
            circlebValFinal = circles[i].boundary_value;
        }
    }
    // var segmentDistFinal = distanceToSegment(pos, segments[0]);
    // var segmentbValFinal = segments[0].boundary_value;
    // for (var i = 1u; i < arrayLength(&segments); i++) {
    //     let curDist = distanceToSegment(pos, segments[i]);
    //     if curDist < segmentDistFinal {
    //         segmentDistFinal = curDist;
    //         segmentbValFinal = segments[i].boundary_value;
    //     }
    // }
    var result = vec2f(circleDistFinal, circlebValFinal);
    // if (segmentDistFinal < circleDistFinal) {
    //     result = vec2f(segmentDistFinal, segmentbValFinal);
    // }

    return result;
}

fn disttanceToCircleNeumann(worldPos: vec2f, circle: Circle) -> NeumannHit {
    let circleDist = length(worldPos - circle.center) - circle.radius;
    let circleNorm = normalize(worldPos - circle.center);
    let circleFlux = circle.boundary_value;

    return NeumannHit(
        circleDist,
        circleNorm,
        circleFlux
    );
}

fn distanceToSegmentNeumann(worldPos: vec2f, segment: Segment) -> NeumannHit {
    let AB = segment.end - segment.start;
    let AP = worldPos - segment.start;
    let t = dot(AP, AB) / dot(AB, AB);

    var dist = length(AP - AB * t);

    if t < 0.0 {
        dist = length(AP);
    } else if t > 1.0 {
        dist = length(worldPos - segment.end);
    }

    let segDist = dist - segment.widthRadius;
    let segFlux = 0.0;//segment.boundary_value;
    var segNorm = normalize(vec2f(-AB.y, AB.x));

    if (dot(segNorm, AP) > 0.0) {
        segNorm *= -1.0;
    }

    return NeumannHit(
        segDist,
        segNorm,
        segFlux
    );
}

fn dTBNeumann(pos: vec2f) -> NeumannHit {
    let simBR = simTL + simSize;
    let flux = 0.0; // BOUNDARY FLUX 0 

    let dLeft = pos.x - simTL.x;
    let dRight = simBR.x - pos.x;
    let dBottom = pos.y - simTL.y;
    let dTop = simBR.y - pos.y;

    let boxDist = min(
        min(pos.x - simTL.x, simBR.x - pos.x),
        min(pos.y - simTL.y, simBR.y - pos.y)
    );

    let center = simTL + simBR * 0.5;
    var boxNormal = vec2f(0.0);
    if abs(((pos - center)).x) > abs((pos - center).y) {
        let x = ((pos - center).x) / abs((pos - center).x);
        boxNormal = vec2f(x, 0.0);
    } else {
        let y = ((pos - center).y) / abs((pos - center).y);
        boxNormal = vec2f(y, 0.0);
    }

    var segmentFinal = distanceToSegmentNeumann(pos, segments[0]);
    for (var i = 1u; i < arrayLength(&segments); i++) {
        let curSeg = distanceToSegmentNeumann(pos, segments[i]);
        if curSeg.dist < segmentFinal.dist {
            segmentFinal = curSeg;
        }
    }

    if (segmentFinal.dist < boxDist) {
        return segmentFinal;
    } else {
        return NeumannHit(
            boxDist,
            boxNormal,
            flux
        );
    }
}

fn sampleHemisphere(normal: vec2f, rngState: ptr<function, u32>) -> vec2f {
    let u = randomFloat(rngState);
    let localAngle = (u - 0.5) * 3.14159265;

    let normalAngle = atan2(normal.y, normal.x);
    let worldAngle = normalAngle + localAngle;
    
    return vec2f(cos(worldAngle), sin(worldAngle));
}

fn walkOnStars(startPos: vec2f, rngState: ptr<function, u32>) -> f32 {
    var pos = startPos;
    var accumulatedFlux = 0.0;
    let epsilon = 0.08;
    let rMin = 0.08;
    let maxSteps = 20;

    // REMOVE THESE WHITH BVH REMOVEALL:
    let magic = bvhGeo[0];
    let moreMagic = bvhNodes[0];

    for (var step = 0; step < maxSteps; step++) {
        let boundaryResult = dTBDirichlet(pos);
        let dist = boundaryResult[0];
        let temp = boundaryResult[1];

        if dist < epsilon {
            return temp + accumulatedFlux;
        }

        let n1 = dTBNeumann(pos);
        let starRadius = min(dist, n1.dist) * 0.99;

        var dir: vec2f;
        if (n1.dist < dist && n1.dist < epsilon * 2.0) {
            dir = sampleHemisphere(n1.normal, rngState);
        } else {
            let angle = randomFloat(rngState) * 6.28318530718;
            dir = vec2f(cos(angle), sin(angle));
        }


        let offset = pos + dir * starRadius;

        let n2 = dTBNeumann(offset);

        if (n1.dist * n2.dist < 0.0) {
            pos = pos + dir * n1.dist * 0.99;
            dir = sampleHemisphere(n1.normal, rngState);
            accumulatedFlux += n1.flux * n1.dist * 0.31831;
        } else {
            pos = offset;
        }
    }

    return accumulatedFlux;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let index = id.y * simRes.x + id.x;
    let uv = uv_list[index];//vec2f(f32(coords.x), f32(coords.y)) / vec2f(f32(texSize.x), f32(texSize.y));
    let coords = vec2u(id.xy);
    if coords.x >= simRes.x || coords.y >= simRes.y {
        return;
    }

  // IGNOR UVs FOR QUEERY POINTS NOT IN BOUNDARY
  // CHANGE LATER SO THREADS NEVER RUN ON THESE TYPES OF POINTS (Stream Compaction :D)
    if uv.x < 0.0 || uv.y < 0.0 {
        wos_valueList[index] = -1.0;
        return;
    }

    let worldPos = uv * simSize + simTL;

    let numWalks = 1u; // UPDATE totalWalks in render.ts if you change this
    var totalTemp = 0.0;
    var seed = coords.x * 747796405u + coords.y * 2891336453u * totalWalks;

    for (var i = 0u; i < numWalks; i++) {
        let temp =  walkOnStars(worldPos, &seed);//walkOnSpheres(worldPos, &seed);//
        totalTemp += temp;
    }

    let avgTemp = totalTemp;// / f32(numWalks);

    wos_valueList[index] += avgTemp;
}