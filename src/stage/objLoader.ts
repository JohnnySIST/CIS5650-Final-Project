import { Scene, Node } from './scene';
import { device, materialBindGroupLayout } from '../renderer';
import { mat4 } from 'wgpu-matrix';

let nextMaterialId = 1000000;

function createSolidTexture(color: [number, number, number]): { texture: GPUTexture, sampler: GPUSampler } {
    const texture = device.createTexture({
        size: [1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    // write a single pixel of the specified color (color components in 0..1)
    const r = Math.max(0, Math.min(1, color[0] ?? 1));
    const g = Math.max(0, Math.min(1, color[1] ?? 1));
    const b = Math.max(0, Math.min(1, color[2] ?? 1));
    const data = new Uint8Array([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]);
    device.queue.writeTexture(
        { texture: texture },
        data,
        { bytesPerRow: 4 },
        { width: 1, height: 1 }
    );

    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear'
    });

    return { texture, sampler };
}

// Very small, permissive OBJ parser for positions, normals, uvs and triangular faces.
async function fetchText(url: string) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`failed to fetch ${url}: ${resp.status}`);
    return await resp.text();
}

export type LoadOBJOptions = {
    scale?: number; // uniform scale applied to the node transform
    color?: [number, number, number]; // fixed RGB color in 0..1
}

export async function loadOBJToScene(scene: Scene, url: string, options?: LoadOBJOptions) {
    const text = await fetchText(url);

    const positions: number[][] = [];
    const normals: number[][] = [];
    const uvs: number[][] = [];

    // mapping from "v/vt/vn" -> index
    const indexMap = new Map<string, number>();
    const indices: number[] = [];
    const vertices: number[] = []; // interleaved [px,py,pz, nx,ny,nz, u,v]

    const lines = text.split(/\r?\n/);
    for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (line.length === 0 || line.startsWith('#')) continue;
        const parts = line.split(/\s+/);
        const tag = parts[0];
        if (tag === 'v') {
            positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
        } else if (tag === 'vn') {
            normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
        } else if (tag === 'vt') {
            uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);
        } else if (tag === 'f') {
            // faces can be triangles or quads; we triangulate n-gons by fan
            const faceVerts = parts.slice(1);
            const faceIndices: number[] = [];
            for (const fv of faceVerts) {
                // fv formats: v, v/vt, v//vn, v/vt/vn
                const comps = fv.split('/');
                const vi = parseInt(comps[0], 10);
                const vti = comps[1] ? parseInt(comps[1], 10) : 0;
                const vni = comps[2] ? parseInt(comps[2], 10) : 0;

                // OBJ indices are 1-based and can be negative (relative). We only support positive here.
                const key = `${vi}/${vti}/${vni}`;
                let idx = indexMap.get(key);
                if (idx === undefined) {
                    const pos = positions[vi - 1];
                    const uv = vti ? (uvs[vti - 1] ?? [0, 0]) : [0, 0];
                    const nor = vni ? (normals[vni - 1] ?? [0, 0, 1]) : [0, 0, 1];

                    vertices.push(pos[0], pos[1], pos[2], nor[0], nor[1], nor[2], uv[0], uv[1]);
                    idx = (vertices.length / 8) - 1;
                    indexMap.set(key, idx);
                }
                faceIndices.push(idx);
            }

            // triangulate
            for (let i = 1; i < faceIndices.length - 1; ++i) {
                indices.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
            }
        }
    }

    if (vertices.length === 0 || indices.length === 0) {
        throw new Error('OBJ contained no geometry');
    }

    const vertsArray = new Float32Array(vertices);
    const idxArray = new Uint32Array(indices);

    const vertexBuffer = device.createBuffer({
        label: 'obj vertex buffer',
        size: vertsArray.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertsArray);

    const indexBuffer = device.createBuffer({
        label: 'obj index buffer',
        size: idxArray.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(indexBuffer, 0, idxArray);

    const color = options?.color ?? [1, 1, 1];
    const texAndSampler = createSolidTexture(color);

    const material = {
        id: nextMaterialId++,
        materialBindGroup: device.createBindGroup({
            label: 'obj material bind group',
            layout: materialBindGroupLayout,
            entries: [
                { binding: 0, resource: texAndSampler.texture.createView() },
                { binding: 1, resource: texAndSampler.sampler }
            ]
        })
    } as any;

    const primitive = {
        vertexBuffer: vertexBuffer,
        indexBuffer: indexBuffer,
        numIndices: idxArray.length,
        material: material
    } as any;

    const mesh = { primitives: [primitive] } as any;

    const node = new Node();
    node.mesh = mesh;
    node.setName(url);
    // apply uniform scale if requested
    if (options?.scale !== undefined) {
        node.transform = mat4.scaling([options.scale, options.scale, options.scale]);
    }

    scene.addNode(node);
}
