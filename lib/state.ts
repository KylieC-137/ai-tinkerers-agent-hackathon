export type StepStatus = "pending" | "active" | "done" | "skipped";

export type ProjectStep = {
  id: string;
  title: string;
  status: StepStatus;
};

export type ProjectState = {
  activityId: string;
  goal: string;
  steps: ProjectStep[];
  currentStepId: string | null;
  facts: Record<string, string>;
  observations: { t: number; note: string }[];
  warnings: string[];
  done: boolean;
};

export type StepResult = {
  observation: string;
  state: ProjectState;
  mistake: null | { what: string; fix: string };
  speak: string;
  needsBetterView: boolean;
  done: boolean;
};

export type StepApiResult = StepResult & {
  model: string;
  latencyMs: number;
};

const statuses = new Set<StepStatus>(["pending", "active", "done", "skipped"]);

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createInitialProjectState(
  activityId: string,
  goal: string,
  steps: { id: string; title: string }[],
): ProjectState {
  return {
    activityId,
    goal,
    steps: steps.map((step, index) => ({
      ...step,
      status: index === 0 ? "active" : "pending",
    })),
    currentStepId: steps[0]?.id ?? null,
    facts: {},
    observations: [],
    warnings: [],
    done: false,
  };
}

export function validateProjectState(
  value: unknown,
  fallback: ProjectState,
): ProjectState {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;

  const steps = Array.isArray(candidate.steps)
    ? candidate.steps
        .filter((step): step is Record<string, unknown> => !!step && typeof step === "object")
        .map((step) => ({
          id: text(step.id),
          title: text(step.title),
          status: statuses.has(step.status as StepStatus)
            ? (step.status as StepStatus)
            : "pending",
        }))
        .filter((step) => step.id && step.title)
    : fallback.steps;

  const facts =
    candidate.facts && typeof candidate.facts === "object" && !Array.isArray(candidate.facts)
      ? Object.fromEntries(
          Object.entries(candidate.facts as Record<string, unknown>)
            .filter(([, item]) => typeof item === "string")
            .map(([key, item]) => [key, item as string]),
        )
      : fallback.facts;

  const observations = Array.isArray(candidate.observations)
    ? candidate.observations
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => ({
          t: typeof item.t === "number" ? item.t : Date.now(),
          note: text(item.note),
        }))
        .filter((item) => item.note)
        .slice(-12)
    : fallback.observations;

  return {
    activityId: text(candidate.activityId, fallback.activityId),
    goal: text(candidate.goal, fallback.goal),
    steps: steps.length ? steps : fallback.steps,
    currentStepId:
      typeof candidate.currentStepId === "string" || candidate.currentStepId === null
        ? candidate.currentStepId
        : fallback.currentStepId,
    facts,
    observations,
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings.filter((item): item is string => typeof item === "string").slice(0, 8)
      : fallback.warnings,
    done: typeof candidate.done === "boolean" ? candidate.done : fallback.done,
  };
}

export function validateStepResult(value: unknown, fallbackState: ProjectState): StepResult {
  if (!value || typeof value !== "object") throw new Error("Model result is not an object");
  const candidate = value as Record<string, unknown>;
  const speak = text(candidate.speak).trim();
  const observation = text(candidate.observation).trim();
  if (!speak || !observation) throw new Error("Model result is missing required text");

  let mistake: StepResult["mistake"] = null;
  if (candidate.mistake && typeof candidate.mistake === "object") {
    const raw = candidate.mistake as Record<string, unknown>;
    const what = text(raw.what).trim();
    const fix = text(raw.fix).trim();
    if (what && fix) mistake = { what, fix };
  }

  const state = validateProjectState(candidate.state, fallbackState);
  const done = typeof candidate.done === "boolean" ? candidate.done : state.done;
  state.done = done;

  return {
    observation,
    state,
    mistake,
    speak,
    needsBetterView:
      typeof candidate.needsBetterView === "boolean" ? candidate.needsBetterView : false,
    done,
  };
}

export function fallbackStep(state: ProjectState): StepResult {
  return {
    observation: "The visual check did not complete, so the previous project state was preserved.",
    state,
    mistake: null,
    speak: "I didn't get a clear read on that. Hold the camera steady and say next.",
    needsBetterView: true,
    done: state.done,
  };
}
