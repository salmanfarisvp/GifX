#!/bin/bash

# Usage function
usage() {
  echo "Usage: $0 <input_video> [output_gif] [fps] [scale] [max_colors]"
  echo ""
  echo "Converts a video to a GIF with optional parameters for customization."
  echo ""
  echo "Arguments:"
  echo "  input_video   Path to the input video file."
  echo "  output_gif    Output GIF filename (default: output.gif)."
  echo "  fps           Frames per second (default: 15)."
  echo "  scale         Width of the GIF in pixels (default: 800)."
  echo "  max_colors    Palette colors, 16-256 (default: 256). Lower = smaller file."
  echo ""
  echo "Common FPS Values:"
  echo "  5  - Low motion (e.g., slideshows), minimal size."
  echo "  10 - Moderate motion, compact size."
  echo "  15 - Standard (default), balanced quality and size."
  echo "  24 - Smooth, cinematic quality, larger size."
  echo "  30 - Maximum smoothness, very large size."
  echo ""
  echo "Common Scale Values (Width in Pixels):"
  echo "  400 - Low resolution, thumbnails, small size."
  echo "  600 - Medium resolution, general-purpose sharing."
  echo "  800 - High resolution (default), good for presentations."
  echo "  1000+ - Full resolution, detailed visuals, large size."
  echo ""
  echo "Compression (max_colors):"
  echo "  256 - No compression (default), best quality."
  echo "  128 - Light compression, slightly smaller file."
  echo "  64  - Medium compression, noticeably smaller."
  echo "  32  - Heavy compression, much smaller file."
  echo "  16  - Maximum compression, smallest file."
  exit 1
}

# Check if the input video is provided
if [ -z "$1" ]; then
  usage
fi

# Variables
INPUT_VIDEO="$1"
OUTPUT_GIF="${2:-output.gif}"
FPS="${3:-15}"
SCALE="${4:-800}"
MAX_COLORS="${5:-256}"
PALETTE="palette.png"

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
  echo "Error: ffmpeg is not installed. Please install it and try again."
  exit 1
fi

# Check if the input file exists
if [ ! -f "$INPUT_VIDEO" ]; then
  echo "Error: Input file '$INPUT_VIDEO' not found."
  exit 1
fi

# Print selected parameters for clarity
echo "Input Video: $INPUT_VIDEO"
echo "Output GIF: $OUTPUT_GIF"
echo "FPS: $FPS"
echo "Scale: $SCALE"
echo "Max Colors: $MAX_COLORS"

if [ "$MAX_COLORS" -lt 256 ] 2>/dev/null; then
  PALETTE_FILTER="fps=$FPS,scale=$SCALE:-1:flags=lanczos,palettegen=max_colors=$MAX_COLORS"
else
  PALETTE_FILTER="fps=$FPS,scale=$SCALE:-1:flags=lanczos,palettegen"
fi

ffmpeg -i "$INPUT_VIDEO" -vf "$PALETTE_FILTER" "$PALETTE"

# Create GIF using the palette
ffmpeg -i "$INPUT_VIDEO" -i "$PALETTE" -lavfi "fps=$FPS,scale=$SCALE:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=sierra2_4a" "$OUTPUT_GIF"

# Clean up palette file
rm -f "$PALETTE"

# Confirm output
echo "GIF created successfully: $OUTPUT_GIF"
