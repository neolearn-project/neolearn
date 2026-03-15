// @ts-nocheck
import path from "path";
import fs from "fs";

type RenderInput = {
  topic: string;
  ctaText: string;
  audioUrl?: string | null;
  bgMusicUrl?: string | null;
  scenes: any[];
};

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toSafeSlug(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function renderNeoLearnVideo(input: RenderInput) {
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  const projectRoot = process.cwd();
  const entryPoint = path.join(projectRoot, "remotion", "index.ts");
  const outDir = path.join(projectRoot, "public", "generated", "video");
  ensureDir(outDir);

  const bundled = await bundle({
    entryPoint,
    rootDir: projectRoot,
    webpackOverride: (config: any) => config,
  });

  const composition = await selectComposition({
    serveUrl: bundled,
    id: "NeoLearnTrialVideo",
    inputProps: {
      data: input,
    },
  });

  const safeTopic = toSafeSlug(input.topic || "video");
  const fileName = `neolearn-${Date.now()}-${safeTopic}.mp4`;
  const outputLocation = path.join(outDir, fileName);

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation,
    inputProps: {
      data: input,
    },
  });

  return {
    outputLocation,
    publicUrl: `/generated/video/${fileName}`,
  };
}