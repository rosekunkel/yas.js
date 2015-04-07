# Yas.js — y86 in JavaScript
Yas.js is a y86 assembler, virtual machine, debugger, and visualizer in pure
JavaScript + HTML/CSS. Yas.js was developed for the University of Maryland
course CMSC216 — Introduction to Computer Systems.

## Usage
A live version of this webapp is hosted
[here](https://wkunkel.github.io/yas.js/yas-viz.html).

To use the Yas.js visualizer, just type or copy y86 code into the editor window
and hit "Assemble". The app will display your code, its translation into machine
code, and a diagram of the registers and stack. The "Advance" button allows you
to step through your code one instruction at a time and see the diagram and
output update.

**Note:** This application uses advanced JavaScript. A modern browser is
required in order to get correct results.

## y86 Extensions
Yas.js was written for the flavor of y86 which is used by the University of
Maryland Computer Science Department. This includes several nonstandard
extensions, which are detailed below. Additionally, behavior may vary from other
versions of y86 even for shared instructions.

| Instruction      | Effect                                                                         |
|------------------|--------------------------------------------------------------------------------|
| multl reg1, reg2 | Multiplies reg2 by reg1 and stores the result in reg2                          |
| divl reg1, reg2  | Divides reg2 by reg1 and stores the result in reg2                             |
| modl reg1, reg2  | Calculates reg2 modulo reg1 and stores the result in reg2                      |
| rdch reg         | Reads a single character of input and stores its ASCII value in reg            |
| wrch reg         | Writes the character with the ASCII value of reg to output                     |
| rdint reg        | Reads in an decimal integer, skipping leading whitespace, and stores it in reg |
| wrint reg        | Writes the value of reg as a decimal integer to output                         |