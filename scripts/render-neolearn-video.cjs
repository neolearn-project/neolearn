const path = require("path");
const fs = require("fs");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toSafeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    throw new Error("Missing render payload.");
  }

  const input = JSON.parse(raw);

  const { bundle } = require("@remotion/bundler");
  const { renderMedia, selectComposition } = require("@remotion/renderer");

  const remotionRoot = path.join(process.cwd(), "remotion");
  const outDir = path.join(process.cwd(), "public", "generated", "video");
  ensureDir(outDir);

  const bundled = await bundle({
    entryPoint: path.join(remotionRoot, "index.ts"),
    webpackOverride: (config) => config,
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

  process.stdout.write(
    JSON.stringify({
      outputLocation,
      publicUrl: `/generated/video/${fileName}`,
    })
  );
}

main().catch((err) => {
  process.stderr.write(err?.stack || err?.message || "Render failed.");
  process.exit(1);
});