struct Circle {
    center: vec2f,
    radius: f32,
    boundary_value: f32 // ASSUME DIRCHLE BOUNDARY FOR NOW 
}


@group(0) @binding(0) var<uniform> domainDim: vec2u;
@group(0) @binding(1) var<uniform> totalWalks: u32;
@group(0) @binding(2) var<storage> circles: array<Circle>;

@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;
@group(1) @binding(1) var<storage, read_write> wos_valueList: array<f32>;

fn distanceToBoundary(pos: vec2f, texSize: vec2u) -> vec2f {
  let texSizef = vec2f(f32(texSize.x), f32(texSize.y));
  
  // REPLACE BOX WITH THE USER DEFINED BOUNDARY. IF NOTHING, MAKE IT SCREEN SIZE
  let boxMin = texSizef * 0.1;
  let boxMax = texSizef * 0.9;

  let boxDist = min(
    min(pos.x - boxMin.x, boxMax.x - pos.x),
    min(pos.y - boxMin.y, boxMax.y - pos.y)
  );

  // FOR NOW DO CENTER POS IS DISTANCE FROM CENTER OF SCREEN
  var circleDistFinal = length(pos - (texSizef * 0.5 + circles[0].center * texSizef * 0.5)) - circles[0].radius * length(texSizef) * 0.5;
  var circlebValFinal = circles[0].boundary_value;
  for (var i = 1u; i < arrayLength(&circles); i++) {
    let curDist = length(pos - (texSizef * 0.5 + circles[i].center * texSizef * 0.5)) - circles[i].radius * length(texSizef) * 0.5;
    if (curDist < circleDistFinal) {
      circleDistFinal = curDist;
      circlebValFinal = circles[i].boundary_value;
    }
  }

  var result = vec2f(circleDistFinal, circlebValFinal);
  if (boxDist < circleDistFinal) {
    result[0] = boxDist;
    result[1] = 0.0;
  }
  
  return result;
}

fn randomFloat(state: ptr<function, u32>) -> f32 {
  let a = 1664525u;
  let c = 1013904223u;
  *state = (*state * a + c);
  return f32(*state) / 4294967296.0;
}

fn walkOnSpheres(startPos: vec2f, texSize: vec2u, rngState: ptr<function, u32>) -> f32 {
  var pos = startPos;
  var temp = 0.0;
  let epsilon = 2.0;
  let maxSteps = 100;
  
  for (var step = 0; step < maxSteps; step++) {
    let boundaryResult = distanceToBoundary(pos, texSize);
    let dist = boundaryResult[0];
    temp = boundaryResult[1];

    if (dist < epsilon) {
      return temp;
    }

    let angle = randomFloat(rngState) * 6.28318530718; 
    let offset = vec2f(cos(angle), sin(angle)) * dist * 0.99;
    pos += offset;
    
  }
  
  return temp;
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
    return;
  }

  let worldPos = vec2f(f32(coords.x), f32(coords.y));

  // Do multiple WoS walks and average
  let numWalks = 4u;
  var totalTemp = 0.0;
  var rngState = u32(coords.x) * 747796405u + u32(coords.y) * 2891336453u * totalWalks;
  
  for (var i = 0u; i < numWalks; i++) {
    let temp = walkOnSpheres(worldPos, texSize, &rngState);
    totalTemp += temp;
  }
  
  let avgTemp = totalTemp;// / f32(numWalks);
  
  wos_valueList[index] += avgTemp;
}