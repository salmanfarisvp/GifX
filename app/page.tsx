"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type Status = "idle" | "ready" | "loading" | "converting" | "done" | "error";
type Quality = "ultra" | "small" | "medium" | "high" | "custom";

interface Preset {
  fps: number;
  scale: number;
  maxColors: number;
  label: string;
  desc: string;
}

const QUALITY_PRESETS: Record<Exclude<Quality, "custom">, Preset> = {
  ultra: {
    fps: 5,
    scale: 240,
    maxColors: 32,
    label: "Ultra Small",
    desc: "Tiniest file size",
  },
  small: {
    fps: 10,
    scale: 320,
    maxColors: 128,
    label: "Small",
    desc: "Compact file size",
  },
  medium: {
    fps: 15,
    scale: 480,
    maxColors: 256,
    label: "Medium",
    desc: "Balanced quality & size",
  },
  high: {
    fps: 24,
    scale: 800,
    maxColors: 256,
    label: "High",
    desc: "Best quality",
  },
};

const FPS_PRESETS = [5, 10, 15, 24, 30];
const SCALE_PRESETS = [320, 480, 640, 800, 1080];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function colorsFromCompression(pct: number) {
  return Math.round(Math.pow(2, 8 - (pct / 100) * 4));
}

function compressionFromColors(colors: number) {
  return Math.round(((8 - Math.log2(colors)) / 4) * 100);
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [video, setVideo] = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [gifURL, setGifURL] = useState("");
  const [gifSize, setGifSize] = useState(0);

  const [quality, setQuality] = useState<Quality>("medium");
  const [fps, setFps] = useState(15);
  const [scale, setScale] = useState(480);
  const [maxColors, setMaxColors] = useState(256);
  const [compression, setCompression] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);

  const applyPreset = useCallback((q: Exclude<Quality, "custom">) => {
    const p = QUALITY_PRESETS[q];
    setQuality(q);
    setFps(p.fps);
    setScale(p.scale);
    setMaxColors(p.maxColors);
    setCompression(compressionFromColors(p.maxColors));
  }, []);

  const handleAdvancedChange = useCallback(
    (newFps: number, newScale: number, newCompression: number) => {
      setFps(newFps);
      setScale(newScale);
      setCompression(newCompression);
      const colors = colorsFromCompression(newCompression);
      setMaxColors(colors);

      const match = (
        Object.entries(QUALITY_PRESETS) as [Exclude<Quality, "custom">, Preset][]
      ).find(
        ([, p]) => p.fps === newFps && p.scale === newScale && p.maxColors === colors,
      );
      setQuality(match ? match[0] : "custom");
    },
    [],
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("video/")) {
        setError("Please select a video file.");
        setStatus("error");
        return;
      }
      if (videoURL) URL.revokeObjectURL(videoURL);
      if (gifURL) URL.revokeObjectURL(gifURL);
      setVideo(file);
      setVideoURL(URL.createObjectURL(file));
      setGifURL("");
      setGifSize(0);
      setError("");
      setStatus("ready");
    },
    [videoURL, gifURL],
  );

  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !videoURL) return;
    const onMeta = () => {
      setVideoDuration(el.duration);
      setVideoWidth(el.videoWidth);
      setVideoHeight(el.videoHeight);
    };
    el.addEventListener("loadedmetadata", onMeta);
    return () => el.removeEventListener("loadedmetadata", onMeta);
  }, [videoURL]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const convert = async () => {
    if (!video) return;

    try {
      if (!ffmpegRef.current) {
        setStatus("loading");
        setStep("Downloading converter engine (~30 MB, one-time)…");

        const ffmpeg = new FFmpeg();
        ffmpeg.on("progress", ({ progress: p }) => {
          setProgress(Math.min(Math.max(Math.round(p * 100), 0), 100));
        });

        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });

        ffmpegRef.current = ffmpeg;
      }

      const ffmpeg = ffmpegRef.current;
      setStatus("converting");
      setProgress(0);

      setStep("Reading video file…");
      await ffmpeg.writeFile("input", await fetchFile(video));

      const paletteFilter =
        maxColors < 256
          ? `fps=${fps},scale=${scale}:-1:flags=lanczos,palettegen=max_colors=${maxColors}`
          : `fps=${fps},scale=${scale}:-1:flags=lanczos,palettegen`;

      setStep("Generating color palette…");
      setProgress(0);
      await ffmpeg.exec(["-i", "input", "-vf", paletteFilter, "-y", "palette.png"]);

      setStep("Creating GIF…");
      setProgress(0);
      await ffmpeg.exec([
        "-i",
        "input",
        "-i",
        "palette.png",
        "-lavfi",
        `fps=${fps},scale=${scale}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=sierra2_4a`,
        "-y",
        "output.gif",
      ]);

      setStep("Finalizing…");
      const data = (await ffmpeg.readFile("output.gif")) as Uint8Array;
      const blob = new Blob([new Uint8Array(data)], { type: "image/gif" });

      if (gifURL) URL.revokeObjectURL(gifURL);
      setGifURL(URL.createObjectURL(blob));
      setGifSize(data.length);
      setStatus("done");
      setStep("");

      await ffmpeg.deleteFile("input");
      await ffmpeg.deleteFile("palette.png");
      await ffmpeg.deleteFile("output.gif");
    } catch (err) {
      console.error("Conversion failed:", err);
      setError(
        err instanceof Error ? err.message : "Conversion failed. Please try again.",
      );
      setStatus("error");
    }
  };

  const reset = () => {
    if (videoURL) URL.revokeObjectURL(videoURL);
    if (gifURL) URL.revokeObjectURL(gifURL);
    setVideo(null);
    setVideoURL("");
    setVideoDuration(0);
    setVideoWidth(0);
    setVideoHeight(0);
    setGifURL("");
    setGifSize(0);
    setProgress(0);
    setStep("");
    setError("");
    setStatus("idle");
  };

  const isLocked = status === "loading" || status === "converting";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="pt-12 pb-6 text-center">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-500 to-purple-700 bg-clip-text text-transparent">
          GifX
        </h1>
        <p className="mt-2 text-slate-500 text-lg">
          Convert videos to high-quality GIFs — right in your browser
        </p>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
          {/* ── Upload Zone ── */}
          {status === "idle" && (
            <div
              className={`m-6 border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                dragOver
                  ? "border-violet-400 bg-violet-50"
                  : "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <svg
                className="mx-auto h-16 w-16 text-slate-300"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="mt-4 text-lg font-medium text-slate-700">
                Drop your video here
              </p>
              <p className="mt-1 text-sm text-slate-400">
                or click to browse &middot; MP4, WebM, MOV, AVI
              </p>
            </div>
          )}

          {/* ── Video Preview + Controls ── */}
          {(status === "ready" || isLocked) && (
            <div className="p-6">
              {/* Video preview */}
              <div className="relative rounded-xl overflow-hidden bg-black">
                <video
                  ref={videoElRef}
                  src={videoURL}
                  controls
                  className="w-full max-h-80 object-contain"
                />
              </div>

              {/* Video metadata */}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                <span className="truncate max-w-[60%]">{video?.name}</span>
                <span>{video ? formatSize(video.size) : ""}</span>
                {videoDuration > 0 && <span>{formatDuration(videoDuration)}</span>}
                {videoWidth > 0 && (
                  <span>
                    {videoWidth}&times;{videoHeight}
                  </span>
                )}
              </div>

              {/* ── Quality Presets ── */}
              <div className="mt-6">
                <label className="text-sm font-medium text-slate-700">Quality</label>
                <div className="mt-2 grid grid-cols-4 gap-3">
                  {(
                    Object.entries(QUALITY_PRESETS) as [
                      Exclude<Quality, "custom">,
                      Preset,
                    ][]
                  ).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      disabled={isLocked}
                      className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                        quality === key
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span
                        className={`block text-sm font-semibold ${
                          quality === key ? "text-violet-700" : "text-slate-700"
                        }`}
                      >
                        {preset.label}
                      </span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        {preset.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Advanced Toggle ── */}
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                disabled={isLocked}
                className="mt-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
                Advanced{quality === "custom" ? " (Custom)" : ""}
              </button>

              {/* ── Advanced Panel ── */}
              {showAdvanced && (
                <div className="mt-3 space-y-5 rounded-xl bg-slate-50 p-4 border border-slate-100">
                  {/* FPS */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-slate-700">
                        Frames per second
                      </label>
                      <span className="text-sm font-mono text-violet-600 font-semibold">
                        {fps} fps
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={1}
                      value={fps}
                      onChange={(e) =>
                        handleAdvancedChange(Number(e.target.value), scale, compression)
                      }
                      disabled={isLocked}
                      className="w-full accent-violet-600"
                    />
                    <div className="flex justify-between mt-1">
                      {FPS_PRESETS.map((v) => (
                        <button
                          key={v}
                          onClick={() => handleAdvancedChange(v, scale, compression)}
                          disabled={isLocked}
                          className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                            fps === v
                              ? "bg-violet-100 text-violet-700 font-medium"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Width */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-slate-700">Width</label>
                      <span className="text-sm font-mono text-violet-600 font-semibold">
                        {scale}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={200}
                      max={1200}
                      step={20}
                      value={scale}
                      onChange={(e) =>
                        handleAdvancedChange(fps, Number(e.target.value), compression)
                      }
                      disabled={isLocked}
                      className="w-full accent-violet-600"
                    />
                    <div className="flex justify-between mt-1">
                      {SCALE_PRESETS.map((v) => (
                        <button
                          key={v}
                          onClick={() => handleAdvancedChange(fps, v, compression)}
                          disabled={isLocked}
                          className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                            scale === v
                              ? "bg-violet-100 text-violet-700 font-medium"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          {v}px
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compression */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-slate-700">
                        Compression
                      </label>
                      <span className="text-sm font-mono text-violet-600 font-semibold">
                        {compression}%
                        <span className="text-slate-400 font-normal ml-1">
                          ({maxColors} colors)
                        </span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={compression}
                      onChange={(e) =>
                        handleAdvancedChange(fps, scale, Number(e.target.value))
                      }
                      disabled={isLocked}
                      className="w-full accent-violet-600"
                    />
                    <div className="flex justify-between mt-1 text-xs text-slate-400">
                      <span>Best quality</span>
                      <span>Smallest file</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Convert Button ── */}
              <button
                onClick={convert}
                disabled={isLocked}
                className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-200"
              >
                {status === "ready"
                  ? "Convert to GIF"
                  : status === "loading"
                    ? "Loading Engine…"
                    : "Converting…"}
              </button>

              {/* Progress bar */}
              {isLocked && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-600">{step}</span>
                    {status === "converting" && (
                      <span className="text-violet-600 font-mono">{progress}%</span>
                    )}
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    {status === "loading" ? (
                      <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-pulse w-full" />
                    ) : (
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Result ── */}
          {status === "done" && gifURL && (
            <div className="p-6">
              <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gifURL} alt="Converted GIF" className="w-full" />
              </div>

              <p className="mt-3 text-sm text-slate-500">
                GIF &middot; {formatSize(gifSize)} &middot; {fps}&nbsp;fps &middot;{" "}
                {scale}px wide
                {maxColors < 256 && <> &middot; {maxColors} colors</>}
              </p>

              <div className="mt-6 flex gap-3">
                <a
                  href={gifURL}
                  download={video?.name?.replace(/\.[^.]+$/, ".gif") || "output.gif"}
                  className="flex-1 py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 shadow-lg shadow-violet-200 text-center"
                >
                  Download GIF
                </a>
                <button
                  onClick={reset}
                  className="py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  New
                </button>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {status === "error" && (
            <div className="p-6">
              <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
              <button
                onClick={reset}
                className="mt-4 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 text-center space-y-4">
          <p className="text-sm text-slate-400">
            Powered by FFmpeg.wasm &middot; Runs entirely in your browser &middot; No
            uploads, 100% private
          </p>
          <div>
            <p className="text-sm text-slate-400 mb-2">
              If you enjoy this tool, consider supporting the project
            </p>
            <a
              href="https://www.buymeacoffee.com/salmanfarisvp"
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png"
                alt="Buy Me A Coffee"
                className="h-[50px] w-auto mx-auto"
              />
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
