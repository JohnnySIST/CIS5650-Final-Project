# CIS5650-Final-Project

# Motivation
Modern electronics are limited by heat dissipation. Being able to quickly visualize and simulate heat diffusion on PCBs is critical during early prototyping, yet most PCB design tools provide little to no thermal feedback while adjusting layouts. Full finite-element solvers are accurate but slow and don't allow for layout adjustments. Doing a global, high-fidelity solve is also often overkill and requires a full re-simulation every time a small change is made. This project targets that bottleneck by introducing a browser-based GPU thermal estimator built on the Walk-on-Stars (WoStr) algorithm. WoStr allows for fast re-simulation on geometry changes, localized solves over targeted regions, and a progressive convergence that provides immediate, intermediate estimates. All of these are advantageous for quick design iteration and prototyping.

# Walking on Stars for Interactive PCB Design

## Current Open Source Availability

## Walk on Spheres
Walk on Spheres works by launching random walks from query points until they hit a boundary. Drawing inspiration from path tracing and sphere tracing, each walk contributes to a Monte Carlo estimator that converges toward the true solution of the steady-state heat equation. Because each walk is independent, the method is embarrassingly parallel, making it a perfect fit for WebGPU compute shaders.

![Walk On Spheres](./WoS_SS1.png)

## Walk on Stars
Walk on Stars is an extension to the WoS algorithm to allow for a combination of Dirichlet and Neumann boundary conditions, a feature that is needed for phisically based heat simulations. The structure is the same in that it is a monte carlo based method using random walks from a set of query points. The radius of the sphere used for sphere tracing is only dependent on the Dirichlet boundaries. When walking to the uniformly sampled point on this sphere, if we cross a Neumann boundary, we reflect our walk about the boundaries flux direction and adjust values based on that flux. The walks continue on, only terminating when we finaly hit a Dirichlet boundary. This allows for accurate sinks and sources. Again we can take advantage of GPU parallelization to make this process extreamly fast. 

![Walk On Stars](./SoStr_SS1.png)

## Interacitivity

## KiCad Integration
