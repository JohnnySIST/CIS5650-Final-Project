# CIS5650-Final-Project

# Motivation

Modern electronics are limited by heat dissipation. Being able to quickly visualize and simulate heat diffusion on PCBs is critical during early prototyping, yet most PCB design tools provide little to no thermal feedback while adjusting layouts. Full finite-element solvers are accurate but slow and don't allow for layout adjustments. Doing a global, high-fidelity solve is also often overkill and requires a full re-simulation every time a small change is made. This project targets that bottleneck by introducing a browser-based GPU thermal estimator built on the Walk-on-Stars (WoStr) algorithm. WoStr allows for fast re-simulation on geometry changes, localized solves over targeted regions, and a progressive convergence that provides immediate, intermediate estimates. All of these are advantageous for quick design iteration and prototyping.

![](./img/Processing_Pipeline.png)

## Current Open Source Availability

Current open source options are limited and take a large number of processing steps before achieving a final result [1]. Users are forced to download many distinct pieces of software for each part of the process, beyond the initial KiCad development, if they want to continue license-free [2]. KiCad boards are exported first to Salome to perform mesh building and conversion. Then, that output is exported ElmerVTK where the FEM simulation is run. Finally, to produce high quality images, that output must be exported to Paraview. If one wants to iterate on their design, then go back to KiCad, modify the appropriate geometry, then complete this whole process again. In our software, the last 3 steps will be condensed to a single software, which will also allow for interative editing to shorten the design loop

![./img/Process_Comparison.png](./img/Process_Comparison.png)

Walk on Spheres & Walk on Stars
Walk on Spheres works by launching random walks from query points until they hit a boundary. Drawing inspiration from path tracing and sphere tracing, each walk contributes to a Monte Carlo estimator that converges toward the true solution of the steady-state heat equation. Because each walk is independent, the method is embarrassingly parallel, making it a perfect fit for WebGPU compute shaders.
Walk on Stars is an extension to the WoS algorithm to allow for a combination of Dirichlet and Neumann boundary conditions, a feature that is needed for physically based heat simulations. The structure is the same in that it is a Monte Carlo based method using random walks from a set of query points. The radius of the sphere used for sphere tracing is only dependent on the Dirichlet boundaries. When walking to the uniformly sampled point on this sphere, if we cross a Neumann boundary, we reflect our walk about the boundary's flux direction and adjust values based on that flux. The walks continue on, only terminating when we finally hit a Dirichlet boundary. This allows for accurate sinks and sources. Again we can take advantage of GPU parallelization to make this process extremely fast.

<div style="display: flex; gap: 20px; justify-content: center; margin-top: 20px;">
  <figure style="text-align: center; margin: 0;">
    <img src="./WoS_SS1.png" alt="Walk On Spheres" style="max-width: 100%;">
    <figcaption><em>Walk on Spheres (Dirichlet only)</em></figcaption>
  </figure>
  <figure style="text-align: center; margin: 0;">
    <img src="./SoStr_SS1.png" alt="Walk On Stars" style="max-width: 100%;">
    <figcaption><em>Walk on Stars (Dirichlet + Neumann)</em></figcaption>
  </figure>
</div>

## Interacitivity

- Camera movement, zooming and panning
- Simulation zone selection, allowing users to focus on a certain area, reducing unnecessary computing 
- Live FPS display
- Add probes to monitor the real-time value of a position
- Modifying properties of geometries
  - Widths of segments
  - Radii of footprint pads/vias

![Interactive Visualization demo](./Milestone_2/camera.gif)

## KiCad Integration

- Importing KiCad PCB Design files
  - Uses [kicadts](https://www.npmjs.com/package/kicadts) to parse `.kicad_pcb` files
  - Imports footprint and segment geometries
  - (Planned) Import layer stack
    - Automatically derive electrical and thermal properties of each layer
- (Planned) Exporting Design Back to Kicad
  - After interactive modifications to board (segments, footprints, vias)
  - Current kicadts export output fails to reopen in KiCad
    - Likely need to fork package

## References

1: [https://jrainimo.com/build/2024/11/oss-thermal-simulation-of-pcbs/](https://jrainimo.com/build/2024/11/oss-thermal-simulation-of-pcbs/)

2: [https://resources.altium.com/p/why-you-should-use-thermal-prototyping-instead-simulations](https://resources.altium.com/p/why-you-should-use-thermal-prototyping-instead-simulations)
