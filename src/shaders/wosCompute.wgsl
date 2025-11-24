struct Circle {
    center: vec2f,
    radius: f32,
    boundary_value: f32 // ASSUME DIRCHLE BOUNDARY FOR NOW 
}

struct NeumannHit {
    dist: f32,
    normal: vec2f,
    flux: f32
}

struct Segment {
    start: vec2f,
    end: vec2f,
    widthRadius: f32,
    boundary_value: f32
}

@group(0) @binding(0) var<uniform> simRes: vec2u;
@group(0) @binding(1) var<uniform> simTL: vec2f;
@group(0) @binding(2) var<uniform> simSize: vec2f;
@group(0) @binding(3) var<uniform> totalWalks: u32;
@group(0) @binding(4) var<storage> circles: array<Circle>;
@group(0) @binding(5) var<storage> segments: array<Segment>;

@group(1) @binding(0) var<storage, read_write> uv_list: array<vec2f>;
@group(1) @binding(1) var<storage, read_write> wos_valueList: array<f32>;



fn distanceToSegment(worldPos: vec2f, segment: Segment) -> f32 {
    let AB = segment.end - segment.start;
    let AP = worldPos - segment.start;
    let t = dot(AP, AB) / dot(AB, AB);

    var dist = length(AP - AB * t);

    if t < 0.0 {
        dist = length(AP);
    } else if t > 1.0 {
        dist = length(worldPos - segment.end);
    }

    return dist - segment.widthRadius;
}


fn randomFloat(state: ptr<function, u32>) -> f32 {
    let a = 1664525u;
    let c = 1013904223u;
    *state = (*state * a + c);
    return f32(*state) / 4294967296.0;
}

// REGULAR WoS
fn distanceToBoundaryWoS(pos: vec2f) -> vec2f {

    let simBR = simTL + simSize;

    let boxDist = min(
        min(pos.x - simTL.x, simBR.x - pos.x),
        min(pos.y - simTL.y, simBR.y - pos.y)
    );

    var circleDistFinal = length(pos - circles[0].center) - circles[0].radius;
    var circlebValFinal = circles[0].boundary_value;


    for (var i = 1u; i < arrayLength(&circles); i++) {
        let curDist = length(pos - circles[i].center) - circles[i].radius;
        if curDist < circleDistFinal {
            circleDistFinal = curDist;
            circlebValFinal = circles[i].boundary_value;
        }
    }


    var segmentDistFinal = distanceToSegment(pos, segments[0]);
    var segmentbValFinal = segments[0].boundary_value;
    for (var i = 1u; i < arrayLength(&segments); i++) {
        let curDist = distanceToSegment(pos, segments[i]);
        if curDist < segmentDistFinal {
            segmentDistFinal = curDist;
            segmentbValFinal = segments[i].boundary_value;
        }
    }

    var result = vec2f(circleDistFinal, circlebValFinal);
    if boxDist < circleDistFinal && boxDist < segmentDistFinal {
        result[0] = boxDist;
        result[1] = 0.0;
    }

    if segmentDistFinal < circleDistFinal && segmentDistFinal < boxDist {
        result[0] = segmentDistFinal;
        result[1] = segmentbValFinal;
    }

    return result;
}

fn walkOnSpheres(startPos: vec2f, rngState: ptr<function, u32>) -> f32 {
    var pos = startPos;
    var temp = 0.0;
    let epsilon = 0.001; // was 2.0
    let maxSteps = 100;

    for (var step = 0; step < maxSteps; step++) {
        let boundaryResult = distanceToBoundaryWoS(pos);
        let dist = boundaryResult[0];
        temp = boundaryResult[1];

        if dist < epsilon {
            return temp;
        }

        let angle = randomFloat(rngState) * 6.28318530718;
        let offset = vec2f(cos(angle), sin(angle)) * dist * 0.99;
        pos += offset;
    }

    return temp;
}


// WALK ON STARS
fn dTBDirichlet(pos: vec2f, texSize: vec2u) -> vec2f {
    let texSizef = vec2f(f32(texSize.x), f32(texSize.y));

  // FOR NOW DO CENTER POS IS DISTANCE FROM CENTER OF SCREEN
    var circleDistFinal = length(pos - (texSizef * 0.5 + circles[0].center * texSizef * 0.5)) - circles[0].radius * length(texSizef) * 0.5;
    var circlebValFinal = circles[0].boundary_value;
    for (var i = 1u; i < arrayLength(&circles); i++) {
        let curDist = length(pos - (texSizef * 0.5 + circles[i].center * texSizef * 0.5)) - circles[i].radius * length(texSizef) * 0.5;
        if curDist < circleDistFinal {
            circleDistFinal = curDist;
            circlebValFinal = circles[i].boundary_value;
        }
    }

    return vec2f(circleDistFinal, circlebValFinal);
}

fn dTBNeumann(pos: vec2f, texSize: vec2u) -> NeumannHit {
    let texSizef = vec2f(f32(texSize.x), f32(texSize.y));
  
  // REPLACE BOX WITH THE USER DEFINED BOUNDARY. IF NOTHING, MAKE IT SCREEN SIZE
    let boxMin = texSizef * 0.05;
    let boxMax = texSizef * 0.95;

    let flux = 0.0; // REPLACE WITH BOUNDARY FLUX LATER

    let dLeft = pos.x - boxMin.x;
    let dRight = boxMax.x - pos.x;
    let dBottom = pos.y - boxMin.y;
    let dTop = boxMax.y - pos.y;

    let boxDist = min(min(dLeft, dRight), min(dBottom, dTop));

    var normal = vec2f(0.0);
    if boxDist == dLeft {
        normal = vec2f(1.0, 0.0);
    } else if boxDist == dRight {
        normal = vec2f(-1.0, 0.0);
    } else if boxDist == dBottom {
        normal = vec2f(0.0, 1.0);
    } else {
        normal = vec2f(0.0, -1.0);
    }

    return NeumannHit(
        boxDist,
        normal,
        flux
    );
}

fn sampleHemisphere(normal: vec2f, rngState: ptr<function, u32>) -> f32 {
    let angle = randomFloat(rngState) * 2.0 * 3.14159265;
    let dir = vec2f(cos(angle), sin(angle));

    if dot(dir, normal) < 0.0 {
        return -angle;
    }
    return angle;
}


fn walkOnStars(startPos: vec2f, texSize: vec2u, rngState: ptr<function, u32>) -> f32 {
    var pos = startPos;
    var temp = 0.0;
    let epsilon = 2.0; // THESE ARE IN PIXELS
    let rMin = 2.0;
    let maxSteps = 100;

    var angle = randomFloat(rngState) * 6.28318530718;
    for (var step = 0; step < maxSteps; step++) {
        let boundaryResult = dTBDirichlet(pos, texSize);
        let dist = boundaryResult[0];
        temp = boundaryResult[1];

        if dist < epsilon {
            return temp;
        }

        var offset = vec2f(cos(angle), sin(angle)) * dist * 0.99;

        let n1 = dTBNeumann(pos, texSize);
        let n2 = dTBNeumann(pos + offset, texSize);

        if n1.dist * n2.dist < 0.0 {
            offset = vec2f(cos(angle), sin(angle)) * n1.dist * 0.99;
            angle = sampleHemisphere(n1.normal, rngState);
        } else {
            angle = randomFloat(rngState) * 6.28318530718;
        }

        pos += offset;
    }

    return 0.0;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let index = id.y * simRes.x + id.x;
    let uv = uv_list[index];//vec2f(f32(coords.x), f32(coords.y)) / vec2f(f32(texSize.x), f32(texSize.y));
    let coords = vec2u(id.xy);
    if coords.x >= simRes.x || coords.y >= simRes.y {
        return;
    }

  // IGNOR UVs FOR QUEERY POINTS NOT IN BOUNDARY
  // CHANGE LATER SO THREADS NEVER RUN ON THESE TYPES OF POINTS (Stream Compaction :D)
    if uv.x < 0.0 || uv.y < 0.0 {
        wos_valueList[index] = -1.0;
        return;
    }

    let worldPos = uv * simSize + simTL;

  // Do multiple WoS walks and average
    let numWalks = 4u;
    var totalTemp = 0.0;
    var seed = coords.x * 747796405u + coords.y * 2891336453u * totalWalks;

    for (var i = 0u; i < numWalks; i++) {
        let temp = walkOnSpheres(worldPos, &seed);//walkOnSpheres(worldPos, texSize, &seed);
        totalTemp += temp;
    }

    let avgTemp = totalTemp;// / f32(numWalks);

    wos_valueList[index] += avgTemp;
}