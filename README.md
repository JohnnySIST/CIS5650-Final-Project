# CIS5650-Final-Project : Walk on Stars for Interactive PCB Simulation

![](./img/WoStr_BigBoard_V1.png)

# Overview
[LIVE DEMO](https://johnnysist.github.io/CIS5650-Final-Project/)

We are team **Circuit Nova** : [Oliver Hendrych](https://github.com/hendrych-upenn), [Lewis Ghrist](https://siwel-cg.github.io/siwel.cg_websiteV1/index.html#home), and [Hongyi Ding](https://johnnyding.com/portfolio). This project is a browser-based, WebGPU thermal simulation tool for PCB design and prototyping, built on the Walk on Stars (WoStr) algorithm. Users can import or draw PCB layouts, set boundary condition types and values, and interactively move components while the heat distribution updates in real time.

# Motivation and Background

Modern electronics are limited by heat dissipation. Being able to quickly visualize and simulate heat diffusion on PCBs is critical during early prototyping, yet most PCB design tools provide little to no thermal feedback while adjusting layouts. Full finite-element solvers are accurate but slow and don't allow for layout adjustments. Doing a global, high-fidelity solve is also often overkill and requires a full re-simulation every time a small change is made. This project targets that bottleneck by introducing a browser-based GPU thermal estimator built on the Walk-on-Stars (WoStr) algorithm. WoStr allows for fast re-simulation on geometry changes, localized solves over targeted regions, and a progressive convergence that provides immediate, intermediate estimates. All of these are advantageous for quick design iteration and prototyping.

![](./img/Processing_Pipeline.png)

## Current Open Source Availability

Current open source options are limited and take a large number of processing steps before achieving a final result [1]. Users are forced to download many distinct pieces of software for each part of the process, beyond the initial KiCad development, if they want to continue license-free [2]. KiCad boards are exported first to Salome to perform mesh building and conversion. Then, that output is exported ElmerVTK where the FEM simulation is run. Finally, to produce high quality images, that output must be exported to Paraview. If one wants to iterate on their design, then go back to KiCad, modify the appropriate geometry, then complete this whole process again. In our software, the last 3 steps will be condensed to a single software, which will also allow for interative editing to shorten the design loop

![./img/Process_Comparison.png](./img/Process_Comparison.png)

## Walk on Spheres & Walk on Stars

Walk on Spheres works by launching random walks from query points until they hit a boundary. Drawing inspiration from path tracing and sphere tracing, each walk contributes to a Monte Carlo estimator that converges toward the true solution of the steady-state heat equation. Because each walk is independent, the method is embarrassingly parallel, making it a perfect fit for WebGPU compute shaders.

Walk on Stars is an extension to the WoS algorithm to allow for a combination of Dirichlet and Neumann boundary conditions, a feature that is needed for physically based heat simulations. The structure is the same in that it is a Monte Carlo based method using random walks from a set of query points. The radius of the sphere used for sphere tracing is only dependent on the Dirichlet boundaries. When walking to the uniformly sampled point on this sphere, if we cross a Neumann boundary, we reflect our walk about the boundary's flux direction and adjust values based on that flux. The walks continue on, only terminating when we finally hit a Dirichlet boundary. This allows for accurate sinks and sources. Again we can take advantage of GPU parallelization to make this process extremely fast.

The original papers, as well as many extentions, can be found here: [https://rohan-sawhney.github.io/mcgp-resources/](https://rohan-sawhney.github.io/mcgp-resources/)

| Walk on Spheres (Dirichlet only) | Walk on Stars (Dirichlet + Neumann) |
|:--:|:--:|
| ![Walk On Spheres](./WoS_SS1.png) | ![Walk On Stars](./SoStr_SS1.png) |

# Break Down

The general pipeline involves two main compute shaders. First, we do an initial screening of our simulation domain to get just the query points within the boundaries of our geometry. This can be done once before the simulation starts and allows us to only simulate on point's that will actually result in meaning full data. These query points are then shipped to the second compute shader where the real work happens. This second compute shader handles the actuall simulation. For each query point, we send out these random walks, stepping based on the closest distance to a boundary. This closest distance is found using a BVH struture (or in this case BAH structure since we are in 2D), which drastically speeds up walk times, especially in complex boards. As explained in the WoStr method, at Neumann boundaries, this walk get reflected, picking up some flux value, and at Dirichlet boundarie's, the walk ends and returns the Dirichlet boundary value along with any accumulated flux along the walk. These results then get sent to a final fragment shader, which averages all the walk results for each query point, fits that value through a simple color ramp, and draws it to the screen along with the boundary geometry. 

## Interactivity
A unique advantage of this WoStr method, is that because it is based only on a set of initial query points, we don't need to do a global solve to get results. To take advantage of this, we implemented a simulation zone selection feature that lets users focus computation on a specific region of interest. For complex boards, or if there is a specific area you are particularly interested in, you can easily simulate just on that area in a higher resolution, without paying for the cost of simulating the entire board.

<p align="center">
  <img src="./img/BoundaryLines_V1.png" width="50%">
</p>

The main user interaction feature is being able to select, add/delete, and move geometry as well as change the boundary types and values as needed. This allows for custom board creation or user imported boards to be edited and adjusted. The final configuration can then be exported out. 

Finally, for some quality of life features, we implemented a basic camera system for navigating the board, a live FPS display for performance monitoring, a pause button for the simulation, and a selection menue for adjusting simulation resolution.

[![Demo Video](https://img.youtube.com/vi/hk4TR0w7xXk/maxresdefault.jpg)](https://www.youtube.com/watch?v=hk4TR0w7xXk)

## KiCad Integration

- Importing KiCad PCB Design files
  - Uses [kicadts](https://www.npmjs.com/package/kicadts) to parse `.kicad_pcb` files
  - Imports footprint and segment geometries
- (Planned) Exporting Design Back to Kicad
  - After interactive modifications to board (segments, footprints, vias)
  - Current kicadts export output fails to reopen in KiCad
    - Likely need to fork package

# Future Work
There are still some additional features that can be added for more functionality or better resutls. For starters, there has been a lot of recent work on extending or improving the Walk on Stars algorithm. This includes things like faster convergence and more complex boundary types. The simulation at the moment doesn't take into account material properties, which in a full, physically accurate simulation is important. As a prototying tool, getting this approximate solution is still valuable, but WoStr can be extended to support materal properties. Additionally, the pipeline can be extended to support more geometry types beyond simple segments and circles, making it more in line with prexisting PCB editors. Finally, as always, further optimizations and performance improvemnts can be made for smoother and faster results.

# References

1: [https://jrainimo.com/build/2024/11/oss-thermal-simulation-of-pcbs/](https://jrainimo.com/build/2024/11/oss-thermal-simulation-of-pcbs/)

2: [https://resources.altium.com/p/why-you-should-use-thermal-prototyping-instead-simulations](https://resources.altium.com/p/why-you-should-use-thermal-prototyping-instead-simulations)

3: [https://jacco.ompf2.com/2022/04/13/how-to-build-a-bvh-part-1-basics/](https://jacco.ompf2.com/2022/04/13/how-to-build-a-bvh-part-1-basics/)

4: [https://rohan-sawhney.github.io/mcgp-resources/](https://rohan-sawhney.github.io/mcgp-resources/)
