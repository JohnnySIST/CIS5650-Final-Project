struct Circle {
    center: vec2f,
    radius: f32,
    boundary_value: f32
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
@group(0) @binding(3) var<uniform> boardTL: vec2f;
@group(0) @binding(4) var<uniform> boardSize: vec2f;
@group(0) @binding(5) var<storage> circles: array<Circle>;
@group(0) @binding(6) var<storage> segments: array<Segment>;

@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;

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

    while stack_ptr >= 0 {
        iterations += 1u;
        if iterations > 200u { break; }

        let node_idx = stack[u32(stack_ptr)];
        stack_ptr -= 1;

        if node_idx >= arrayLength(&bvhNodes) { continue; }

        let node = bvhNodes[node_idx];
    
    // PRUNE FAR SUBTREES
        let bbox_dist = distanceToAABB(pos, node.bbox_min, node.bbox_max);
        if bbox_dist > abs(closest_dist) {
      continue;
        }

        if node.is_leaf == 1u {
      // TEST FOR LEAF
            for (var i = 0u; i < node.geom_count; i++) {
                let geom_idx = node.geom_start + i;
                if geom_idx >= arrayLength(&bvhGeo) { break; }

                let geom = bvhGeo[geom_idx];

                var dist: f32;
                var bVal: f32;

                if geom.geoType == 0u {
                    if geom.index >= arrayLength(&circles) { continue; }
                    let circle = circles[geom.index];
                    dist = length(pos - circle.center) - circle.radius;
                    bVal = circle.boundary_value;
                } else {
                    if geom.index >= arrayLength(&segments) { continue; }
                    let segment = segments[geom.index];
                    dist = distanceToSegment(pos, segment);
                    bVal = segment.boundary_value;
                }
        
        // UPDATE CLOSEST POINT
                if dist < closest_dist {
                    closest_dist = dist;
                    closest_boundary_value = bVal;
                }
            }
        } else {
        // RECURSE ON CHILDREN
            if node.left_child != 0xFFFFFFFFu && node.left_child < arrayLength(&bvhNodes) && stack_ptr < 30 {
                let left_node = bvhNodes[node.left_child];
                let left_bbox_dist = distanceToAABB(pos, left_node.bbox_min, left_node.bbox_max);

                if left_bbox_dist <= abs(closest_dist) {
                    stack_ptr += 1;
                    stack[u32(stack_ptr)] = node.left_child;
                }
            }

            if node.right_child != 0xFFFFFFFFu && node.right_child < arrayLength(&bvhNodes) && stack_ptr < 30 {
                let right_node = bvhNodes[node.right_child];
                let right_bbox_dist = distanceToAABB(pos, right_node.bbox_min, right_node.bbox_max);

                if right_bbox_dist <= abs(closest_dist) {
                    stack_ptr += 1;
                    stack[u32(stack_ptr)] = node.right_child;
                }
            }
        }
    }

    return vec2f(closest_dist, closest_boundary_value);
}

fn distanceToBoundary(worldPos: vec2f) -> f32 {
    let texSizef = vec2f(f32(simRes.x), f32(simRes.y));

    let boardBR = boardTL + boardSize;

    let boxDist = min(
        min(worldPos.x - boardTL.x, boardBR.x - worldPos.x),
        min(worldPos.y - boardTL.y, boardBR.y - worldPos.y)
    );

    // NAIVE CHECKING ALL BOUNDARIES
    // var circleDistFinal = length(worldPos - circles[0].center) - circles[0].radius;
    // for (var i = 1u; i < arrayLength(&circles); i++) {
    //     circleDistFinal = min(circleDistFinal, length(worldPos - circles[i].center) - circles[i].radius);
    // }

    // var segmentDistFinal = distanceToSegment(worldPos, segments[0]);
    // for (var i = 1u; i < arrayLength(&segments); i++) {
    //     segmentDistFinal = min(segmentDistFinal, distanceToSegment(worldPos, segments[i]));
    // }
    // return min(min(boxDist, circleDistFinal), segmentDistFinal);
    //return min(boxDist, geoDist);

   
    // BVH CHECK
    let bvhResult = queryBVH(worldPos);
    return min(boxDist, bvhResult[0]);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let coords = vec2i(id.xy);

    if u32(coords.x) >= simRes.x || u32(coords.y) >= simRes.y {
        return;
    }

    let index = id.y * simRes.x + id.x;

    let uv = vec2f(coords) / vec2f(simRes); // [0,1]

    let worldPos = uv * simSize + simTL ; // [simTL, simSize + simTL]

    let dist = distanceToBoundary(worldPos);

    uv_list[index] = uv;
    if dist < 0.0 {
        uv_list[index] = vec2f(-1.0, -1.0);
    }
}
  
