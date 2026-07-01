"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

interface VisitorStats {
  total: number;
  unique: number;
}

function useVisitorStats() {
  const [stats, setStats] = useState<VisitorStats | null>(null);

  useEffect(() => {
    fetch("/api/visitors")
      .then((r) => r.json())
      .then((data) => {
        if (data.total !== undefined) {
          setStats({ total: data.total, unique: data.unique });
        }
      })
      .catch(() => {});
  }, []);

  return stats;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

type ActiveTab = "convert" | "compress" | "image";
type Status = "idle" | "ready" | "loading" | "converting" | "done" | "error";
type Quality = "ultra" | "small" | "medium" | "high" | "custom";
type CompressStatus = "idle" | "ready" | "loading" | "compressing" | "done" | "error";
type CompressLevel = "light" | "medium" | "heavy" | "custom";

interface Preset {
  fps: number;
  scale: number;
  maxColors: number;
  label: string;
  desc: string;
}

interface CompressPreset {
  colors: number;
  scalePct: number;
  fpsReduce: boolean;
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

const COMPRESS_PRESETS: Record<Exclude<CompressLevel, "custom">, CompressPreset> = {
  light: { colors: 200, scalePct: 100, fpsReduce: false, label: "Light", desc: "Slight reduction" },
  medium: { colors: 128, scalePct: 75, fpsReduce: false, label: "Medium", desc: "Balanced" },
  heavy: { colors: 64, scalePct: 50, fpsReduce: true, label: "Heavy", desc: "Max compression" },
};

const FPS_PRESETS = [5, 10, 15, 24, 30];
const SCALE_PRESETS = [320, 480, 640, 800, 1080];

type ImageFormat = "png" | "jpeg" | "webp" | "bmp" | "tiff" | "gif";
type ImageStatus = "idle" | "ready" | "loading" | "converting" | "done" | "error";

interface ImageFormatOption {
  ext: string;
  label: string;
  mime: string;
  hasQuality: boolean;
}

const IMAGE_FORMATS: Record<ImageFormat, ImageFormatOption> = {
  png: { ext: "png", label: "PNG", mime: "image/png", hasQuality: false },
  jpeg: { ext: "jpg", label: "JPEG", mime: "image/jpeg", hasQuality: true },
  webp: { ext: "webp", label: "WebP", mime: "image/webp", hasQuality: true },
  bmp: { ext: "bmp", label: "BMP", mime: "image/bmp", hasQuality: false },
  tiff: { ext: "tiff", label: "TIFF", mime: "image/tiff", hasQuality: false },
  gif: { ext: "gif", label: "GIF", mime: "image/gif", hasQuality: false },
};

type ImgQualityLevel = "small" | "medium" | "high";

interface ImgQualityPreset {
  value: number;
  label: string;
  desc: string;
}

const IMG_QUALITY_PRESETS: Record<ImgQualityLevel, ImgQualityPreset> = {
  small: { value: 50, label: "Small", desc: "Tiniest file" },
  medium: { value: 75, label: "Medium", desc: "Balanced" },
  high: { value: 95, label: "High", desc: "Best quality" },
};

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/bmp,image/tiff,image/gif";

function detectImageFormat(mime: string): ImageFormat | null {
  const map: Record<string, ImageFormat> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/gif": "gif",
  };
  return map[mime] || null;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/gif": "gif",
  };
  return map[mime] || "png";
}

interface ImgBatchItem {
  id: string;
  file: File;
  inputURL: string;
  inputSize: number;
  status: "pending" | "converting" | "done" | "error";
  outputURL?: string;
  outputSize?: number;
  error?: string;
}

interface VideoBatchItem {
  id: string;
  file: File;
  status: "pending" | "converting" | "done" | "error";
  gifURL?: string;
  gifSize?: number;
  webpURL?: string;
  webpSize?: number;
  error?: string;
}

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

function formatTimestamp(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function colorsFromCompression(pct: number) {
  return Math.round(Math.pow(2, 8 - (pct / 100) * 4));
}

function compressionFromColors(colors: number) {
  return Math.round(((8 - Math.log2(colors)) / 4) * 100);
}

export default function Home() {
  const visitorStats = useVisitorStats();
  const [activeTab, setActiveTab] = useState<ActiveTab>("convert");

  // ─── Video-to-GIF state ───
  const [status, setStatus] = useState<Status>("idle");
  const [video, setVideo] = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [gifURL, setGifURL] = useState("");
  const [gifSize, setGifSize] = useState(0);
  const [webpURL, setWebpURL] = useState("");
  const [webpSize, setWebpSize] = useState(0);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

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

  // ─── Compress GIF state ───
  const [compressStatus, setCompressStatus] = useState<CompressStatus>("idle");
  const [compressGif, setCompressGif] = useState<File | null>(null);
  const [compressGifURL, setCompressGifURL] = useState("");
  const [compressGifSize, setCompressGifSize] = useState(0);
  const [compressLevel, setCompressLevel] = useState<CompressLevel>("medium");
  const [compressColors, setCompressColors] = useState(128);
  const [compressScalePct, setCompressScalePct] = useState(75);
  const [compressFpsReduce, setCompressFpsReduce] = useState(false);
  const [compressShowAdvanced, setCompressShowAdvanced] = useState(false);
  const [compressedURL, setCompressedURL] = useState("");
  const [compressedSize, setCompressedSize] = useState(0);
  const [compressProgress, setCompressProgress] = useState(0);
  const [compressStep, setCompressStep] = useState("");
  const [compressError, setCompressError] = useState("");
  const [compressDragOver, setCompressDragOver] = useState(false);

  // ─── Image Convert state ───
  const [imgStatus, setImgStatus] = useState<ImageStatus>("idle");
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgFileURL, setImgFileURL] = useState("");
  const [imgFileSize, setImgFileSize] = useState(0);
  const [imgOutputFormat, setImgOutputFormat] = useState<ImageFormat>("png");
  const [imgQuality, setImgQuality] = useState(75);
  const [imgQualityLevel, setImgQualityLevel] = useState<ImgQualityLevel>("medium");
  const [imgOutputURL, setImgOutputURL] = useState("");
  const [imgOutputSize, setImgOutputSize] = useState(0);
  const [imgProgress, setImgProgress] = useState(0);
  const [imgStep, setImgStep] = useState("");
  const [imgError, setImgError] = useState("");
  const [imgDragOver, setImgDragOver] = useState(false);

  // ─── Batch state ───
  const [imgBatchItems, setImgBatchItems] = useState<ImgBatchItem[]>([]);
  const [imgBatchMode, setImgBatchMode] = useState(false);
  const [videoBatchItems, setVideoBatchItems] = useState<VideoBatchItem[]>([]);
  const [videoBatchMode, setVideoBatchMode] = useState(false);

  // ─── Shared refs ───
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const progressSetterRef = useRef<(val: number) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compressFileInputRef = useRef<HTMLInputElement>(null);
  const imgFileInputRef = useRef<HTMLInputElement>(null);
  const imgBatchFileInputRef = useRef<HTMLInputElement>(null);
  const videoBatchFileInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);

  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);

  // ─── Shared FFmpeg loader ───
  const ensureFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) return ffmpegRef.current;

    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress: p }) => {
      progressSetterRef.current(Math.min(Math.max(Math.round(p * 100), 0), 100));
    });

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }, []);

  // ─── Video-to-GIF handlers ───
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
      if (webpURL) URL.revokeObjectURL(webpURL);
      setVideo(file);
      setVideoURL(URL.createObjectURL(file));
      setGifURL("");
      setGifSize(0);
      setWebpURL("");
      setWebpSize(0);
      setError("");
      setStatus("ready");
    },
    [videoURL, gifURL, webpURL],
  );

  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !videoURL) return;
    const onMeta = () => {
      setVideoDuration(el.duration);
      setVideoWidth(el.videoWidth);
      setVideoHeight(el.videoHeight);
      setTrimStart(0);
      setTrimEnd(el.duration);
    };
    el.addEventListener("loadedmetadata", onMeta);
    return () => el.removeEventListener("loadedmetadata", onMeta);
  }, [videoURL]);

  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  trimStartRef.current = trimStart;
  trimEndRef.current = trimEnd;

  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !videoURL || videoDuration <= 0) return;

    const onPlay = () => {
      const ts = trimStartRef.current;
      const te = trimEndRef.current;
      if (el.currentTime < ts - 0.05 || el.currentTime >= te - 0.05) {
        el.currentTime = ts;
      }
    };

    const onTimeUpdate = () => {
      const te = trimEndRef.current;
      if (!el.paused && el.currentTime >= te) {
        el.pause();
        el.currentTime = te;
      }
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [videoURL, videoDuration]);

  useEffect(() => {
    if (!videoURL || videoDuration <= 0) return;
    let cancelled = false;

    const generate = async () => {
      const thumbVideo = document.createElement("video");
      thumbVideo.src = videoURL;
      thumbVideo.crossOrigin = "anonymous";
      thumbVideo.muted = true;
      thumbVideo.preload = "auto";

      await new Promise<void>((res) => {
        thumbVideo.onloadeddata = () => res();
        thumbVideo.load();
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const thumbWidth = 120;
      const thumbHeight = Math.round(
        (thumbVideo.videoHeight / thumbVideo.videoWidth) * thumbWidth,
      );
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      const count = Math.min(20, Math.max(8, Math.ceil(videoDuration)));
      const frames: string[] = [];

      for (let i = 0; i < count; i++) {
        if (cancelled) return;
        const time = (i / count) * videoDuration;
        thumbVideo.currentTime = time;
        await new Promise<void>((res) => {
          thumbVideo.onseeked = () => res();
        });
        ctx.drawImage(thumbVideo, 0, 0, thumbWidth, thumbHeight);
        frames.push(canvas.toDataURL("image/jpeg", 0.5));
      }

      if (!cancelled) setThumbnails(frames);
    };

    generate();
    return () => { cancelled = true; };
  }, [videoURL, videoDuration]);

  const timeToPercent = useCallback(
    (t: number) => (videoDuration > 0 ? (t / videoDuration) * 100 : 0),
    [videoDuration],
  );

  const pointerToTime = useCallback(
    (clientX: number) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect || videoDuration <= 0) return 0;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * videoDuration * 10) / 10;
    },
    [videoDuration],
  );

  const onPointerDown = useCallback(
    (handle: "start" | "end") => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = handle;
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const t = pointerToTime(e.clientX);
      const el = videoElRef.current;
      if (draggingRef.current === "start") {
        const clamped = Math.min(t, trimEnd - 0.1);
        setTrimStart(Math.max(0, clamped));
        if (el) { el.pause(); el.currentTime = Math.max(0, clamped); }
      } else {
        const clamped = Math.max(t, trimStart + 0.1);
        setTrimEnd(Math.min(videoDuration, clamped));
        if (el) { el.pause(); el.currentTime = Math.min(videoDuration, clamped); }
      }
    },
    [pointerToTime, trimStart, trimEnd, videoDuration],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const handleVideoFiles = useCallback(
    (files: File[]) => {
      if (files.length === 1) {
        setVideoBatchMode(false);
        handleFile(files[0]);
        return;
      }
      const valid: VideoBatchItem[] = [];
      for (const file of files) {
        if (file.type.startsWith("video/")) {
          valid.push({ id: `${file.name}-${file.size}-${valid.length}`, file, status: "pending" });
        }
      }
      if (valid.length === 0) {
        setError("Please select video files.");
        setStatus("error");
        return;
      }
      setVideoBatchItems(valid);
      setVideoBatchMode(true);
      setStatus("ready");
      setError("");
    },
    [handleFile],
  );

  const addMoreVideoFiles = useCallback((files: File[]) => {
    const newItems: VideoBatchItem[] = [];
    for (const file of files) {
      if (file.type.startsWith("video/")) {
        newItems.push({ id: `${file.name}-${file.size}-${newItems.length}`, file, status: "pending" });
      }
    }
    if (newItems.length > 0) {
      setVideoBatchItems(prev => [...prev, ...newItems]);
      setStatus("ready");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleVideoFiles(files);
    },
    [handleVideoFiles],
  );

  const convert = async () => {
    if (!video) return;

    try {
      if (!ffmpegRef.current) {
        setStatus("loading");
        setStep("Downloading converter engine (~30 MB, one-time)…");
        progressSetterRef.current = setProgress;
        await ensureFFmpeg();
      }

      const ffmpeg = ffmpegRef.current!;
      progressSetterRef.current = setProgress;
      setStatus("converting");
      setProgress(0);

      setStep("Reading video file…");
      await ffmpeg.writeFile("input", await fetchFile(video));

      const trimArgs: string[] = [];
      const isTrimmed = trimStart > 0 || (trimEnd > 0 && trimEnd < videoDuration);
      if (isTrimmed) {
        trimArgs.push("-ss", trimStart.toFixed(2));
        trimArgs.push("-t", (trimEnd - trimStart).toFixed(2));
      }

      const paletteFilter =
        maxColors < 256
          ? `fps=${fps},scale=${scale}:-1:flags=lanczos,palettegen=max_colors=${maxColors}`
          : `fps=${fps},scale=${scale}:-1:flags=lanczos,palettegen`;

      setStep("Generating color palette…");
      setProgress(0);
      await ffmpeg.exec([...trimArgs, "-i", "input", "-vf", paletteFilter, "-y", "palette.png"]);

      setStep("Creating GIF…");
      setProgress(0);
      await ffmpeg.exec([
        ...trimArgs,
        "-i",
        "input",
        "-i",
        "palette.png",
        "-lavfi",
        `fps=${fps},scale=${scale}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=sierra2_4a`,
        "-y",
        "output.gif",
      ]);

      setStep("Creating WebP…");
      setProgress(0);
      await ffmpeg.exec([
        ...trimArgs,
        "-i",
        "input",
        "-vf",
        `fps=${fps},scale=${scale}:-1:flags=lanczos`,
        "-vcodec", "libwebp",
        "-lossless", "0",
        "-q:v", "70",
        "-loop", "0",
        "-an",
        "-y",
        "output.webp",
      ]);

      setStep("Finalizing…");
      const gifData = (await ffmpeg.readFile("output.gif")) as Uint8Array;
      const gifBlob = new Blob([new Uint8Array(gifData)], { type: "image/gif" });

      const webpData = (await ffmpeg.readFile("output.webp")) as Uint8Array;
      const webpBlob = new Blob([new Uint8Array(webpData)], { type: "image/webp" });

      if (gifURL) URL.revokeObjectURL(gifURL);
      if (webpURL) URL.revokeObjectURL(webpURL);
      setGifURL(URL.createObjectURL(gifBlob));
      setGifSize(gifData.length);
      setWebpURL(URL.createObjectURL(webpBlob));
      setWebpSize(webpData.length);
      setStatus("done");
      setStep("");

      await ffmpeg.deleteFile("input");
      await ffmpeg.deleteFile("palette.png");
      await ffmpeg.deleteFile("output.gif");
      await ffmpeg.deleteFile("output.webp");
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
    if (webpURL) URL.revokeObjectURL(webpURL);
    setVideo(null);
    setVideoURL("");
    setVideoDuration(0);
    setVideoWidth(0);
    setVideoHeight(0);
    setTrimStart(0);
    setTrimEnd(0);
    setThumbnails([]);
    setGifURL("");
    setGifSize(0);
    setWebpURL("");
    setWebpSize(0);
    setProgress(0);
    setStep("");
    setError("");
    setStatus("idle");
  };

  const convertBatchVideos = async () => {
    const snapshot = videoBatchItems.slice();
    const pendingIndices = snapshot.map((it, i) => (it.status === "pending" ? i : -1)).filter(i => i >= 0);
    if (pendingIndices.length === 0) return;

    try {
      if (!ffmpegRef.current) {
        setStatus("loading");
        setStep("Downloading converter engine (~30 MB, one-time)…");
        progressSetterRef.current = setProgress;
        await ensureFFmpeg();
      }

      setStatus("converting");

      for (const idx of pendingIndices) {
        const item = snapshot[idx];
        setVideoBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, status: "converting" } : it));

        try {
          const ffmpeg = ffmpegRef.current!;
          progressSetterRef.current = setProgress;
          setProgress(0);
          setStep(`Processing ${item.file.name} (${pendingIndices.indexOf(idx) + 1}/${pendingIndices.length})…`);

          await ffmpeg.writeFile("input", await fetchFile(item.file));

          const paletteFilter =
            maxColors < 256
              ? `fps=${fps},scale=${scale}:-1:flags=lanczos,palettegen=max_colors=${maxColors}`
              : `fps=${fps},scale=${scale}:-1:flags=lanczos,palettegen`;

          await ffmpeg.exec(["-i", "input", "-vf", paletteFilter, "-y", "palette.png"]);
          await ffmpeg.exec([
            "-i", "input", "-i", "palette.png",
            "-lavfi", `fps=${fps},scale=${scale}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=sierra2_4a`,
            "-y", "output.gif",
          ]);
          await ffmpeg.exec([
            "-i", "input",
            "-vf", `fps=${fps},scale=${scale}:-1:flags=lanczos`,
            "-vcodec", "libwebp", "-lossless", "0", "-q:v", "70", "-loop", "0", "-an",
            "-y", "output.webp",
          ]);

          const gifData = (await ffmpeg.readFile("output.gif")) as Uint8Array;
          const webpData = (await ffmpeg.readFile("output.webp")) as Uint8Array;
          const gifURL = URL.createObjectURL(new Blob([new Uint8Array(gifData)], { type: "image/gif" }));
          const webpURL = URL.createObjectURL(new Blob([new Uint8Array(webpData)], { type: "image/webp" }));

          setVideoBatchItems(prev => prev.map((it, i) =>
            i === idx ? { ...it, status: "done", gifURL, gifSize: gifData.length, webpURL, webpSize: webpData.length } : it
          ));

          await ffmpeg.deleteFile("input");
          await ffmpeg.deleteFile("palette.png");
          await ffmpeg.deleteFile("output.gif");
          await ffmpeg.deleteFile("output.webp");
        } catch (err) {
          setVideoBatchItems(prev => prev.map((it, i) =>
            i === idx ? { ...it, status: "error", error: err instanceof Error ? err.message : "Failed" } : it
          ));
        }
      }

      setStatus("done");
      setStep("");
      setProgress(0);
    } catch (err) {
      console.error("Batch video conversion failed:", err);
      setError(err instanceof Error ? err.message : "Conversion failed.");
      setStatus("error");
    }
  };

  const resetVideoBatch = () => {
    videoBatchItems.forEach(item => {
      if (item.gifURL) URL.revokeObjectURL(item.gifURL);
      if (item.webpURL) URL.revokeObjectURL(item.webpURL);
    });
    setVideoBatchItems([]);
    setVideoBatchMode(false);
    setStatus("idle");
    setProgress(0);
    setStep("");
    setError("");
  };

  // ─── Compress GIF handlers ───
  const handleCompressFile = useCallback(
    (file: File) => {
      if (file.type !== "image/gif") {
        setCompressError("Please select a GIF file.");
        setCompressStatus("error");
        return;
      }
      if (compressGifURL) URL.revokeObjectURL(compressGifURL);
      if (compressedURL) URL.revokeObjectURL(compressedURL);
      setCompressGif(file);
      setCompressGifURL(URL.createObjectURL(file));
      setCompressGifSize(file.size);
      setCompressedURL("");
      setCompressedSize(0);
      setCompressError("");
      setCompressStatus("ready");
    },
    [compressGifURL, compressedURL],
  );

  const applyCompressPreset = useCallback((level: Exclude<CompressLevel, "custom">) => {
    const p = COMPRESS_PRESETS[level];
    setCompressLevel(level);
    setCompressColors(p.colors);
    setCompressScalePct(p.scalePct);
    setCompressFpsReduce(p.fpsReduce);
  }, []);

  const handleCompressAdvancedChange = useCallback(
    (newColors: number, newScalePct: number, newFpsReduce: boolean) => {
      setCompressColors(newColors);
      setCompressScalePct(newScalePct);
      setCompressFpsReduce(newFpsReduce);

      const match = (
        Object.entries(COMPRESS_PRESETS) as [Exclude<CompressLevel, "custom">, CompressPreset][]
      ).find(
        ([, p]) => p.colors === newColors && p.scalePct === newScalePct && p.fpsReduce === newFpsReduce,
      );
      setCompressLevel(match ? match[0] : "custom");
    },
    [],
  );

  const handleCompressDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setCompressDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleCompressFile(file);
    },
    [handleCompressFile],
  );

  const compressGifFile = async () => {
    if (!compressGif) return;

    try {
      if (!ffmpegRef.current) {
        setCompressStatus("loading");
        setCompressStep("Downloading converter engine (~30 MB, one-time)…");
        progressSetterRef.current = setCompressProgress;
        await ensureFFmpeg();
      }

      const ffmpeg = ffmpegRef.current!;
      progressSetterRef.current = setCompressProgress;
      setCompressStatus("compressing");
      setCompressProgress(0);

      setCompressStep("Reading GIF file…");
      await ffmpeg.writeFile("input.gif", await fetchFile(compressGif));

      const filterParts: string[] = [];
      if (compressFpsReduce) filterParts.push("fps=10");
      if (compressScalePct < 100) filterParts.push(`scale=iw*${compressScalePct / 100}:-1:flags=lanczos`);

      const paletteFilterParts = [...filterParts, `palettegen=max_colors=${compressColors}`];
      const paletteFilter = paletteFilterParts.join(",");

      setCompressStep("Generating optimized palette…");
      setCompressProgress(0);
      await ffmpeg.exec(["-i", "input.gif", "-vf", paletteFilter, "-y", "palette.png"]);

      setCompressStep("Compressing GIF…");
      setCompressProgress(0);

      const mainFilter = filterParts.length > 0
        ? `${filterParts.join(",")} [x]; [x][1:v] paletteuse=dither=sierra2_4a`
        : "[0:v][1:v] paletteuse=dither=sierra2_4a";

      await ffmpeg.exec([
        "-i", "input.gif",
        "-i", "palette.png",
        "-lavfi", mainFilter,
        "-y", "output.gif",
      ]);

      setCompressStep("Finalizing…");
      const data = (await ffmpeg.readFile("output.gif")) as Uint8Array;
      const blob = new Blob([new Uint8Array(data)], { type: "image/gif" });

      if (compressedURL) URL.revokeObjectURL(compressedURL);
      setCompressedURL(URL.createObjectURL(blob));
      setCompressedSize(data.length);
      setCompressStatus("done");
      setCompressStep("");

      await ffmpeg.deleteFile("input.gif");
      await ffmpeg.deleteFile("palette.png");
      await ffmpeg.deleteFile("output.gif");
    } catch (err) {
      console.error("Compression failed:", err);
      setCompressError(
        err instanceof Error ? err.message : "Compression failed. Please try again.",
      );
      setCompressStatus("error");
    }
  };

  const resetCompress = () => {
    if (compressGifURL) URL.revokeObjectURL(compressGifURL);
    if (compressedURL) URL.revokeObjectURL(compressedURL);
    setCompressGif(null);
    setCompressGifURL("");
    setCompressGifSize(0);
    setCompressedURL("");
    setCompressedSize(0);
    setCompressProgress(0);
    setCompressStep("");
    setCompressError("");
    setCompressStatus("idle");
  };

  // ─── Image Convert handlers ───
  const handleImageFile = useCallback(
    (file: File) => {
      const format = detectImageFormat(file.type);
      if (!format) {
        setImgError("Unsupported image format. Please use PNG, JPEG, WebP, BMP, TIFF, or GIF.");
        setImgStatus("error");
        return;
      }
      if (imgFileURL) URL.revokeObjectURL(imgFileURL);
      if (imgOutputURL) URL.revokeObjectURL(imgOutputURL);
      setImgFile(file);
      setImgFileURL(URL.createObjectURL(file));
      setImgFileSize(file.size);
      setImgOutputURL("");
      setImgOutputSize(0);
      setImgError("");
      setImgStatus("ready");
      const defaultFormat: ImageFormat = format === "png" ? "jpeg" : "png";
      setImgOutputFormat(defaultFormat);
    },
    [imgFileURL, imgOutputURL],
  );

  const handleImageFiles = useCallback(
    (files: File[]) => {
      if (files.length === 1) {
        setImgBatchMode(false);
        handleImageFile(files[0]);
        return;
      }
      const valid: ImgBatchItem[] = [];
      for (const file of files) {
        const fmt = detectImageFormat(file.type);
        if (fmt) {
          valid.push({
            id: `${file.name}-${file.size}-${valid.length}`,
            file,
            inputURL: URL.createObjectURL(file),
            inputSize: file.size,
            status: "pending",
          });
        }
      }
      if (valid.length === 0) {
        setImgError("No supported image files. Please use PNG, JPEG, WebP, BMP, TIFF, or GIF.");
        setImgStatus("error");
        return;
      }
      setImgBatchItems(valid);
      setImgBatchMode(true);
      setImgStatus("ready");
      setImgError("");
    },
    [handleImageFile],
  );

  const addMoreImgFiles = useCallback((files: File[]) => {
    const newItems: ImgBatchItem[] = [];
    for (const file of files) {
      const fmt = detectImageFormat(file.type);
      if (fmt) {
        newItems.push({
          id: `${file.name}-${file.size}-${newItems.length}`,
          file,
          inputURL: URL.createObjectURL(file),
          inputSize: file.size,
          status: "pending",
        });
      }
    }
    if (newItems.length > 0) {
      setImgBatchItems(prev => [...prev, ...newItems]);
      setImgStatus("ready");
    }
  }, []);

  const handleImageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setImgDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleImageFiles(files);
    },
    [handleImageFiles],
  );

  const convertImage = async () => {
    if (!imgFile) return;
    try {
      if (!ffmpegRef.current) {
        setImgStatus("loading");
        setImgStep("Downloading converter engine (~30 MB, one-time)…");
        progressSetterRef.current = setImgProgress;
        await ensureFFmpeg();
      }

      const ffmpeg = ffmpegRef.current!;
      progressSetterRef.current = setImgProgress;
      setImgStatus("converting");
      setImgProgress(0);

      const inputExt = mimeToExt(imgFile.type);
      const inputName = `input.${inputExt}`;
      const fmt = IMAGE_FORMATS[imgOutputFormat];
      const outputName = `output.${fmt.ext}`;

      setImgStep("Reading image file…");
      await ffmpeg.writeFile(inputName, await fetchFile(imgFile));

      setImgStep("Converting image…");
      setImgProgress(0);
      const args: string[] = ["-i", inputName];

      if (imgOutputFormat === "jpeg") {
        const qv = Math.round(2 + ((100 - imgQuality) / 100) * 29);
        args.push("-q:v", String(qv));
      } else if (imgOutputFormat === "webp") {
        args.push("-lossless", "0", "-q:v", String(imgQuality));
      }

      args.push("-y", outputName);
      await ffmpeg.exec(args);

      setImgStep("Finalizing…");
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
      const blob = new Blob([new Uint8Array(data)], { type: fmt.mime });

      if (imgOutputURL) URL.revokeObjectURL(imgOutputURL);
      setImgOutputURL(URL.createObjectURL(blob));
      setImgOutputSize(data.length);
      setImgStatus("done");
      setImgStep("");

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error("Image conversion failed:", err);
      setImgError(
        err instanceof Error ? err.message : "Conversion failed. Please try again.",
      );
      setImgStatus("error");
    }
  };

  const resetImage = () => {
    if (imgFileURL) URL.revokeObjectURL(imgFileURL);
    if (imgOutputURL) URL.revokeObjectURL(imgOutputURL);
    setImgFile(null);
    setImgFileURL("");
    setImgFileSize(0);
    setImgOutputURL("");
    setImgOutputSize(0);
    setImgProgress(0);
    setImgStep("");
    setImgError("");
    setImgStatus("idle");
  };

  const convertBatchImages = async () => {
    const snapshot = imgBatchItems.slice();
    const pendingIndices = snapshot.map((it, i) => (it.status === "pending" ? i : -1)).filter(i => i >= 0);
    if (pendingIndices.length === 0) return;

    try {
      if (!ffmpegRef.current) {
        setImgStatus("loading");
        setImgStep("Downloading converter engine (~30 MB, one-time)…");
        progressSetterRef.current = setImgProgress;
        await ensureFFmpeg();
      }

      setImgStatus("converting");

      for (const idx of pendingIndices) {
        const item = snapshot[idx];
        setImgBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, status: "converting" } : it));

        try {
          const ffmpeg = ffmpegRef.current!;
          progressSetterRef.current = setImgProgress;
          setImgProgress(0);
          setImgStep(`Converting ${item.file.name} (${pendingIndices.indexOf(idx) + 1}/${pendingIndices.length})…`);

          const inputExt = mimeToExt(item.file.type);
          const inputName = `input.${inputExt}`;
          const fmt = IMAGE_FORMATS[imgOutputFormat];
          const outputName = `output.${fmt.ext}`;

          await ffmpeg.writeFile(inputName, await fetchFile(item.file));

          const args: string[] = ["-i", inputName];
          if (imgOutputFormat === "jpeg") {
            const qv = Math.round(2 + ((100 - imgQuality) / 100) * 29);
            args.push("-q:v", String(qv));
          } else if (imgOutputFormat === "webp") {
            args.push("-lossless", "0", "-q:v", String(imgQuality));
          }
          args.push("-y", outputName);

          await ffmpeg.exec(args);

          const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
          const outputURL = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: fmt.mime }));

          setImgBatchItems(prev => prev.map((it, i) =>
            i === idx ? { ...it, status: "done", outputURL, outputSize: data.length } : it
          ));

          await ffmpeg.deleteFile(inputName);
          await ffmpeg.deleteFile(outputName);
        } catch (err) {
          setImgBatchItems(prev => prev.map((it, i) =>
            i === idx ? { ...it, status: "error", error: err instanceof Error ? err.message : "Failed" } : it
          ));
        }
      }

      setImgStatus("done");
      setImgStep("");
      setImgProgress(0);
    } catch (err) {
      console.error("Batch image conversion failed:", err);
      setImgError(err instanceof Error ? err.message : "Conversion failed.");
      setImgStatus("error");
    }
  };

  const resetImgBatch = () => {
    imgBatchItems.forEach(item => {
      URL.revokeObjectURL(item.inputURL);
      if (item.outputURL) URL.revokeObjectURL(item.outputURL);
    });
    setImgBatchItems([]);
    setImgBatchMode(false);
    setImgStatus("idle");
    setImgProgress(0);
    setImgStep("");
    setImgError("");
  };

  const isLocked = status === "loading" || status === "converting";
  const isCompressLocked = compressStatus === "loading" || compressStatus === "compressing";
  const isImageLocked = imgStatus === "loading" || imgStatus === "converting";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="pt-12 pb-6 text-center">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-500 to-purple-700 bg-clip-text text-transparent">
          GifX
        </h1>
        <p className="mt-2 text-slate-500 text-lg">
          Convert videos, GIFs &amp; images — right in your browser
        </p>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
          {/* ── Tab Switcher ── */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setActiveTab("convert")}
              disabled={isLocked || isCompressLocked || isImageLocked}
              className={`flex-1 py-3.5 text-sm font-semibold transition-all duration-200 relative disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === "convert"
                  ? "text-violet-700"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Video to GIF
              </span>
              {activeTab === "convert" && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-violet-600 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("compress")}
              disabled={isLocked || isCompressLocked || isImageLocked}
              className={`flex-1 py-3.5 text-sm font-semibold transition-all duration-200 relative disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === "compress"
                  ? "text-violet-700"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                </svg>
                Compress GIF
              </span>
              {activeTab === "compress" && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-violet-600 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("image")}
              disabled={isLocked || isCompressLocked || isImageLocked}
              className={`flex-1 py-3.5 text-sm font-semibold transition-all duration-200 relative disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === "image"
                  ? "text-violet-700"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                Convert Image
              </span>
              {activeTab === "image" && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-violet-600 rounded-full" />
              )}
            </button>
          </div>

          {/* ═══════════════════════════════════════════════ */}
          {/* ── VIDEO TO GIF TAB ── */}
          {/* ═══════════════════════════════════════════════ */}
          {activeTab === "convert" && (
            <>
              {/* ── Upload Zone ── */}
              {status === "idle" && !videoBatchMode && (
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
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleVideoFiles(files);
                      e.target.value = "";
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
                    Drop your video(s) here
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    or click to browse &middot; MP4, WebM, MOV, AVI &middot; multiple files supported
                  </p>
                </div>
              )}

              {/* ── Video Preview + Controls ── */}
              {(status === "ready" || isLocked) && !videoBatchMode && (
                <div className="p-6">
                  <div className="relative rounded-xl overflow-hidden bg-black">
                    <video
                      ref={videoElRef}
                      src={videoURL}
                      controls
                      className="w-full max-h-80 object-contain"
                    />
                    {videoDuration > 0 && trimStart > 0 && (
                      <div
                        className="absolute top-0 left-0 bottom-0 bg-black/50 pointer-events-none border-r-2 border-violet-500"
                        style={{ width: `${timeToPercent(trimStart)}%` }}
                      />
                    )}
                    {videoDuration > 0 && trimEnd < videoDuration && (
                      <div
                        className="absolute top-0 right-0 bottom-0 bg-black/50 pointer-events-none border-l-2 border-violet-500"
                        style={{ width: `${timeToPercent(videoDuration - trimEnd)}%` }}
                      />
                    )}
                  </div>

                  {/* Filmstrip trim timeline */}
                  {videoDuration > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-slate-500">Trim</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-slate-500">{formatTimestamp(trimStart)}</span>
                          <span className="text-slate-300">—</span>
                          <span className="font-mono text-slate-500">{formatTimestamp(trimEnd)}</span>
                          <span className="font-mono text-violet-600 font-semibold bg-violet-50 px-1.5 py-0.5 rounded">
                            {formatDuration(trimEnd - trimStart)}
                          </span>
                          {(trimStart > 0 || trimEnd < videoDuration) && (
                            <button
                              onClick={() => { setTrimStart(0); setTrimEnd(videoDuration); }}
                              disabled={isLocked}
                              className="text-violet-500 hover:text-violet-700 transition-colors disabled:opacity-50"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        ref={timelineRef}
                        className="relative h-14 rounded-lg overflow-hidden select-none touch-none"
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                      >
                        <div className="absolute inset-0 flex">
                          {thumbnails.length > 0
                            ? thumbnails.map((src, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={i}
                                  src={src}
                                  alt=""
                                  className="h-full flex-1 object-cover"
                                  draggable={false}
                                />
                              ))
                            : <div className="w-full h-full bg-slate-200 animate-pulse" />
                          }
                        </div>

                        <div
                          className="absolute top-0 left-0 bottom-0 bg-black/60"
                          style={{ width: `${timeToPercent(trimStart)}%` }}
                        />
                        <div
                          className="absolute top-0 right-0 bottom-0 bg-black/60"
                          style={{ width: `${timeToPercent(videoDuration - trimEnd)}%` }}
                        />

                        <div
                          className="absolute top-0 bottom-0 border-y-2 border-violet-500 pointer-events-none"
                          style={{
                            left: `${timeToPercent(trimStart)}%`,
                            right: `${timeToPercent(videoDuration - trimEnd)}%`,
                          }}
                        />

                        <div
                          className="absolute top-0 bottom-0 w-5 -ml-2.5 cursor-col-resize z-10 flex items-center justify-center"
                          style={{ left: `${timeToPercent(trimStart)}%` }}
                          onPointerDown={onPointerDown("start")}
                        >
                          <div className="w-4 h-10 rounded-sm bg-violet-500 shadow-lg flex items-center justify-center">
                            <div className="flex gap-px">
                              <div className="w-0.5 h-4 bg-white/90 rounded-full" />
                              <div className="w-0.5 h-4 bg-white/90 rounded-full" />
                            </div>
                          </div>
                        </div>

                        <div
                          className="absolute top-0 bottom-0 w-5 -ml-2.5 cursor-col-resize z-10 flex items-center justify-center"
                          style={{ left: `${timeToPercent(trimEnd)}%` }}
                          onPointerDown={onPointerDown("end")}
                        >
                          <div className="w-4 h-10 rounded-sm bg-violet-500 shadow-lg flex items-center justify-center">
                            <div className="flex gap-px">
                              <div className="w-0.5 h-4 bg-white/90 rounded-full" />
                              <div className="w-0.5 h-4 bg-white/90 rounded-full" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between mt-1 text-[10px] font-mono text-slate-400">
                        <span>0:00</span>
                        <span>{formatTimestamp(videoDuration * 0.25)}</span>
                        <span>{formatTimestamp(videoDuration * 0.5)}</span>
                        <span>{formatTimestamp(videoDuration * 0.75)}</span>
                        <span>{formatTimestamp(videoDuration)}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                    <span className="truncate max-w-[60%]">{video?.name}</span>
                    <span>{video ? formatSize(video.size) : ""}</span>
                    {videoDuration > 0 && <span>{formatDuration(videoDuration)}</span>}
                    {videoWidth > 0 && (
                      <span>
                        {videoWidth}&times;{videoHeight}
                      </span>
                    )}
                  </div>

                  {/* Quality Presets */}
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

                  {/* Advanced Toggle */}
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

                  {/* Advanced Panel */}
                  {showAdvanced && (
                    <div className="mt-3 space-y-5 rounded-xl bg-slate-50 p-4 border border-slate-100">
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

                  {/* Convert Button */}
                  <button
                    onClick={convert}
                    disabled={isLocked}
                    className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-200"
                  >
                    {status === "ready"
                      ? "Convert to GIF & WebP"
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
              {status === "done" && gifURL && !videoBatchMode && (
                <div className="p-6">
                  <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={gifURL} alt="Converted GIF" className="w-full" />
                  </div>

                  <p className="mt-3 text-sm text-slate-500">
                    {fps}&nbsp;fps &middot; {scale}px wide
                    {maxColors < 256 && <> &middot; {maxColors} colors</>}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">GIF</span>
                        <span className="text-sm font-mono text-slate-500">{formatSize(gifSize)}</span>
                      </div>
                      <a
                        href={gifURL}
                        download={video?.name?.replace(/\.[^.]+$/, ".gif") || "output.gif"}
                        className="block w-full py-2 px-4 rounded-lg font-semibold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 shadow-md shadow-violet-200 text-center"
                      >
                        Download GIF
                      </a>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">WebP</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono text-slate-500">{formatSize(webpSize)}</span>
                          {webpSize > 0 && gifSize > 0 && webpSize < gifSize && (
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                              {Math.round((1 - webpSize / gifSize) * 100)}% smaller
                            </span>
                          )}
                        </div>
                      </div>
                      {webpURL ? (
                        <a
                          href={webpURL}
                          download={video?.name?.replace(/\.[^.]+$/, ".webp") || "output.webp"}
                          className="block w-full py-2 px-4 rounded-lg font-semibold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 shadow-md shadow-emerald-200 text-center"
                        >
                          Download WebP
                        </a>
                      ) : (
                        <div className="py-2 px-4 rounded-lg text-sm text-slate-400 bg-slate-50 text-center">
                          Not available
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={reset}
                    className="mt-4 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Convert Another
                  </button>
                </div>
              )}

              {/* ── Error ── */}
              {status === "error" && !videoBatchMode && (
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

              {/* ── Video Batch Mode ── */}
              {videoBatchMode && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-slate-700">
                      {videoBatchItems.length} video{videoBatchItems.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-3">
                      {!isLocked && (
                        <>
                          <input
                            ref={videoBatchFileInputRef}
                            type="file"
                            accept="video/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length > 0) addMoreVideoFiles(files);
                              e.target.value = "";
                            }}
                          />
                          <button
                            onClick={() => videoBatchFileInputRef.current?.click()}
                            className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
                          >
                            Add more
                          </button>
                        </>
                      )}
                      <button
                        onClick={resetVideoBatch}
                        disabled={isLocked}
                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {videoBatchItems.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                        <div className="h-9 w-9 flex-shrink-0 rounded bg-slate-200 flex items-center justify-center">
                          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{item.file.name}</p>
                          <p className="text-xs text-slate-400">{formatSize(item.file.size)}</p>
                        </div>
                        {item.status === "pending" && <span className="text-xs text-slate-400 flex-shrink-0">Pending</span>}
                        {item.status === "converting" && <span className="text-xs text-violet-600 flex-shrink-0 animate-pulse">Converting…</span>}
                        {item.status === "done" && item.gifURL && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <a
                              href={item.gifURL}
                              download={item.file.name.replace(/\.[^.]+$/, ".gif")}
                              className="rounded-lg bg-violet-600 text-white text-xs px-2 py-1 hover:bg-violet-700 transition-colors"
                            >
                              ↓ GIF
                            </a>
                            {item.webpURL && (
                              <a
                                href={item.webpURL}
                                download={item.file.name.replace(/\.[^.]+$/, ".webp")}
                                className="rounded-lg bg-indigo-600 text-white text-xs px-2 py-1 hover:bg-indigo-700 transition-colors"
                              >
                                ↓ WebP
                              </a>
                            )}
                          </div>
                        )}
                        {item.status === "error" && <span className="text-xs text-red-500 flex-shrink-0">Failed</span>}
                        {item.status === "pending" && !isLocked && (
                          <button
                            onClick={() => setVideoBatchItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0 ml-1"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <label className="text-sm font-medium text-slate-700">Quality</label>
                    <div className="mt-2 grid grid-cols-4 gap-3">
                      {(Object.entries(QUALITY_PRESETS) as [Exclude<Quality, "custom">, Preset][]).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => applyPreset(key)}
                          disabled={isLocked}
                          className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                            quality === key ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300 bg-white"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <span className={`block text-sm font-semibold ${quality === key ? "text-violet-700" : "text-slate-700"}`}>
                            {preset.label}
                          </span>
                          <span className="block text-xs text-slate-400 mt-0.5">{preset.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {status !== "done" && (
                    <button
                      onClick={convertBatchVideos}
                      disabled={isLocked || videoBatchItems.every(i => i.status === "done")}
                      className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-200"
                    >
                      {isLocked
                        ? `Converting… (${videoBatchItems.filter(i => i.status === "done").length}/${videoBatchItems.length})`
                        : `Convert All (${videoBatchItems.filter(i => i.status !== "done").length} remaining)`}
                    </button>
                  )}

                  {isLocked && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600">{step}</span>
                        {status === "converting" && <span className="text-violet-600 font-mono">{progress}%</span>}
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

                  {status === "done" && (
                    <button
                      onClick={resetVideoBatch}
                      className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                      Convert More Videos
                    </button>
                  )}

                  {error && (
                    <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-4">
                      <p className="text-red-600 text-sm">{error}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════ */}
          {/* ── COMPRESS GIF TAB ── */}
          {/* ═══════════════════════════════════════════════ */}
          {activeTab === "compress" && (
            <>
              {/* ── Upload Zone ── */}
              {compressStatus === "idle" && (
                <div
                  className={`m-6 border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    compressDragOver
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
                  }`}
                  onDrop={handleCompressDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setCompressDragOver(true);
                  }}
                  onDragLeave={() => setCompressDragOver(false)}
                  onClick={() => compressFileInputRef.current?.click()}
                >
                  <input
                    ref={compressFileInputRef}
                    type="file"
                    accept="image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCompressFile(file);
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
                      d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                    />
                  </svg>
                  <p className="mt-4 text-lg font-medium text-slate-700">
                    Drop your GIF here
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    or click to browse &middot; GIF files only
                  </p>
                </div>
              )}

              {/* ── GIF Preview + Compression Controls ── */}
              {(compressStatus === "ready" || isCompressLocked) && (
                <div className="p-6">
                  {/* GIF preview */}
                  <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={compressGifURL} alt="Original GIF" className="w-full max-h-80 object-contain" />
                  </div>

                  {/* File info */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                    <span className="truncate max-w-[60%]">{compressGif?.name}</span>
                    <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {formatSize(compressGifSize)}
                    </span>
                  </div>

                  {/* ── Compression Presets ── */}
                  <div className="mt-6">
                    <label className="text-sm font-medium text-slate-700">Compression Level</label>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      {(
                        Object.entries(COMPRESS_PRESETS) as [
                          Exclude<CompressLevel, "custom">,
                          CompressPreset,
                        ][]
                      ).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => applyCompressPreset(key)}
                          disabled={isCompressLocked}
                          className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                            compressLevel === key
                              ? "border-violet-500 bg-violet-50"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <span
                            className={`block text-sm font-semibold ${
                              compressLevel === key ? "text-violet-700" : "text-slate-700"
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
                    onClick={() => setCompressShowAdvanced((v) => !v)}
                    disabled={isCompressLocked}
                    className="mt-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                  >
                    <svg
                      className={`h-4 w-4 transition-transform duration-200 ${compressShowAdvanced ? "rotate-90" : ""}`}
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
                    Advanced{compressLevel === "custom" ? " (Custom)" : ""}
                  </button>

                  {/* ── Advanced Panel ── */}
                  {compressShowAdvanced && (
                    <div className="mt-3 space-y-5 rounded-xl bg-slate-50 p-4 border border-slate-100">
                      {/* Max Colors */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-slate-700">Max Colors</label>
                          <span className="text-sm font-mono text-violet-600 font-semibold">
                            {compressColors}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={8}
                          max={256}
                          step={8}
                          value={compressColors}
                          onChange={(e) =>
                            handleCompressAdvancedChange(Number(e.target.value), compressScalePct, compressFpsReduce)
                          }
                          disabled={isCompressLocked}
                          className="w-full accent-violet-600"
                        />
                        <div className="flex justify-between mt-1">
                          {[32, 64, 128, 200, 256].map((v) => (
                            <button
                              key={v}
                              onClick={() => handleCompressAdvancedChange(v, compressScalePct, compressFpsReduce)}
                              disabled={isCompressLocked}
                              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                                compressColors === v
                                  ? "bg-violet-100 text-violet-700 font-medium"
                                  : "text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Scale */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-slate-700">Scale</label>
                          <span className="text-sm font-mono text-violet-600 font-semibold">
                            {compressScalePct}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={25}
                          max={100}
                          step={5}
                          value={compressScalePct}
                          onChange={(e) =>
                            handleCompressAdvancedChange(compressColors, Number(e.target.value), compressFpsReduce)
                          }
                          disabled={isCompressLocked}
                          className="w-full accent-violet-600"
                        />
                        <div className="flex justify-between mt-1">
                          {[25, 50, 75, 100].map((v) => (
                            <button
                              key={v}
                              onClick={() => handleCompressAdvancedChange(compressColors, v, compressFpsReduce)}
                              disabled={isCompressLocked}
                              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                                compressScalePct === v
                                  ? "bg-violet-100 text-violet-700 font-medium"
                                  : "text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              {v}%
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Reduce FPS */}
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700">Reduce frame rate</label>
                        <button
                          onClick={() => handleCompressAdvancedChange(compressColors, compressScalePct, !compressFpsReduce)}
                          disabled={isCompressLocked}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                            compressFpsReduce ? "bg-violet-600" : "bg-slate-200"
                          } disabled:opacity-50`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              compressFpsReduce ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Compress Button ── */}
                  <button
                    onClick={compressGifFile}
                    disabled={isCompressLocked}
                    className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-200"
                  >
                    {compressStatus === "ready"
                      ? "Compress GIF"
                      : compressStatus === "loading"
                        ? "Loading Engine…"
                        : "Compressing…"}
                  </button>

                  {/* Progress bar */}
                  {isCompressLocked && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600">{compressStep}</span>
                        {compressStatus === "compressing" && (
                          <span className="text-violet-600 font-mono">{compressProgress}%</span>
                        )}
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        {compressStatus === "loading" ? (
                          <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-pulse w-full" />
                        ) : (
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${compressProgress}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Compress Result ── */}
              {compressStatus === "done" && compressedURL && (
                <div className="p-6">
                  {/* Compressed GIF preview */}
                  <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={compressedURL} alt="Compressed GIF" className="w-full" />
                  </div>

                  {/* Size comparison */}
                  <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-center flex-1">
                        <span className="block text-xs text-slate-400 mb-1">Original</span>
                        <span className="block text-lg font-mono font-semibold text-slate-700">
                          {formatSize(compressGifSize)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center px-4">
                        <svg className="h-5 w-5 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                        {compressedSize < compressGifSize && (
                          <span className="mt-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {Math.round((1 - compressedSize / compressGifSize) * 100)}% smaller
                          </span>
                        )}
                        {compressedSize >= compressGifSize && (
                          <span className="mt-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            No reduction
                          </span>
                        )}
                      </div>
                      <div className="text-center flex-1">
                        <span className="block text-xs text-slate-400 mb-1">Compressed</span>
                        <span className="block text-lg font-mono font-semibold text-violet-700">
                          {formatSize(compressedSize)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Download button */}
                  <a
                    href={compressedURL}
                    download={compressGif?.name?.replace(/\.gif$/i, "-compressed.gif") || "compressed.gif"}
                    className="mt-4 block w-full py-3 px-6 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 shadow-lg shadow-violet-200 text-center"
                  >
                    Download Compressed GIF ({formatSize(compressedSize)})
                  </a>

                  <button
                    onClick={resetCompress}
                    className="mt-3 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Compress Another
                  </button>
                </div>
              )}

              {/* ── Error ── */}
              {compressStatus === "error" && (
                <div className="p-6">
                  <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                    <p className="text-red-600 text-sm">{compressError}</p>
                  </div>
                  <button
                    onClick={resetCompress}
                    className="mt-4 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════ */}
          {/* ── IMAGE CONVERT TAB ── */}
          {/* ═══════════════════════════════════════════════ */}
          {activeTab === "image" && (
            <>
              {/* ── Upload Zone ── */}
              {imgStatus === "idle" && !imgBatchMode && (
                <div
                  className={`m-6 border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    imgDragOver
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
                  }`}
                  onDrop={handleImageDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setImgDragOver(true);
                  }}
                  onDragLeave={() => setImgDragOver(false)}
                  onClick={() => imgFileInputRef.current?.click()}
                >
                  <input
                    ref={imgFileInputRef}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleImageFiles(files);
                      e.target.value = "";
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
                      d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25a2.25 2.25 0 0 0-2.25-2.25H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
                    />
                  </svg>
                  <p className="mt-4 text-lg font-medium text-slate-700">
                    Drop your image(s) here
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    or click to browse &middot; PNG, JPEG, WebP, BMP, TIFF, GIF &middot; multiple files supported
                  </p>
                </div>
              )}

              {/* ── Image Preview + Format Picker ── */}
              {(imgStatus === "ready" || isImageLocked) && !imgBatchMode && (
                <div className="p-6">
                  <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgFileURL} alt="Original" className="w-full max-h-80 object-contain" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                    <span className="truncate max-w-[60%]">{imgFile?.name}</span>
                    <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {formatSize(imgFileSize)}
                    </span>
                  </div>

                  {/* Output Format */}
                  <div className="mt-6">
                    <label className="text-sm font-medium text-slate-700">Output Format</label>
                    <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {(Object.entries(IMAGE_FORMATS) as [ImageFormat, ImageFormatOption][]).map(
                        ([key, fmt]) => (
                          <button
                            key={key}
                            onClick={() => setImgOutputFormat(key)}
                            disabled={isImageLocked}
                            className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                              imgOutputFormat === key
                                ? "border-violet-500 bg-violet-50"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            <span
                              className={`block text-sm font-semibold ${
                                imgOutputFormat === key ? "text-violet-700" : "text-slate-700"
                              }`}
                            >
                              {fmt.label}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Quality Presets (JPEG/WebP only) */}
                  {IMAGE_FORMATS[imgOutputFormat].hasQuality && (
                    <div className="mt-6">
                      <label className="text-sm font-medium text-slate-700">Quality</label>
                      <div className="mt-2 grid grid-cols-3 gap-3">
                        {(Object.entries(IMG_QUALITY_PRESETS) as [ImgQualityLevel, ImgQualityPreset][]).map(
                          ([key, preset]) => (
                            <button
                              key={key}
                              onClick={() => {
                                setImgQualityLevel(key);
                                setImgQuality(preset.value);
                              }}
                              disabled={isImageLocked}
                              className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                                imgQualityLevel === key
                                  ? "border-violet-500 bg-violet-50"
                                  : "border-slate-200 hover:border-slate-300 bg-white"
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <span
                                className={`block text-sm font-semibold ${
                                  imgQualityLevel === key ? "text-violet-700" : "text-slate-700"
                                }`}
                              >
                                {preset.label}
                              </span>
                              <span className="block text-xs text-slate-400 mt-0.5">
                                {preset.desc}
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Convert Button */}
                  <button
                    onClick={convertImage}
                    disabled={isImageLocked}
                    className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-200"
                  >
                    {imgStatus === "ready"
                      ? `Convert to ${IMAGE_FORMATS[imgOutputFormat].label}`
                      : imgStatus === "loading"
                        ? "Loading Engine…"
                        : "Converting…"}
                  </button>

                  {/* Progress bar */}
                  {isImageLocked && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600">{imgStep}</span>
                        {imgStatus === "converting" && (
                          <span className="text-violet-600 font-mono">{imgProgress}%</span>
                        )}
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        {imgStatus === "loading" ? (
                          <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-pulse w-full" />
                        ) : (
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${imgProgress}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Result ── */}
              {imgStatus === "done" && imgOutputURL && !imgBatchMode && (
                <div className="p-6">
                  <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgOutputURL} alt="Converted" className="w-full max-h-80 object-contain" />
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-center flex-1">
                        <span className="block text-xs text-slate-400 mb-1">Original</span>
                        <span className="block text-lg font-mono font-semibold text-slate-700">
                          {formatSize(imgFileSize)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center px-4">
                        <svg className="h-5 w-5 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                        <span className="mt-1 text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                          {IMAGE_FORMATS[imgOutputFormat].label}
                        </span>
                      </div>
                      <div className="text-center flex-1">
                        <span className="block text-xs text-slate-400 mb-1">Converted</span>
                        <span className="block text-lg font-mono font-semibold text-violet-700">
                          {formatSize(imgOutputSize)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={imgOutputURL}
                    download={
                      imgFile?.name?.replace(/\.[^.]+$/, `.${IMAGE_FORMATS[imgOutputFormat].ext}`) ||
                      `output.${IMAGE_FORMATS[imgOutputFormat].ext}`
                    }
                    className="mt-4 block w-full py-3 px-6 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 shadow-lg shadow-violet-200 text-center"
                  >
                    Download {IMAGE_FORMATS[imgOutputFormat].label} ({formatSize(imgOutputSize)})
                  </a>

                  <button
                    onClick={resetImage}
                    className="mt-3 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Convert Another
                  </button>
                </div>
              )}

              {/* ── Error ── */}
              {imgStatus === "error" && !imgBatchMode && (
                <div className="p-6">
                  <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                    <p className="text-red-600 text-sm">{imgError}</p>
                  </div>
                  <button
                    onClick={resetImage}
                    className="mt-4 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* ── Image Batch Mode ── */}
              {imgBatchMode && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-slate-700">
                      {imgBatchItems.length} image{imgBatchItems.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-3">
                      {!isImageLocked && (
                        <>
                          <input
                            ref={imgBatchFileInputRef}
                            type="file"
                            accept={ACCEPTED_IMAGE_TYPES}
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length > 0) addMoreImgFiles(files);
                              e.target.value = "";
                            }}
                          />
                          <button
                            onClick={() => imgBatchFileInputRef.current?.click()}
                            className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
                          >
                            Add more
                          </button>
                        </>
                      )}
                      <button
                        onClick={resetImgBatch}
                        disabled={isImageLocked}
                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {imgBatchItems.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.inputURL} alt="" className="h-9 w-9 object-cover rounded flex-shrink-0 bg-slate-200" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{item.file.name}</p>
                          <p className="text-xs text-slate-400">{formatSize(item.inputSize)}</p>
                        </div>
                        {item.status === "pending" && <span className="text-xs text-slate-400 flex-shrink-0">Pending</span>}
                        {item.status === "converting" && <span className="text-xs text-violet-600 flex-shrink-0 animate-pulse">Converting…</span>}
                        {item.status === "done" && item.outputURL && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-emerald-600 font-mono">{formatSize(item.outputSize!)}</span>
                            <a
                              href={item.outputURL}
                              download={item.file.name.replace(/\.[^.]+$/, `.${IMAGE_FORMATS[imgOutputFormat].ext}`)}
                              className="rounded-lg bg-violet-600 text-white text-xs px-2 py-1 hover:bg-violet-700 transition-colors"
                            >
                              ↓ {IMAGE_FORMATS[imgOutputFormat].label}
                            </a>
                          </div>
                        )}
                        {item.status === "error" && <span className="text-xs text-red-500 flex-shrink-0">Failed</span>}
                        {item.status === "pending" && !isImageLocked && (
                          <button
                            onClick={() => {
                              URL.revokeObjectURL(item.inputURL);
                              setImgBatchItems(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0 ml-1"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <label className="text-sm font-medium text-slate-700">Output Format</label>
                    <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {(Object.entries(IMAGE_FORMATS) as [ImageFormat, ImageFormatOption][]).map(([key, fmt]) => (
                        <button
                          key={key}
                          onClick={() => setImgOutputFormat(key)}
                          disabled={isImageLocked}
                          className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                            imgOutputFormat === key ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300 bg-white"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <span className={`block text-sm font-semibold ${imgOutputFormat === key ? "text-violet-700" : "text-slate-700"}`}>
                            {fmt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {IMAGE_FORMATS[imgOutputFormat].hasQuality && (
                    <div className="mt-5">
                      <label className="text-sm font-medium text-slate-700">Quality</label>
                      <div className="mt-2 grid grid-cols-3 gap-3">
                        {(Object.entries(IMG_QUALITY_PRESETS) as [ImgQualityLevel, ImgQualityPreset][]).map(([key, preset]) => (
                          <button
                            key={key}
                            onClick={() => { setImgQualityLevel(key); setImgQuality(preset.value); }}
                            disabled={isImageLocked}
                            className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                              imgQualityLevel === key ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300 bg-white"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            <span className={`block text-sm font-semibold ${imgQualityLevel === key ? "text-violet-700" : "text-slate-700"}`}>
                              {preset.label}
                            </span>
                            <span className="block text-xs text-slate-400 mt-0.5">{preset.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {imgStatus !== "done" && (
                    <button
                      onClick={convertBatchImages}
                      disabled={isImageLocked || imgBatchItems.every(i => i.status === "done")}
                      className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-200"
                    >
                      {isImageLocked
                        ? `Converting… (${imgBatchItems.filter(i => i.status === "done").length}/${imgBatchItems.length})`
                        : `Convert All (${imgBatchItems.filter(i => i.status !== "done").length} remaining)`}
                    </button>
                  )}

                  {isImageLocked && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600">{imgStep}</span>
                        {imgStatus === "converting" && <span className="text-violet-600 font-mono">{imgProgress}%</span>}
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        {imgStatus === "loading" ? (
                          <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-pulse w-full" />
                        ) : (
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${imgProgress}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {imgStatus === "done" && (
                    <button
                      onClick={resetImgBatch}
                      className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                      Convert More Files
                    </button>
                  )}

                  {imgError && (
                    <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-4">
                      <p className="text-red-600 text-sm">{imgError}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Visitor Stats ── */}
        {visitorStats && (
          <div className="mt-8 flex justify-center gap-6">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm border border-slate-100">
              <svg className="h-4 w-4 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-semibold text-slate-700">{formatCount(visitorStats.total)}</span>
              <span className="text-xs text-slate-400">visits</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm border border-slate-100">
              <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span className="text-sm font-semibold text-slate-700">{formatCount(visitorStats.unique)}</span>
              <span className="text-xs text-slate-400">unique visitors</span>
            </div>
          </div>
        )}

        <div className="mt-6 text-center space-y-4">
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
