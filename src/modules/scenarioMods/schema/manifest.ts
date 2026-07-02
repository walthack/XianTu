export interface ScenarioModManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  axisVersion?: string;
  axisOrder?: number;
  axisSeqLo?: number | null;
  axisSeqHi?: number | null;
  eventIdContract?: string;
  prevStageId?: string | null;
  prevStageName?: string | null;
  nextStageId?: string | null;
  nextStageName?: string | null;
}
