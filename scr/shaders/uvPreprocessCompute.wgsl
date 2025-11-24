struct Circle {
    center: vec2f,
    radius: f32,
    boundary_value: f32 // ASSUME DIRCHLE BOUNDARY FOR NOW 
}

@group(0) @binding(0) var<uniform> domainDim: vec2u;
@group(0) @binding(1) var<storage> circles: array<Circle>;
@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;


fn distanceToBoundary(pos: vec2f, texSize: vec2u) -> f32 {
  let texSizef = vec2f(f32(texSize.x), f32(texSize.y));
  
  // REPLACE BOX WITH THE USER DEFINED BOUNDARY. IF NOTHING, MAKE IT SCREEN SIZE
  let boxMin = texSizef * 0.05;
  let boxMax = texSizef * 0.95;

  let boxDist = min(
    min(pos.x - boxMin.x, boxMax.x - pos.x),
    min(pos.y - boxMin.y, boxMax.y - pos.y)
  );

  // FOR NOW DO CENTER POS IS DISTANCE FROM CENTER OF SCREEN
  var circleDistFinal = length(pos - (texSizef * 0.5 + circles[0].center * texSizef * 0.5)) - circles[0].radius * length(texSizef) * 0.5;
  for (var i = 1u; i < arrayLength(&circles); i++) {
    circleDistFinal = min(circleDistFinal, length(pos - (texSizef * 0.5 + circles[i].center * texSizef * 0.5)) - circles[i].radius * length(texSizef) * 0.5);
  }
  
  return min(boxDist, circleDistFinal);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let coords = vec2i(id.xy);
  let texSize = domainDim;
  
  if (u32(coords.x) >= texSize.x || u32(coords.y) >= texSize.y) {
    return;
  }

  let index = id.y * texSize.x + id.x;
  let uv = vec2f(f32(coords.x), f32(coords.y)) / vec2f(f32(texSize.x), f32(texSize.y));

  let worldPos = vec2f(f32(coords.x), f32(coords.y));
  
  let dist = distanceToBoundary(worldPos, texSize);

  // ONLY STORE UVs WITHIN OUR DOMAIN 
  uv_list[index] = uv;
  if (dist < 0.0) {
    uv_list[index] = vec2f(-1.0, -1.0);
  }
}
  
