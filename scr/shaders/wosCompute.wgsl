@group(0) @binding(0) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(0) var<storage, read_write> index_list: array<u32>;
@group(1) @binding(1) var<storage, read_write> uv_list: array<vec2f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let coords = vec2i(id.xy);
  let texSize = textureDimensions(outputTex);
  if (u32(coords.x) >= texSize.x || u32(coords.y) >= texSize.y) {
    return;
  }

  let index = id.y * texSize.x + id.x;
  
  let uv = vec2f(f32(coords.x), f32(coords.y)) / vec2f(f32(texSize.x), f32(texSize.y));
  
  index_list[index] = index;
  uv_list[index] = uv;

  // Distance from center
  let center = vec2f(0.5, 0.5);
  let dist = length(uv - center);
  if (dist > 0.5) {
    textureStore(outputTex, coords, vec4f(-1.0, -1.0, -1.0, 1));
  } else {
    textureStore(outputTex, coords, vec4f(dist, dist, dist, 1));
  }
  
  
}