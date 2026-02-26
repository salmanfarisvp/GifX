# GifX

GifX converts videos into high-quality GIFs. Use it as a **web app** (runs entirely in the browser — no installs needed) or as a **command-line tool**.

<a href="https://www.buymeacoffee.com/salmanfarisvp" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

<hr>

## Features
* **Web app** — drag-and-drop video conversion in the browser, no dependencies required
* **Quality presets** — Ultra Small, Small, Medium, High for one-click simplicity
* **Advanced controls** — fine-tune FPS, width, and compression (palette color reduction)
* **Video metadata** — see duration, resolution, and file size before converting
* **100% private** — all processing happens locally, nothing is uploaded
* **CLI tool** — shell script for batch/automated workflows
* Optimized palette-based GIF creation for superior color reproduction

## Web App

GifX is available as a web app that runs entirely in the browser — no installs needed. Built with [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) (FFmpeg compiled to WebAssembly), all video processing happens client-side. Nothing is uploaded to any server.

To run locally:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

<hr>

## CLI Tool

### Prerequisites
* Install ffmpeg:
```bash
sudo apt install ffmpeg     # Ubuntu/Debian
brew install ffmpeg         # macOS
```
* Make the GifX script executable
```
chmod +x gifx.sh
```

<hr>

## Usage
Run the tool with the following command:

```
./gifx.sh <input_video> [output_gif] [fps] [scale] [max_colors]
```

### Arguments
* `<input_video>`: Path to the input video file (required).
* `[output_gif]`: Name of the output GIF file (optional; default: output.gif).
* `[fps]`: Frames per second for the GIF (optional; default: 15).
* `[scale]`: Width of the GIF in pixels (optional; default: 800).
* `[max_colors]`: Palette colors, 16–256 (optional; default: 256). Lower values = smaller file.

### Examples

1. Basic Usage (Defaults):
   
```
./gifx.sh input.mp4
```
* Creates a GIF (`output.gif`) with `fps=15`, `scale=800`, and full 256-color palette.

2. Custom Output Filename:
   
```
./gifx.sh input.mp4 my_animation.gif
```
* Outputs `my_animation.gif`.

3. Custom Frame Rate and Scale:

```
./gifx.sh input.mp4 my_animation.gif 10 600
```

4. With Compression (fewer colors = smaller file):

```
./gifx.sh input.mp4 compressed.gif 15 800 64
```
* Creates a GIF with 64 colors instead of 256, significantly reducing file size.

5. Help: If the command is run without arguments, it displays a usage guide.

<hr>

## Parameter Details
### FPS (Frames Per Second)
* Defines how many frames are used per second in the GIF.
* Lower FPS reduces file size but may make the animation less smooth.
* Recommended values:
  * `5-10`: For slow-moving or static content.
  * `15` (default): Balanced quality and size.
  * `24-30`: For detailed or high-motion content.

### Scale (Resolution)
* Sets the width of the GIF in pixels. The height adjusts automatically to maintain the aspect ratio.
* Lower resolutions reduce file size.
* Recommended values:
  * 400: Small previews or thumbnails.
  * 600: Medium resolution for sharing.
  * 800 (default): High-quality GIFs.
  * 1000+: Detailed visuals or presentations.

### Compression (max_colors)
* Controls how many colors are in the GIF palette. Fewer colors = smaller file size.
* Recommended values:
  * 256 (default): No compression, best quality.
  * 128: Light compression, slightly smaller.
  * 64: Medium compression, noticeably smaller.
  * 32: Heavy compression, much smaller.
  * 16: Maximum compression, smallest file.
 
<hr>


## How It Works
1. Palette Generation: Generates an optimized color palette (with optional `max_colors` for compression):
```
ffmpeg -i input.mp4 -vf "fps=<fps>,scale=<scale>:-1:flags=lanczos,palettegen=max_colors=<max_colors>" palette.png
```
2. GIF Creation: Creates the GIF using the palette:
```
ffmpeg -i input.mp4 -i palette.png -lavfi "fps=<fps>,scale=<scale>:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=sierra2_4a" output.gif
```
3. Clean-Up: Deletes the temporary palette file after use.

<hr>

## Troubleshooting
1. ffmpeg not found:
   * Ensure `ffmpeg` is installed and accessible in your system's PATH.
2. Input file not found:
   * Double-check the path to your input video file.
3. Output GIF is too large:
   * Reduce fps or scale values to create a smaller GIF.
  
<hr>

## FAQ
1. What video formats does GifX support?
GifX supports all video formats supported by `ffmpeg`, including `.mp4`, `.mkv`, `.avi`, `.mov`, etc.

2. Can I use this tool on Windows?
Yes, you can run the script on Windows through a Unix-like environment like Git Bash or WSL (Windows Subsystem for Linux).

<hr>

## Changelog
### Version 2.0
* Web app powered by ffmpeg.wasm — browser-based conversion with zero dependencies
* Quality presets (Ultra Small, Small, Medium, High) for one-click usage
* Advanced controls for FPS, width, and compression
* Video metadata display (duration, resolution, file size) before conversion
* Buy Me a Coffee support link

### Version 1.0
* Initial release
* CLI tool with customizable FPS and scale
* High-quality palette-based GIF creation

<hr>

## License
GifX is open-source and licensed under the MIT License. Feel free to use, modify, and distribute it.

<hr>

## Support

If you find GifX useful and would like to support its development, consider buying me a coffee. Your support means a lot and helps keep the project going!

<a href="https://www.buymeacoffee.com/salmanfarisvp" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

<hr>

## Contact

For issues, suggestions, or contributions, please reach out via email or submit a pull request on the project's GitHub repository.

