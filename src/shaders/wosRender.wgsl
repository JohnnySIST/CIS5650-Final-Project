@group(0) @binding(0) var<uniform> domainDim: vec2u;
@group(0) @binding(1) var<uniform> totalWalks: u32;
@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;
@group(1) @binding(1) var<storage, read_write> wos_valueList: array<f32>;

@vertex
fn vertMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let x = f32((vertexIndex << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vertexIndex & 2u) * 2.0 - 1.0;
    return vec4f(x, y, 0, 1);
}

fn color(a: vec3f, b: vec3f, c: vec3f, d: vec3f, t: f32) -> vec3f {
    return a + b * (cos(2.0 * 3.141592 * (c *  t + d)));
}

fn twoToneColor(t: f32) -> vec3f {
  let blue = vec3f(0.2, 0.0, 1.0);
  let red = vec3f(1.0, 0.2, 0.4);
  return mix(blue, red, t);
}
      
@fragment
fn fragMain(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let texSize = domainDim;
    let index = u32(pos.y) * texSize.x + u32(pos.x);
    let wahoo = uv_list[index];
    let uv = wahoo;// pos.xy / vec2f(f32(texSize.x), f32(texSize.y));
    let pixelCoord = vec2i(uv * vec2f(f32(texSize.x), f32(texSize.y)));
    let temp = wos_valueList[index];
    if (temp < 0.0) {
        return vec4f(0, 0, 0, 1.0);
    } else {
        //twoToneColor(temp / f32(totalWalks));
        let outColor = color(vec3f(0.5,0.5,0.5), vec3f(0.5, 0.5, 0.5), vec3f(1.0, 1.0, 1.0), vec3f(0.00, 0.33, 0.67), temp / f32(totalWalks));
        return vec4f(outColor, 1.0);
    }
}

