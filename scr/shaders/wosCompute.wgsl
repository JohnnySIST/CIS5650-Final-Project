@group(0) @binding(0) var<uniform> domainDim: vec2u;
@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;
@group(1) @binding(1) var<storage, read_write> wos_valueList: array<f32>;

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
  let circleDist2 = length(pos - circleCenter2) - circleRadius2;  // FIX: use circleCenter2 and circleRadius2!
  
  let circleDistFinal = min(circleDist, circleDist2);
  return min(boxDist, circleDistFinal);
}

fn getBoundaryTemperature(pos: vec2f, texSize: vec2u) -> f32 {
  let texSizef = vec2f(f32(texSize.x), f32(texSize.y));
  
  // Circle 1
  var circleCenter = texSizef * 0.5;
  circleCenter.y += 400.0;
  let circleRadius = min(texSizef.x, texSizef.y) * 0.2;

  // Circle 2
  var circleCenter2 = texSizef * 0.5;
  circleCenter2.y -= 400.0;
  circleCenter2.x -= 100.0;
  let circleRadius2 = min(texSizef.x, texSizef.y) * 0.1;
  
  let distToCircle1 = abs(length(pos - circleCenter) - circleRadius);
  let distToCircle2 = abs(length(pos - circleCenter2) - circleRadius2);

  let circleDistFinal = min(distToCircle1, distToCircle2);

  let boxMin = texSizef * 0.1;
  let boxMax = texSizef * 0.9;
  
  let distToBox = min(
    min(abs(pos.x - boxMin.x), abs(boxMax.x - pos.x)),
    min(abs(pos.y - boxMin.y), abs(boxMax.y - pos.y))
  );
  
  if (circleDistFinal < distToBox) {
    return 1.0; // Circles are hot
  } else {
    return 0.0; // Box is cold
  }
}

fn randomFloat(state: ptr<function, u32>) -> f32 {
  let a = 1664525u;
  let c = 1013904223u;
  *state = (*state * a + c);
  return f32(*state) / 4294967296.0;
}

fn walkOnSpheres(startPos: vec2f, texSize: vec2u, rngState: ptr<function, u32>) -> f32 {
  var pos = startPos;
  let epsilon = 2.0; // Stop when within 2 pixels of boundary
  let maxSteps = 100;
  
  for (var step = 0; step < maxSteps; step++) {
    let dist = distanceToBoundary(pos, texSize);

    if (dist < epsilon) {
      return getBoundaryTemperature(pos, texSize);
    }

    let angle = randomFloat(rngState) * 6.28318530718; 
    let offset = vec2f(cos(angle), sin(angle)) * dist * 0.99;
    pos += offset;
  }
  
  return getBoundaryTemperature(pos, texSize);
}


@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let texSize = domainDim;
  let index = id.y * texSize.x + id.x;
  let uv = uv_list[index];//vec2f(f32(coords.x), f32(coords.y)) / vec2f(f32(texSize.x), f32(texSize.y));
  let coords = vec2i(id.xy);
  if (u32(coords.x) >= texSize.x || u32(coords.y) >= texSize.y) {
    return;
  }

  // IGNOR UVs FOR QUEERY POINTS NOT IN BOUNDARY
  // CHANGE LATER SO THREADS NEVER RUN ON THESE TYPES OF POINTS (Stream Compaction :D)
  if (uv.x < 0.0 || uv.y < 0.0) {
    wos_valueList[index] = -1.0;
    //textureStore(outputTex, coords, vec4f(-1.0, 0, 0, 1.0));
    return;
  }

  let worldPos = vec2f(f32(coords.x), f32(coords.y));
  
  let dist = distanceToBoundary(worldPos, texSize);
  
  // Do multiple WoS walks and average
  let numWalks = 10u;
  var totalTemp = 0.0;
  var rngState = u32(coords.x) * 747796405u + u32(coords.y) * 2891336453u;
  
  for (var i = 0u; i < numWalks; i++) {
    let temp = walkOnSpheres(worldPos, texSize, &rngState);
    totalTemp += temp;
  }
  
  let avgTemp = totalTemp / f32(numWalks);
  
  wos_valueList[index] = avgTemp;
  //textureStore(outputTex, coords, vec4f(avgTemp, 0, 0, 1.0));
}