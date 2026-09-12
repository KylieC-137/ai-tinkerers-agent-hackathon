import { NextResponse } from "next/server";
import { callModel } from "@/lib/openrouter";
import { getPlaybook } from "@/lib/playbooks";
import { buildSystemPrompt, buildUserText } from "@/lib/prompts";
import {
  createInitialProjectState,
  fallbackStep,
  validateProjectState,
  validateStepResult,
  type ProjectState,
} from "@/lib/state";

export const runtime = "nodejs";
export const maxDuration = 60;

type RequestBody = {
  goal?: unknown;
  activityId?: unknown;
  state?: unknown;
  utterance?: unknown;
  imageDataUrl?: unknown;
};

export async function POST(request: Request) {
  const started = Date.now();
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const activityId = typeof body.activityId === "string" ? body.activityId : "";
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const utterance = typeof body.utterance === "string" ? body.utterance.trim() : "next";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const playbook = getPlaybook(activityId);

  if (!playbook) return NextResponse.json({ error: "Unknown activity." }, { status: 400 });
  if (!goal) return NextResponse.json({ error: "A goal is required." }, { status: 400 });
  if (!/^data:image\/jpeg;base64,/i.test(imageDataUrl)) {
    return NextResponse.json({ error: "A JPEG camera frame is required." }, { status: 400 });
  }

  const initial = createInitialProjectState(activityId, goal, [...playbook.steps]);
  const isSessionStart = body.state == null;
  const currentState: ProjectState = isSessionStart
    ? initial
    : validateProjectState(body.state, initial);

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
  }

  try {
    const modelResult = await callModel({
      system: buildSystemPrompt(playbook),
      userText: buildUserText({
        goal,
        utterance,
        state: currentState,
        isSessionStart,
        now: Date.now(),
      }),
      imageDataUrl,
    });
    const result = validateStepResult(modelResult.value, currentState);
    return NextResponse.json({
      ...result,
      model: modelResult.model,
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    console.error("Build Coach model turn failed", error);
    return NextResponse.json({
      ...fallbackStep(currentState),
      model: "fallback",
      latencyMs: Date.now() - started,
    });
  }
}
