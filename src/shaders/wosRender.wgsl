@group(0) @binding(0) var<uniform> simRes: vec2u;
@group(0) @binding(1) var<uniform> simTL: vec2f;
@group(0) @binding(2) var<uniform> simSize: vec2f;
@group(0) @binding(3) var<uniform> boardTL: vec2f;
@group(0) @binding(4) var<uniform> boardSize: vec2f;
@group(0) @binding(5) var<uniform> viewRes: vec2u;
@group(0) @binding(6) var<uniform> viewTL: vec2f;
@group(0) @binding(7) var<uniform> viewSize: vec2f;
@group(0) @binding(8) var<uniform> totalWalks: u32;
@group(0) @binding(9) var<uniform> minMaxBVals: vec2f;

// @group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;
@group(1) @binding(0) var<storage, read_write> wos_valueList: array<f32>;

@vertex
fn vertMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let x = f32((vertexIndex << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vertexIndex & 2u) * 2.0 - 1.0;
    return vec4f(x, y, 0.0, 1.0);
}

fn color(a: vec3f, b: vec3f, c: vec3f, d: vec3f, t: f32) -> vec3f {
    return a + b * (cos(2.0 * 3.141592 * (c * t + d)));
}

fn twoToneColor(t: f32) -> vec3f {
    let blue = vec3f(0.2, 0.0, 1.0);
    let red = vec3f(1.0, 0.2, 0.4);
    return mix(blue, red, t);
}
      
@fragment
fn fragMain(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let coords = vec2u(pos.xy);
    let index = coords.y * viewRes.x + coords.x;

    let resUV = vec2f(coords) / vec2f(viewRes);
    let worldPos = resUV * viewSize + viewTL;
    let simBR = simTL + simSize;
    let inSim = worldPos.x >= simTL.x && worldPos.x <= simBR.x && worldPos.y >= simTL.y && worldPos.y <= simBR.y;

    let boardBR = boardTL + boardSize;
    let inBoard = worldPos.x >= boardTL.x && worldPos.x <= boardBR.x && worldPos.y >= boardTL.y && worldPos.y <= boardBR.y;

    if !inBoard {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    if !inSim {
        return vec4f(0.5, 0.5, 0.5, 1.0);
    }

    let simUV = (worldPos - simTL) / simSize;

    let simCoords = vec2u(simUV * vec2f(simRes));
    let simIndex = simCoords.y * simRes.x + simCoords.x;

    let temp = wos_valueList[simIndex];

    if temp < 0.0 {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    } else {
        let avgTemp = (temp / f32(totalWalks) + 0.35); // +0.35 to offset color pallet
        // APROXIMATELY REMAP TO 0-1 RANGE
        // MAX IS THE MAX BOUNDARY VALUE, WHICH CAN BE EXCEEDED IN WOSTR
        let normalizedTemp = (avgTemp - minMaxBVals.x) / (minMaxBVals.y - minMaxBVals.x);

        // DIFFERENT COLOR PALLETS :)

        //let outColor = twoToneColor(temp / f32(totalWalks));
        // let outColor = color(
        //     vec3f(0.5, 0.5, 0.5),
        //     vec3f(0.5, 0.5, 0.5),
        //     vec3f(1.0, 1.0, 1.0),
        //     vec3f(0.00, 0.33, 0.67),
        //     normalizedTemp
        // );

        let outColor = color(
            vec3f(0.300, 0.500, 0.700),  // a
            vec3f(0.700, 0.500, 0.300),  // b
            vec3f(1.000, 1.000, 1.000),  // c
            vec3f(0.000, 0.150, 0.350),  // d
            normalizedTemp
        );

        // let outColor = color(
        //     vec3f(0.500, 0.000, 0.500),  // a
        //     vec3f(0.500, 0.000, 0.500),  // b
        //     vec3f(1.000, 1.000, 1.000),  // c
        //     vec3f(0.000, 0.330, 0.670),  // d
        //     normalizedTemp
        // );
        //let outColor = color(vec3f(0.5, 0.5, 0.5), vec3f(0.5, 0.5, 0.5), vec3f(2.0, 1.0, 0.0), vec3f(0.5, 0.2, 0.25), temp / f32(totalWalks));
        return vec4f(outColor, 1.0);
    }
}

