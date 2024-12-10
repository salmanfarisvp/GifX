#!/bin/bash

# Usage function
usage() {
  echo "Usage: $0 <input_video> [output_gif] [fps] [scale]"
  echo ""
  echo "Converts a video to a GIF with optional parameters for customization."
  echo ""
  echo "Arguments:"
  echo "  input_video   Path to the input video file."
  echo "  output_gif    Output GIF filename (default: output.gif)."
  echo "  fps           Frames per second (default: 15)."
  echo "  scale         Width of the GIF in pixels (default: 800)."
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
  exit 1
}

# Check if the input video is provided
if [ -z "$1" ]; then
  usage
fi

# Variables
INPUT_VIDEO="$1"
OUTPUT_GIF="${2:-output.gif}"  # Default output is output.gif
FPS="${3:-15}"  # Default FPS is 15
SCALE="${4:-800}"  # Default scale is 800 pixels wide
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

# Generate palette
ffmpeg -i "$INPUT_VIDEO" -vf "fps=$FPS,scale=$SCALE:-1:flags=lanczos,palettegen" "$PALETTE"

# Create GIF using the palette
ffmpeg -i "$INPUT_VIDEO" -i "$PALETTE" -lavfi "fps=$FPS,scale=$SCALE:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=sierra2_4a" "$OUTPUT_GIF"

# Clean up palette file
rm -f "$PALETTE"

# Confirm output
echo "GIF created successfully: $OUTPUT_GIF"
