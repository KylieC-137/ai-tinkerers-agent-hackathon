import { callSpeech, SpeechError } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_REQUEST_BYTES = 8 * 1024;

async function readSpeechText(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new SpeechError("Request body must be JSON.", 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    throw new SpeechError("Speech request is too large.", 413);
  }
  if (!request.body) throw new SpeechError("Speech text is required.", 400);

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    for (;;) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        throw new SpeechError("Speech request is too large.", 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new SpeechError("Request body must be valid JSON.", 400);
  }
  const text = body && typeof body === "object" && "text" in body ? body.text : undefined;
  if (typeof text !== "string" || !text.trim() || text.length > 1200) {
    throw new SpeechError("Speech text must contain 1 to 1200 characters.", 400);
  }
  return text.trim();
}

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const text = await readSpeechText(request);
    const result = await callSpeech(text, request.signal);
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Length": String(result.audio.byteLength),
      "Cache-Control": "no-store",
      "X-Speech-Model": result.model,
      "X-Speech-Voice": result.voice,
      "X-Speech-Latency-Ms": String(Date.now() - started),
    });
    if (result.generationId) headers.set("X-Generation-Id", result.generationId);
    return new Response(result.audio, { headers });
  } catch (error) {
    const status = error instanceof SpeechError ? error.status : request.signal.aborted ? 499 : 502;
    const message = error instanceof SpeechError ? error.message : "Natural voice is unavailable. Using the device voice.";
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
