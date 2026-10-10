import type { ScenarioStepScene } from './schema';
import { stepScene } from './fixedEndingNarratives';

/** A focus/candidate is not permission to disclose its authored step. */
export function settledStepScene(runtime: unknown, selection: { eventId: string; actionId: string } | null | undefined, attempted: boolean): ScenarioStepScene | undefined {
  if (!attempted || !selection?.eventId || !selection.actionId) return undefined;
  return stepScene(runtime, selection.eventId, selection.actionId);
}
