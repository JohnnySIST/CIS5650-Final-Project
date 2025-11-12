import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';

import { setupLoaders, Scene } from './stage/scene';
import { loadOBJToScene } from './stage/objLoader';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

// try to load a sample OBJ from assets (non-fatal if missing)
try {
    await loadOBJToScene(scene, './assets/models/bunny.obj', { scale: 10, color: [0.8, 0.2, 0.2] });
} catch (e) {
    console.warn('OBJ sample not loaded:', e);
}

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// const gui = new GUI();
// gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
//     lights.updateLightSetUniformNumLights();
// });

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

function setRenderer(mode: string) {
    renderer?.stop();

    switch (mode) {
        case "naive":
            renderer = new NaiveRenderer(stage);
            break;
    }
}

setRenderer("naive");
