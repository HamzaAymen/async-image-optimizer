import sharp from "sharp";

export type Operations = {
  width?: number | null;
  height?: number | null;
  webp?: boolean;
};

export type PipelineResult = {
  buffer: Buffer;
  format: string;
  contentType: string;
  size: number;
};

const DEFAULT_MAX_DIM = 1920;
const DEFAULT_QUALITY = 80;
// PNG/WebP must be fully decoded — ~24MP RGB ≈ 72MB, fits the 512MB worker.
const MAX_INPUT_PIXELS_DECODED = 24_000_000;
// JPEG benefits from libvips shrink-on-load (1/2, 1/4, 1/8), so the resize
// target bounds actual memory rather than the raw dimensions. Allow up to a
// full-frame DSLR / large phone HDR shot — the 10MB upload cap is the real guard.
const MAX_INPUT_PIXELS_JPEG = 80_000_000;

// Keep libvips' working set small enough to fit the 512MB Fly machine.
sharp.concurrency(1);
sharp.cache(false);

export async function runPipeline(
  input: Buffer,
  ops: Operations,
  sourceType: string,
): Promise<PipelineResult> {
  const isJpeg = sourceType === "image/jpeg" || sourceType === "image/jpg";
  let img = sharp(input, {
    failOn: "error",
    limitInputPixels: isJpeg ? MAX_INPUT_PIXELS_JPEG : MAX_INPUT_PIXELS_DECODED,
  }).rotate();

  const wantsResize = ops.width != null || ops.height != null;
  const wantsWebp = ops.webp === true;

  if (wantsResize) {
    img = img.resize({
      width: ops.width ?? undefined,
      height: ops.height ?? undefined,
      fit: "inside",
    });
  } else {
    // Always cap dimensions when the user didn't ask for an explicit resize —
    // protects the worker from full-resolution decode/encode of big inputs
    // (especially for the webp path, which would otherwise skip the cap).
    img = img.resize({
      width: DEFAULT_MAX_DIM,
      height: DEFAULT_MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (wantsWebp) {
    const out = await img
      .webp({ quality: DEFAULT_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: out.data,
      format: "webp",
      contentType: "image/webp",
      size: out.info.size,
    };
  }

  const out = await encodeForSourceType(img, sourceType).toBuffer({
    resolveWithObject: true,
  });
  return {
    buffer: out.data,
    format: out.info.format,
    contentType: `image/${out.info.format}`,
    size: out.info.size,
  };
}

function encodeForSourceType(img: sharp.Sharp, sourceType: string): sharp.Sharp {
  switch (sourceType) {
    case "image/jpeg":
    case "image/jpg":
      return img.jpeg({ quality: DEFAULT_QUALITY, mozjpeg: true });
    case "image/png":
      return img.png({ quality: DEFAULT_QUALITY, compressionLevel: 9 });
    case "image/webp":
      return img.webp({ quality: DEFAULT_QUALITY });
    default:
      return img;
  }
}
