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
