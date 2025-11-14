@group(0) @binding(0) var<uniform> domainDim: vec2u;
@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;

fn distanceToBoundary(pos: vec2f, texSize: vec2u) -> f32 {
  let texSizef = vec2f(f32(texSize.x), f32(texSize.y));
  
  let boxMin = texSizef * 0.1;
  let boxMax = texSizef * 0.9;

  let boxDist = min(
    min(pos.x - boxMin.x, boxMax.x - pos.x),
    min(pos.y - boxMin.y, boxMax.y - pos.y)
  );
  
  // Circle 1
  var circleCenter = texSizef * 0.5;
  circleCenter.y += 400.0;
  let circleRadius = min(texSizef.x, texSizef.y) * 0.2;
  let circleDist = length(pos - circleCenter) - circleRadius;

  // Circle 2
  var circleCenter2 = texSizef * 0.5;
  circleCenter2.y -= 400.0;
  circleCenter2.x -= 100.0;
  let circleRadius2 = min(texSizef.x, texSizef.y) * 0.1;
  let circleDist2 = length(pos - circleCenter2) - circleRadius2;
  
  let circleDistFinal = min(circleDist, circleDist2);
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
  
