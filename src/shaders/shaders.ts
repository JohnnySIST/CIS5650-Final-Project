// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,

    moveLightsWorkgroupSize: 128,
    clusteringWorkgroupSize: 128,
    maxLightsPerCluster: 5000,

    lightRadius: 20
};

// =================================

function evalShaderRaw(raw: string) {
    return raw
        .replace(/\$\{bindGroup_scene\}/g, constants.bindGroup_scene.toString())
        .replace(/\$\{bindGroup_model\}/g, constants.bindGroup_model.toString())
        .replace(/\$\{bindGroup_material\}/g, constants.bindGroup_material.toString())
        .replace(/\$\{moveLightsWorkgroupSize\}/g, constants.moveLightsWorkgroupSize.toString())
        .replace(/\$\{clusteringWorkgroupSize\}/g, constants.clusteringWorkgroupSize.toString())
        .replace(/\$\{maxLightsPerCluster\}/g, constants.maxLightsPerCluster.toString())
        .replace(/\$\{lightRadius\}/g, constants.lightRadius.toString());
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);
