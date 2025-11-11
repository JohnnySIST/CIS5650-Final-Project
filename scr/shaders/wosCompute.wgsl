@group(0) @binding(0) var outputTex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let coords = vec2i(id.xy);
  let texSize = textureDimensions(outputTex);
  let uv = vec2f(f32(coords.x), f32(coords.y)) / vec2f(f32(texSize.x), f32(texSize.y));
  textureStore(outputTex, coords, vec4f(uv.x, 0, 0, 1));
}