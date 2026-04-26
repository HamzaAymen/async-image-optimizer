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

export async function runPipeline(
  input: Buffer,
  ops: Operations,
  sourceType: string,
): Promise<PipelineResult> {
  let img = sharp(input, { failOn: "error" }).rotate();

  const wantsResize = ops.width != null || ops.height != null;
  const wantsWebp = ops.webp === true;

  if (wantsResize) {
    img = img.resize({
      width: ops.width ?? undefined,
      height: ops.height ?? undefined,
      fit: "inside",
    });
  } else if (!wantsWebp) {
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
