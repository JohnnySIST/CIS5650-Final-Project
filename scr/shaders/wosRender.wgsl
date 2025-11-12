@group(0) @binding(0) var computeTexture: texture_2d<f32>;
@group(0) @binding(1) var texSampler: sampler;

@group(1) @binding(0) var<storage, read> uv_list: array<vec2f>;

@vertex
fn vertMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let x = f32((vertexIndex << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vertexIndex & 2u) * 2.0 - 1.0;
    return vec4f(x, y, 0, 1);
}
      
@fragment
fn fragMain(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let texSize = textureDimensions(computeTexture);
    let index = u32(pos.y) * texSize.x + u32(pos.x);
    let wahoo = uv_list[index];
    let uv = wahoo;// pos.xy / vec2f(f32(texSize.x), f32(texSize.y));
    let temp = textureSample(computeTexture, texSampler, uv).r;
    return vec4f(temp, temp, temp, 1.0);
}

