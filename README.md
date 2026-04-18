# txtfx

Turn any image into animated ASCII art. Drop an image, convert it to ASCII, layer effects on top, and export the result.

<!-- ![demo](docs/demo.gif) -->

## Features

- **Image to ASCII** — adjustable font size, line height, letter spacing, character ramp, gamma, and blend modes
- **Mask painting** — brush foreground/background regions to control where effects appear
- **Timeline** — keyframe effects across a timeline, loop playback, scrub and preview
- **12 built-in effects** — twinkle, meteor, rain, snow, fire, matrix, scanline, glitch, typewriter, decode, firework, custom emitter
- **Export** — HTML with embedded styles, or rendered video

## Stack

Next.js, TypeScript, Zustand. DOM `<pre>` rendering with canvas glow layer.

## Dev

```bash
bun install
bun dev
```

Open [localhost:3000](http://localhost:3000).

## Build

```bash
bun run build
```
