import { wallHookPlaybook } from "./wall-hook";

export const playbooks = {
  [wallHookPlaybook.id]: wallHookPlaybook,
} as const;

export type ActivityId = keyof typeof playbooks;

export function getPlaybook(activityId: string) {
  return playbooks[activityId as ActivityId] ?? null;
}
