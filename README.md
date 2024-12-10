# GifX

GifX is a command-line tool for converting video files into high-quality GIFs. Built with the assistance of ChatGPT, this tool simplifies the process of creating GIFs by providing customizable options for frame rate, resolution, and quality.

<hr>

## Features
* Converts videos to GIFs in a few simple steps.
* Supports adjustable frame rates (fps) and resolutions (scale).
* Generates optimized palettes for high-quality color reproduction.
* Provides flexibility for creating GIFs for different use cases.

## Installation
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
./gifx.sh <input_video> [output_gif] [fps] [scale]
```

### Arguments
* `<input_video>`: Path to the input video file (required).
* `[output_gif]`: Name of the output GIF file (optional; default: output.gif).
* `[fps]`: Frames per second for the GIF (optional; default: 15).
* `[scale]`: Width of the GIF in pixels (optional; default: 800).

### Examples

1. Basic Usage (Defaults):
   
```
./gifx.sh input.mp4
```
* Creates a GIF (`output.gif`) with `fps=15` and `scale=800`.

2. Custom Output Filename:
   
```
./gifx.sh input.mp4 my_animation.gif
```
* Outputs `my_animation.gif`.

3. Custom Frame Rate and Scale:

```
./gifx.sh input.mp4 my_animation.gif 10 600
````

4. Help: If the command is run without arguments, it displays a usage guide.

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
 
<hr>


## How It Works
1. Palette Generation: Generates an optimized color palette to ensure the highest possible GIF quality:
```
ffmpeg -i input.mp4 -vf "fps=<fps>,scale=<scale>:-1:flags=lanczos,palettegen" palette.png
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
### Version 1.0
* Initial release.
* Support for customizable `fps` and `scale`.
* High-quality palette-based GIF creation

<hr>

## License
GifX is open-source and licensed under the MIT License. Feel free to use, modify, and distribute it.

<hr>

## Acknowledgment

This tool was developed with the support of ChatGPT, an AI assistant by OpenAI. ChatGPT played a key role in designing and optimizing the tool for ease of use and performance.

<hr>

## Contact

For issues, suggestions, or contributions, please reach out via email or submit a pull request on the project's GitHub repository.

