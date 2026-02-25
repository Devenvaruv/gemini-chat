import { NextResponse } from "next/server";
import { addon as ov } from "openvino-node";
import { VLMPipeline } from "openvino-genai-node";
import sharp from "sharp";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_PATH = path.resolve(
  process.cwd(),
  "models",
  "Phi-3.5-vision-instruct-int4-ov",
);
const SYSTEM_PROMPT = [
  "You are a helpful AI assistant.",
  "Answer clearly and directly.",
  "If the user asks about an image, focus on what is visible in the image.",
].join(" ");

type Tensor = InstanceType<typeof ov.Tensor>;
type Pipeline = Awaited<ReturnType<typeof VLMPipeline>>;

let cachedPipeline: Pipeline | null = null;

// Keep one queue so only one generation runs at a time on the shared pipeline.
let previousJob: Promise<void> = Promise.resolve();

async function readImage(file: File): Promise<Tensor> {
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const { data, info } = await sharp(fileBytes)
    .resize({
      width: 512,
      height: 512,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (!width || !height || !channels) {
    throw new Error("Could not decode the uploaded image.");
  }

  return new ov.Tensor(ov.element.u8, [height, width, channels], data);
}

async function getPipeline(): Promise<Pipeline> {
  if (!cachedPipeline) {
    cachedPipeline = await VLMPipeline(MODEL_PATH, "CPU");
  }
  return cachedPipeline;
}

function runOneByOne<T>(job: () => Promise<T>): Promise<T> {
  const next = previousJob.then(job, job);
  previousJob = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function buildPrompt(userPrompt: string): string {
  return `Instructions:\n${SYSTEM_PROMPT}\n\nUser Prompt:\n${userPrompt}`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    // 1) Read form values from the frontend.
    const form = await request.formData();

    // 2) Validate prompt.
    const promptValue = form.get("prompt");
    const prompt = typeof promptValue === "string" ? promptValue.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }
    const finalPrompt = buildPrompt(prompt);

    // 3) Read optional image and convert to OpenVINO tensor.
    const imageValue = form.get("image");
    const imageFile = imageValue instanceof File ? imageValue : null;
    const images =
      imageFile && imageFile.size > 0
        ? [await readImage(imageFile)]
        : [];

    // 4) Get shared pipeline and run one generation.
    const pipeline = await getPipeline();
    const result = await runOneByOne(() =>
      pipeline.generate(finalPrompt, {
        images,
        generationConfig: { max_new_tokens: 150 },
      }),
    );
    const answer = result?.texts?.[0] ? String(result.texts[0]) : "";

    // 5) Return response to frontend.
    return NextResponse.json({ answer });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown inference error.";
    const status =
      message === "Prompt is required." ||
      message === "Could not decode the uploaded image."
        ? 400
        : 500;
    return NextResponse.json(
      { error: status === 400 ? message : `Inference failed: ${message}` },
      { status },
    );
  }
}
