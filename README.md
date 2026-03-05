# GifX

Convert videos to GIFs, compress GIFs, and convert images between formats — right in your browser. No uploads, 100% private.

## Features

- **Video to GIF & WebP** — drag-and-drop conversion with trim, quality presets, and advanced controls
- **GIF Compressor** — reduce GIF file size with adjustable colors, scale, and frame rate
- **Image Converter** — convert between PNG, JPEG, WebP, BMP, TIFF, and GIF with quality presets
- **100% private** — all processing runs locally via [ffmpeg.wasm](https://ffmpegwasm.netlify.app/), nothing is uploaded

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## CLI

A shell script (`gifx.sh`) is also included for batch/automated workflows. Requires [ffmpeg](https://ffmpeg.org/) installed locally.

```bash
chmod +x gifx.sh
./gifx.sh <input_video> [output_gif] [fps] [scale] [max_colors]
```

Run without arguments to see the full usage guide.

## Support

<a href="https://www.buymeacoffee.com/salmanfarisvp" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
