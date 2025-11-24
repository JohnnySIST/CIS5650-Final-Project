# CIS5650-Final-Project

# Walking on Stars for Interactive PCB Design

![](./img/Processing_Pipeline.png)

## Purpose

## Current Open Source Availability

Current open source options are limited and take a large number of processing steps before achieving a final result [1]. Users are forced to download many distinct pieces of software for each part of the process, beyond the initial KiCad development, if they want to continue license-free [2]. KiCad boards are exported first to Salome to perform mesh building and conversion. Then, that output is exported ElmerVTK where the FEM simulation is run. Finally, to produce high quality images, that output must be exported to Paraview. If one wants to iterate on their design, then go back to KiCad, modify the appropriate geometry, then complete this whole process again. In our software, the last 3 steps will be condensed to a single software, which will also allow for interative editing to shorten the design loop

![./img/Process_Comparison.png](./img/Process_Comparison.png)

## Walking on Spheres

## Walking on Stars

## Interacitivity

- Camera movement
- Simulation zone selection
- Modifying properties of geometries
  - Widths of segments
  - Radii of footprint pads/vias

![Interactive Visualization demo](./Milestone_2/Interactive_Visualization.mp4)

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
