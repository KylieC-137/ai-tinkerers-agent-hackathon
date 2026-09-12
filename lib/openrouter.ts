const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 25_000;

type CallModelArgs = {
  system: string;
  userText: string;
  imageDataUrl: string;
};

type ModelResponse = {
  value: unknown;
  model: string;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

function modelList(): { primary: string; fallbacks: string[] } {
  const primary = process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
  const fallbacks = (
    process.env.OPENROUTER_FALLBACK_MODELS ||
    "openai/gpt-5.6-luna,anthropic/claude-sonnet-5"
  )
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return { primary, fallbacks: fallbacks.filter((model) => model !== primary) };
}

function extractJson(content: unknown): unknown {
  const raw =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) =>
              part && typeof part === "object" && "text" in part
                ? String((part as { text: unknown }).text)
                : "",
            )
            .join("")
        : "";
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Model response did not contain JSON");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function rejectsResponseFormat(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status < 400 || error.status >= 500) return false;
  const details = `${error.message} ${error.body}`.toLowerCase();
  return details.includes("response_format") || details.includes("json_object");
}

async function request(
  args: CallModelArgs,
  includeResponseFormat: boolean,
): Promise<ModelResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const { primary, fallbacks } = modelList();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model: primary,
      models: [primary, ...fallbacks],
      messages: [
        { role: "system", content: args.system },
        {
          role: "user",
          content: [
            { type: "text", text: args.userText },
            { type: "image_url", image_url: { url: args.imageDataUrl } },
          ],
        },
      ],
      max_tokens: 600,
      temperature: 0.2,
    };
    if (includeResponseFormat) body.response_format = { type: "json_object" };

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-OpenRouter-Title": "Build Coach",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new HttpError(`OpenRouter returned HTTP ${response.status}`, response.status, responseText);
    }

    const payload = JSON.parse(responseText) as {
      model?: string;
      choices?: { message?: { content?: unknown } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    return {
      value: extractJson(content),
      model: payload.model || primary,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function callModel(args: CallModelArgs): Promise<ModelResponse> {
  let timeoutRetries = 0;
  let includeResponseFormat = true;
  let formatRetried = false;

  for (;;) {
    try {
      return await request(args, includeResponseFormat);
    } catch (error) {
      if (rejectsResponseFormat(error) && includeResponseFormat && !formatRetried) {
        includeResponseFormat = false;
        formatRetried = true;
        continue;
      }
      if (error instanceof Error && error.name === "AbortError" && timeoutRetries < 1) {
        timeoutRetries += 1;
        continue;
      }
      throw error;
    }
  }
}

const OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech";
const SPEECH_TIMEOUT_MS = 12_000;
const MAX_SPEECH_AUDIO_BYTES = 2 * 1024 * 1024;

export class SpeechError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SpeechError";
  }
}

type SpeechResponse = {
  audio: ArrayBuffer;
  model: string;
  voice: string;
  generationId: string | null;
};

// Speech has its own endpoint and returns MP3 bytes, not chat-completion JSON.
export async function callSpeech(input: string, signal?: AbortSignal): Promise<SpeechResponse> {
  const text = input.trim();
  if (!text || text.length > 1200) {
    throw new SpeechError("Speech text must contain 1 to 1200 characters.", 400);
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new SpeechError("Speech is not configured. Using the device voice.", 503);

  const model = process.env.OPENROUTER_TTS_MODEL?.trim() || "x-ai/grok-voice-tts-1.0";
  const voice = process.env.OPENROUTER_TTS_VOICE?.trim() || "eve";
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SPEECH_TIMEOUT_MS);
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    if (signal?.aborted) controller.abort();
    controller.signal.throwIfAborted();
    const response = await fetch(OPENROUTER_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-OpenRouter-Title": "Build Coach",
      },
      body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }),
      signal: controller.signal,
      cache: "no-store",
    });

    // Never read or forward provider error bodies: they may contain private details.
    if (!response.ok) {
      controller.abort();
      throw new SpeechError("Natural voice is unavailable. Using the device voice.", 502);
    }
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "audio/mpeg" || !response.body) {
      controller.abort();
      throw new SpeechError("Natural voice returned invalid audio. Using the device voice.", 502);
    }
    if (Number(response.headers.get("content-length")) > MAX_SPEECH_AUDIO_BYTES) {
      controller.abort();
      throw new SpeechError("Natural voice returned too much audio. Using the device voice.", 502);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        controller.signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_SPEECH_AUDIO_BYTES) {
          controller.abort();
          throw new SpeechError("Natural voice returned too much audio. Using the device voice.", 502);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    controller.signal.throwIfAborted();
    if (!totalBytes) throw new SpeechError("Natural voice returned empty audio. Using the device voice.", 502);

    const audio = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      audio: audio.buffer,
      model,
      voice,
      generationId: response.headers.get("x-generation-id"),
    };
  } catch (error) {
    if (error instanceof SpeechError) throw error;
    if (timedOut) throw new SpeechError("Natural voice timed out. Using the device voice.", 504);
    if (signal?.aborted) throw new SpeechError("Speech request was canceled.", 499);
    throw new SpeechError("Natural voice is unavailable. Using the device voice.", 502);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
