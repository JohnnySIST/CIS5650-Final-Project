struct Circle {
    center: vec2f,
    radius: f32,
    boundary_value: f32 // ASSUME DIRCHLE BOUNDARY FOR NOW 
}

@group(0) @binding(0) var<uniform> simRes: vec2u;
@group(0) @binding(1) var<uniform> simTL: vec2f;
@group(0) @binding(2) var<uniform> simSize: vec2f;
@group(0) @binding(3) var<storage> circles: array<Circle>;
@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;


fn distanceToBoundary(worldPos: vec2f) -> f32 {
    let texSizef = vec2f(f32(simRes.x), f32(simRes.y));

    let simBR = simTL + simSize;

    let boxDist = min(
        min(worldPos.x - simTL.x, simBR.x - worldPos.x),
        min(worldPos.y - simTL.y, simBR.y - worldPos.y)
    );

    var circleDistFinal = length(worldPos - circles[0].center) - circles[0].radius;
    for (var i = 1u; i < arrayLength(&circles); i++) {
        circleDistFinal = min(circleDistFinal, length(worldPos - circles[i].center) - circles[i].radius);
    }

    return min(boxDist, circleDistFinal);
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
  
