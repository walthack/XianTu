import {
  SCENARIO_MOD_SCHEMA,
  SCENARIO_MOD_VERSION,
  type ScenarioCondition,
  type ScenarioMod,
} from './schema';
import { getRegistryNamesById } from './characterResolver';
import { resolveReconcileBranchId } from './divergenceLedger';
import { NPC_ACTION_LIBRARY } from './npcDecisionCore';

export interface ScenarioModValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ScenarioModValidationResult {
  valid: boolean;
  issues: ScenarioModValidationIssue[];
  value?: ScenarioMod;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const CONDITION_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes', 'exists']);
const ITEM_TYPES = new Set(['weapon', 'armor', 'consumable', 'material', 'other']);
const WORLD_ACTOR_SCOPES = new Set(['world', 'state', 'region', 'faction', 'local', 'character']);
const WORLD_ACTOR_POLICIES = new Set(['process_only', 'local_state', 'divergence_allowed', 'if_only']);
const EVENT_TIMELINE_KINDS = new Set(['canon_anchor', 'window', 'emergent']);
const EVENT_KNOWLEDGE_POLICIES = new Set(['immediate', 'public_report', 'permission']);
const WORLD_OMEN_TRANSMITTER_KINDS = new Set(['related_npc', 'companion', 'messenger', 'environment']);
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateScenarioPath(path: unknown): boolean {
  if (!isNonEmptyString(path)) return false;
  const parts = path.split('.');
  return parts.every(part => part.length > 0 && !FORBIDDEN_PATH_SEGMENTS.has(part));
}

export function validateScenarioMod(input: unknown): ScenarioModValidationResult {
  const issues: ScenarioModValidationIssue[] = [];
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message });

  if (!isRecord(input)) {
    add('$', 'invalid_type', 'Scenario Mod must be a JSON object.');
    return { valid: false, issues };
  }

  if (input.schema !== SCENARIO_MOD_SCHEMA) {
    add('schema', 'invalid_schema', `schema must be "${SCENARIO_MOD_SCHEMA}".`);
  }
  if (input.version !== SCENARIO_MOD_VERSION) {
    add('version', 'unsupported_version', `version must be ${SCENARIO_MOD_VERSION}.`);
  }

  const manifest = input.manifest;
  if (!isRecord(manifest)) {
    add('manifest', 'required_object', 'manifest is required.');
  } else {
    validateId(manifest.id, 'manifest.id', add);
    requireString(manifest.name, 'manifest.name', add);
    requireString(manifest.version, 'manifest.version', add);
    optionalString(manifest.author, 'manifest.author', add);
    optionalString(manifest.description, 'manifest.description', add);
    optionalString(manifest.axisVersion, 'manifest.axisVersion', add);
    optionalNumber(manifest.axisOrder, 'manifest.axisOrder', add);
    optionalNumberOrNull(manifest.axisSeqLo, 'manifest.axisSeqLo', add);
    optionalNumberOrNull(manifest.axisSeqHi, 'manifest.axisSeqHi', add);
    optionalString(manifest.eventIdContract, 'manifest.eventIdContract', add);
    optionalStringOrNull(manifest.prevStageId, 'manifest.prevStageId', add);
    optionalStringOrNull(manifest.prevStageName, 'manifest.prevStageName', add);
    optionalStringOrNull(manifest.nextStageId, 'manifest.nextStageId', add);
    optionalStringOrNull(manifest.nextStageName, 'manifest.nextStageName', add);
  }

  const world = input.world;
  const continentIds = new Set<string>();
  if (!isRecord(world)) {
    add('world', 'required_object', 'world is required.');
  } else {
    requireString(world.name, 'world.name', add);
    requireString(world.era, 'world.era', add);
    requireString(world.background, 'world.background', add);
    validateStringArray(world.specialRules, 'world.specialRules', add);
    validateWorldMap(world.map, 'world.map', add);
    validateEntityArray(world.continents, 'world.continents', continentIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      validatePointArray(entity.bounds, `${entity.__path}.bounds`, add, 3);
    });
  }

  const globalIds = new Map<string, string>();
  for (const id of continentIds) globalIds.set(id, 'world.continents');

  const factionIds = new Set<string>();
  const locationIds = new Set<string>();
  const characterIds = new Set<string>();
  const skillIds = new Set<string>();
  const techniqueIds = new Set<string>();
  const itemIds = new Set<string>();
  const eventIds = new Set<string>();
  const chapterIds = new Set<string>();
  const pathReceiptIds = new Set<string>();
  const inventoryTransferIds = new Map<string, {
    sourceEventId: string;
    itemId: string;
    quantity: number;
    opportunityAlias: boolean;
  }>();
  const omenIds = new Set<string>();

  const validateInventoryTransfers = (
    value: unknown,
    path: string,
    sourceEventId: string,
    opportunityAlias: boolean,
  ) => {
    forEachRecord(value, path, (transfer, transferPath) => {
      const validTransferId = validateId(transfer.transferId, `${transferPath}.transferId`, add);
      const validItemId = validateId(transfer.itemId, `${transferPath}.itemId`, add);
      const validQuantity = typeof transfer.quantity === 'number'
        && Number.isInteger(transfer.quantity)
        && transfer.quantity >= 1
        && transfer.quantity <= 999;
      if (validTransferId) {
        const transferId = String(transfer.transferId);
        if (!transferId.startsWith(`${sourceEventId}.inventory.`)) {
          add(`${transferPath}.transferId`, 'invalid_owner', 'Inventory transfer IDs must be namespaced by the source event.');
        }
        const next = {
          sourceEventId,
          itemId: String(transfer.itemId),
          quantity: Number(transfer.quantity),
          opportunityAlias,
        };
        const previous = inventoryTransferIds.get(transferId);
        const samePhysicalTransfer = previous
          && previous.opportunityAlias
          && opportunityAlias
          && previous.sourceEventId === next.sourceEventId
          && previous.itemId === next.itemId
          && previous.quantity === next.quantity;
        if (previous && !samePhysicalTransfer) {
          add(`${transferPath}.transferId`, 'duplicate_id', `Duplicate or conflicting inventory transfer "${transferId}".`);
        } else if (!previous) {
          inventoryTransferIds.set(transferId, next);
        }
      }
      if (validItemId && !itemIds.has(String(transfer.itemId))) {
        add(`${transferPath}.itemId`, 'unknown_reference', `Unknown item "${transfer.itemId}".`);
      }
      if (!validQuantity) {
        add(`${transferPath}.quantity`, 'invalid_range', 'Inventory transfer quantity must be an integer within 1..999.');
      }
    });
  };

  const canon = input.canon;
  if (canon !== undefined && !isRecord(canon)) {
    add('canon', 'invalid_type', 'canon must be an object.');
  } else if (isRecord(canon)) {
    validateEntityArray(canon.factions, 'canon.factions', factionIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.type, `${entity.__path}.type`, add);
      optionalId(entity.headquartersLocationId, `${entity.__path}.headquartersLocationId`, add);
      optionalString(entity.level, `${entity.__path}.level`, add);
      validatePointArray(entity.territory, `${entity.__path}.territory`, add, 3);
      validateStringArray(entity.features, `${entity.__path}.features`, add);
    });
    validateEntityArray(canon.locations, 'canon.locations', locationIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.type, `${entity.__path}.type`, add);
      optionalString(entity.region, `${entity.__path}.region`, add);
      optionalId(entity.continentId, `${entity.__path}.continentId`, add);
      optionalId(entity.factionId, `${entity.__path}.factionId`, add);
      validatePoint(entity.coordinates, `${entity.__path}.coordinates`, add);
      validateStringArray(entity.features, `${entity.__path}.features`, add);
      optionalString(entity.safety, `${entity.__path}.safety`, add);
      optionalString(entity.status, `${entity.__path}.status`, add);
    });
    validateEntityArray(canon.characters, 'canon.characters', characterIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.role, `${entity.__path}.role`, add);
      optionalString(entity.gender, `${entity.__path}.gender`, add);
      optionalString(entity.realm, `${entity.__path}.realm`, add);
      optionalId(entity.factionId, `${entity.__path}.factionId`, add);
      validateCharacterAffiliations(entity.affiliations, `${entity.__path}.affiliations`, add);
      optionalId(entity.locationId, `${entity.__path}.locationId`, add);
      validateIdArray(entity.skillIds, `${entity.__path}.skillIds`, add);
      validateIdArray(entity.techniqueIds, `${entity.__path}.techniqueIds`, add);
      validateIdArray(entity.itemIds, `${entity.__path}.itemIds`, add);
      validateCharacterProfile(entity.profile, `${entity.__path}.profile`, add);
    });
    validatePlayerRelationships(canon.playerRelationships, 'canon.playerRelationships', add);
    validateCharacterRelationships(canon.relationships, 'canon.relationships', add);
    validateFactionRelationships(canon.factionRelationships, 'canon.factionRelationships', add);
  }

  const content = input.content;
  if (content !== undefined && !isRecord(content)) {
    add('content', 'invalid_type', 'content must be an object.');
  } else if (isRecord(content)) {
    validateEntityArray(content.skills, 'content.skills', skillIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.type, `${entity.__path}.type`, add);
      validateStringArray(entity.effects, `${entity.__path}.effects`, add);
    });
    validateEntityArray(content.techniques, 'content.techniques', techniqueIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.grade, `${entity.__path}.grade`, add);
      validateIdArray(entity.skillIds, `${entity.__path}.skillIds`, add);
    });
    validateEntityArray(content.items, 'content.items', itemIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.grade, `${entity.__path}.grade`, add);
      if (!ITEM_TYPES.has(String(entity.type))) {
        add(`${entity.__path}.type`, 'invalid_enum', 'item type is not supported.');
      }
      validateIdArray(entity.skillIds, `${entity.__path}.skillIds`, add);
      optionalId(entity.techniqueId, `${entity.__path}.techniqueId`, add);
    });
  }

  const scenario = input.scenario;
  if (!isRecord(scenario)) {
    add('scenario', 'required_object', 'scenario is required.');
  } else {
    const opening = scenario.opening;
    if (!isRecord(opening)) {
      add('scenario.opening', 'required_object', 'scenario.opening is required.');
    } else {
      requireString(opening.text, 'scenario.opening.text', add);
      optionalString(opening.playerRole, 'scenario.opening.playerRole', add);
      optionalId(opening.playerCharacterId, 'scenario.opening.playerCharacterId', add);
      validateCreationPreset(opening.creationPreset, 'scenario.opening.creationPreset', add);
      optionalId(opening.locationId, 'scenario.opening.locationId', add);
      validateIdArray(opening.featuredCharacterIds, 'scenario.opening.featuredCharacterIds', add);
    }
    validateFlags(scenario.initialFlags, 'scenario.initialFlags', add);
    if (scenario.initialPlayerKnowledge !== undefined) {
      if (!Array.isArray(scenario.initialPlayerKnowledge)) {
        add('scenario.initialPlayerKnowledge', 'invalid_type', 'initialPlayerKnowledge must be an array.');
      } else {
        const factIds = new Set<string>();
        scenario.initialPlayerKnowledge.forEach((rawFact, index) => {
          const path = `scenario.initialPlayerKnowledge[${index}]`;
          if (!isRecord(rawFact)) {
            add(path, 'invalid_type', `${path} must be an object.`);
            return;
          }
          if (validateId(rawFact.factId, `${path}.factId`, add)) {
            if (factIds.has(rawFact.factId)) add(`${path}.factId`, 'duplicate_id', `Duplicate player knowledge fact "${rawFact.factId}".`);
            factIds.add(rawFact.factId);
          }
          optionalId(rawFact.propositionId, `${path}.propositionId`, add);
          validateId(rawFact.subjectId, `${path}.subjectId`, add);
          requireString(rawFact.predicate, `${path}.predicate`, add);
          optionalId(rawFact.objectId, `${path}.objectId`, add);
          optionalString(rawFact.claim, `${path}.claim`, add);
          optionalId(rawFact.sourceEventId, `${path}.sourceEventId`, add);
          validateIdArray(rawFact.evidenceFactIds, `${path}.evidenceFactIds`, add);
          validateIdArray(rawFact.supersedesFactIds, `${path}.supersedesFactIds`, add);
          if (rawFact.source !== undefined) {
            if (!isRecord(rawFact.source)) {
              add(`${path}.source`, 'invalid_type', 'Knowledge source must be an object.');
            } else {
              if (!['observed', 'npc_statement', 'document', 'public_rumor'].includes(String(rawFact.source.kind))) {
                add(`${path}.source.kind`, 'invalid_enum', 'Unknown player knowledge source kind.');
              }
              optionalId(rawFact.source.actorId, `${path}.source.actorId`, add);
              requireString(rawFact.source.label, `${path}.source.label`, add);
            }
          }
          if (rawFact.status !== 'confirmed' && rawFact.status !== 'rumor') {
            add(`${path}.status`, 'invalid_enum', 'status must be confirmed or rumor.');
          }
          if (rawFact.disclosureScope !== 'player' && rawFact.disclosureScope !== 'public') {
            add(`${path}.disclosureScope`, 'invalid_enum', 'disclosureScope must be player or public.');
          }
        });
      }
    }
    if (scenario.initialNpcPrivateKnowledge !== undefined) {
      if (!Array.isArray(scenario.initialNpcPrivateKnowledge)) {
        add('scenario.initialNpcPrivateKnowledge', 'invalid_type', 'initialNpcPrivateKnowledge must be an array.');
      } else {
        const factIds = new Set<string>();
        scenario.initialNpcPrivateKnowledge.forEach((rawFact, index) => {
          const path = `scenario.initialNpcPrivateKnowledge[${index}]`;
          if (!isRecord(rawFact)) {
            add(path, 'invalid_type', `${path} must be an object.`);
            return;
          }
          if (validateId(rawFact.factId, `${path}.factId`, add)) {
            if (factIds.has(rawFact.factId)) add(`${path}.factId`, 'duplicate_id', `Duplicate NPC private knowledge fact "${rawFact.factId}".`);
            factIds.add(rawFact.factId);
          }
          validateIdArray(rawFact.holderCharacterIds, `${path}.holderCharacterIds`, add);
          if (!Array.isArray(rawFact.holderCharacterIds) || rawFact.holderCharacterIds.length === 0) {
            add(`${path}.holderCharacterIds`, 'required_array', 'NPC private knowledge requires at least one holder.');
          } else if (new Set(rawFact.holderCharacterIds).size !== rawFact.holderCharacterIds.length) {
            add(`${path}.holderCharacterIds`, 'duplicate_id', 'holderCharacterIds must be unique.');
          }
          validateId(rawFact.subjectId, `${path}.subjectId`, add);
          requireString(rawFact.predicate, `${path}.predicate`, add);
          optionalId(rawFact.objectId, `${path}.objectId`, add);
          requireString(rawFact.claim, `${path}.claim`, add);
          requireString(rawFact.behaviorCue, `${path}.behaviorCue`, add);
          requireString(rawFact.evidence, `${path}.evidence`, add);
          optionalId(rawFact.sourceEventId, `${path}.sourceEventId`, add);
          optionalId(rawFact.unlockAfterEventId, `${path}.unlockAfterEventId`, add);
          if (rawFact.status !== 'confirmed' && rawFact.status !== 'rumor') {
            add(`${path}.status`, 'invalid_enum', 'status must be confirmed or rumor.');
          }
          if (rawFact.forbiddenAssociations !== undefined) {
            if (!Array.isArray(rawFact.forbiddenAssociations)) {
              add(`${path}.forbiddenAssociations`, 'invalid_type', 'forbiddenAssociations must be an array.');
            } else {
              rawFact.forbiddenAssociations.forEach((rawRule, ruleIndex) => {
                const rulePath = `${path}.forbiddenAssociations[${ruleIndex}]`;
                if (!isRecord(rawRule)) {
                  add(rulePath, 'invalid_type', 'Forbidden association must be an object.');
                  return;
                }
                validateStringArray(rawRule.subjects, `${rulePath}.subjects`, add);
                validateStringArray(rawRule.predicates, `${rulePath}.predicates`, add);
                optionalBoolean(rawRule.allowHypothetical, `${rulePath}.allowHypothetical`, add);
                if (!Array.isArray(rawRule.subjects) || rawRule.subjects.length === 0) {
                  add(`${rulePath}.subjects`, 'required_array', 'Forbidden association requires at least one subject.');
                }
                if (!Array.isArray(rawRule.predicates) || rawRule.predicates.length === 0) {
                  add(`${rulePath}.predicates`, 'required_array', 'Forbidden association requires at least one predicate.');
                }
                if (rawRule.maxDistance !== undefined && (
                  typeof rawRule.maxDistance !== 'number'
                  || !Number.isInteger(rawRule.maxDistance)
                  || rawRule.maxDistance < 1
                  || rawRule.maxDistance > 256
                )) {
                  add(`${rulePath}.maxDistance`, 'invalid_range', 'maxDistance must be an integer from 1 to 256.');
                }
              });
            }
          }
        });
      }
    }
    validateEntityArray(scenario.events, 'scenario.events', eventIds, add, entity => {
      requireString(entity.description, `${entity.__path}.description`, add);
      optionalStringOrNull(entity.axisId, `${entity.__path}.axisId`, add);
      optionalString(entity.axisMethod, `${entity.__path}.axisMethod`, add);
      optionalString(entity.axisBeat, `${entity.__path}.axisBeat`, add);
      optionalString(entity.axisAnchor, `${entity.__path}.axisAnchor`, add);
      optionalNumber(entity.axisSeq, `${entity.__path}.axisSeq`, add);
      optionalBoolean(entity.critical, `${entity.__path}.critical`, add);
      validateConditions(entity.conditions, `${entity.__path}.conditions`, add);
      validateConditions(entity.completion, `${entity.__path}.completion`, add);
      validateStringArray(entity.completionEvidence, `${entity.__path}.completionEvidence`, add);
      validateIdArray(entity.relatedCharacterIds, `${entity.__path}.relatedCharacterIds`, add);
      validateIdArray(entity.relatedFactionIds, `${entity.__path}.relatedFactionIds`, add);
      optionalId(entity.locationId, `${entity.__path}.locationId`, add);
      optionalString(entity.objective, `${entity.__path}.objective`, add);
      if (entity.presentation !== undefined) {
        if (!isRecord(entity.presentation)) {
          add(`${entity.__path}.presentation`, 'invalid_type', 'presentation must be an object.');
        } else {
          optionalString(entity.presentation.targetLabel, `${entity.__path}.presentation.targetLabel`, add);
          optionalString(entity.presentation.image, `${entity.__path}.presentation.image`, add);
          optionalString(entity.presentation.playerLine, `${entity.__path}.presentation.playerLine`, add);
          if (entity.presentation.stepGuardTerms !== undefined) {
            const guardPath = `${entity.__path}.presentation.stepGuardTerms`;
            if (!isRecord(entity.presentation.stepGuardTerms)) {
              add(guardPath, 'invalid_type', 'stepGuardTerms must be an object keyed by action id.');
            } else {
              const actionIds = new Set(
                isRecord(entity.playerCompletionContract) && Array.isArray(entity.playerCompletionContract.actions)
                  ? entity.playerCompletionContract.actions
                    .filter(isRecord)
                    .map(action => action.id)
                    .filter((id): id is string => typeof id === 'string')
                  : [],
              );
              for (const [actionId, terms] of Object.entries(entity.presentation.stepGuardTerms)) {
                validateStringArray(terms, `${guardPath}.${actionId}`, add);
                if (!actionIds.has(actionId)) {
                  add(`${guardPath}.${actionId}`, 'invalid_reference', 'stepGuardTerms key must reference an action in playerCompletionContract.');
                }
              }
            }
          }
        }
      }
      if (entity.exploration !== undefined) {
        const explorationPath = `${entity.__path}.exploration`;
        if (!isRecord(entity.exploration)) {
          add(explorationPath, 'invalid_type', 'exploration must be an object.');
        } else {
          const roles = ['seed', 'investigate', 'position', 'payoff'];
          if (!roles.includes(String(entity.exploration.role))) {
            add(`${explorationPath}.role`, 'invalid_enum', 'Unknown exploration role.');
          }
          if (entity.exploration.secondaryRole !== undefined && !roles.includes(String(entity.exploration.secondaryRole))) {
            add(`${explorationPath}.secondaryRole`, 'invalid_enum', 'Unknown secondary exploration role.');
          }
          if (entity.critical !== false) {
            add(explorationPath, 'invalid_value', 'Exploration events must explicitly declare critical=false.');
          }
          if (!isRecord(entity.playerCompletionContract)) {
            add(explorationPath, 'missing_contract', 'Exploration events require playerCompletionContract.');
          }
        }
      }
      if (entity.playerCompletionContract !== undefined) {
        const contractPath = `${entity.__path}.playerCompletionContract`;
        if (!isRecord(entity.playerCompletionContract)) {
          add(contractPath, 'invalid_type', 'playerCompletionContract must be an object.');
        } else {
          const contract = entity.playerCompletionContract;
          if (!['local_condition', 'objective_action'].includes(String(contract.kind))) {
            add(`${contractPath}.kind`, 'invalid_enum', 'playerCompletionContract.kind must be local_condition or objective_action.');
          }
          if (
            !Array.isArray(contract.settleOn)
            || contract.settleOn.length < 1
            || contract.settleOn.some(outcome => !['success', 'partial', 'failure'].includes(String(outcome)))
          ) {
            add(`${contractPath}.settleOn`, 'invalid_enum', 'settleOn must contain success, partial, and/or failure.');
          }
          if (!Array.isArray(contract.actions) || contract.actions.length < 1 || contract.actions.length > 8) {
            add(`${contractPath}.actions`, 'invalid_range', 'playerCompletionContract.actions must contain 1 to 8 actions.');
          } else {
            const actionIds = new Set<string>();
            const grantedPreparationIds = new Set<string>();
            const requiredPreparationRefs: Array<{ key: string; path: string }> = [];
            forEachRecord(contract.actions, `${contractPath}.actions`, (action, actionPath) => {
              if (validateId(action.id, `${actionPath}.id`, add)) {
                if (actionIds.has(action.id)) add(`${actionPath}.id`, 'duplicate_id', `Duplicate event action "${action.id}".`);
                actionIds.add(action.id);
              }
              requireString(action.label, `${actionPath}.label`, add);
              requireString(action.actionText, `${actionPath}.actionText`, add);
              if (action.timeCost !== 1) add(`${actionPath}.timeCost`, 'invalid_value', 'Structured event actions currently require timeCost=1.');
              if (action.kind !== undefined && !['attempt', 'prepare'].includes(String(action.kind))) {
                add(`${actionPath}.kind`, 'invalid_enum', 'Event action kind must be attempt or prepare.');
              }
              if (action.requiresPreparation !== undefined) {
                validateIdArray(action.requiresPreparation, `${actionPath}.requiresPreparation`, add);
                for (const key of Array.isArray(action.requiresPreparation) ? action.requiresPreparation : []) {
                  if (typeof key === 'string') requiredPreparationRefs.push({ key, path: `${actionPath}.requiresPreparation` });
                }
              }
              if (action.grantsPreparation !== undefined) {
                if (validateId(action.grantsPreparation, `${actionPath}.grantsPreparation`, add)) {
                  const key = String(action.grantsPreparation);
                  if (grantedPreparationIds.has(key)) {
                    add(`${actionPath}.grantsPreparation`, 'duplicate_id', `Duplicate preparation key "${key}".`);
                  }
                  grantedPreparationIds.add(key);
                }
              }
              if (action.kind === 'prepare' && typeof action.grantsPreparation !== 'string') {
                add(`${actionPath}.grantsPreparation`, 'required', 'A prepare action must grant a preparation key.');
              }
              if (action.kind !== 'prepare' && action.grantsPreparation !== undefined) {
                add(`${actionPath}.grantsPreparation`, 'invalid_value', 'Only prepare actions may grant preparation.');
              }
              if (contract.kind === 'local_condition' && action.judgement === undefined) {
                if (!Array.isArray(action.successWhen) || action.successWhen.length < 1) {
                  add(`${actionPath}.successWhen`, 'required_array', 'A local condition action needs at least one success condition.');
                } else {
                  validateConditions(action.successWhen, `${actionPath}.successWhen`, add);
                }
                if (!['partial', 'failure'].includes(String(action.unmetOutcome))) {
                  add(`${actionPath}.unmetOutcome`, 'invalid_enum', 'unmetOutcome must be partial or failure.');
                }
              } else if (contract.kind !== 'local_condition') {
                if (action.successWhen !== undefined) {
                  add(`${actionPath}.successWhen`, 'forbidden', 'objective_action must not declare successWhen.');
                }
                if (action.unmetOutcome !== undefined) {
                  add(`${actionPath}.unmetOutcome`, 'forbidden', 'objective_action must not declare unmetOutcome.');
                }
              }
              if (action.intentMatch !== undefined) {
                validateIntentMatch(action.intentMatch, `${actionPath}.intentMatch`, add);
              }
              if (action.requiresPresentCharacterIds !== undefined) {
                validateIdArray(action.requiresPresentCharacterIds, `${actionPath}.requiresPresentCharacterIds`, add);
                for (const characterId of Array.isArray(action.requiresPresentCharacterIds) ? action.requiresPresentCharacterIds : []) {
                  if (typeof characterId === 'string' && !characterIds.has(characterId)) {
                    add(`${actionPath}.requiresPresentCharacterIds`, 'unknown_reference', `Unknown character "${characterId}".`);
                  }
                }
              }
              if (action.visibleWhen !== undefined) {
                validateConditions(action.visibleWhen, `${actionPath}.visibleWhen`, add);
              }
              if (action.judgement !== undefined) {
                validateEventActionJudgement(action.judgement, `${actionPath}.judgement`, characterIds, add);
              }
              if (!isRecord(action.outcomeText)) {
                add(`${actionPath}.outcomeText`, 'required_object', 'outcomeText must declare all three outcomes.');
              } else {
                for (const outcome of ['success', 'partial', 'failure']) {
                  requireString(action.outcomeText[outcome], `${actionPath}.outcomeText.${outcome}`, add);
                }
              }
              if (action.outcomeEffects !== undefined) {
                if (!isRecord(action.outcomeEffects)) {
                  add(`${actionPath}.outcomeEffects`, 'invalid_type', 'outcomeEffects must be an object.');
                } else {
                  for (const [outcome, rawEffects] of Object.entries(action.outcomeEffects)) {
                    const effectsPath = `${actionPath}.outcomeEffects.${outcome}`;
                    if (!['success', 'partial', 'failure'].includes(outcome)) {
                      add(effectsPath, 'invalid_enum', `Unknown outcome effect "${outcome}".`);
                      continue;
                    }
                    if (!isRecord(rawEffects)) {
                      add(effectsPath, 'invalid_type', 'Outcome effects must be an object.');
                      continue;
                    }
                    validateInventoryTransfers(
                      rawEffects.inventoryTransfers,
                      `${effectsPath}.inventoryTransfers`,
                      String(entity.id),
                      false,
                    );
                    forEachRecord(rawEffects.relationships, `${effectsPath}.relationships`, (relationship, relationshipPath) => {
                      for (const field of ['actorId', 'targetCharacterId']) {
                        if (validateId(relationship[field], `${relationshipPath}.${field}`, add)
                          && !characterIds.has(String(relationship[field]))) {
                          add(`${relationshipPath}.${field}`, 'unknown_reference', `Unknown character "${relationship[field]}".`);
                        }
                      }
                      requireString(relationship.dimension, `${relationshipPath}.dimension`, add);
                      if (typeof relationship.delta !== 'number' || !Number.isFinite(relationship.delta)
                        || relationship.delta < -100 || relationship.delta > 100) {
                        add(`${relationshipPath}.delta`, 'invalid_range', 'Relationship delta must be within -100..100.');
                      }
                    });
                    forEachRecord(rawEffects.npcKnowledge, `${effectsPath}.npcKnowledge`, (knowledge, knowledgePath) => {
                      validateIdArray(knowledge.actorIds, `${knowledgePath}.actorIds`, add);
                      for (const actorId of Array.isArray(knowledge.actorIds) ? knowledge.actorIds : []) {
                        if (typeof actorId === 'string' && !characterIds.has(actorId)) {
                          add(`${knowledgePath}.actorIds`, 'unknown_reference', `Unknown character "${actorId}".`);
                        }
                      }
                      validateId(knowledge.factId, `${knowledgePath}.factId`, add);
                    });
                    forEachRecord(rawEffects.playerKnowledge, `${effectsPath}.playerKnowledge`, (knowledge, knowledgePath) => {
                      const factValid = validateId(knowledge.factId, `${knowledgePath}.factId`, add);
                      const propositionValid = optionalId(knowledge.propositionId, `${knowledgePath}.propositionId`, add);
                      if (entity.exploration !== undefined && factValid
                        && !String(knowledge.factId).startsWith(`${entity.id}.knowledge.`)) {
                        add(`${knowledgePath}.factId`, 'invalid_owner', 'Exploration knowledge IDs must be namespaced by the source event.');
                      }
                      if (entity.exploration !== undefined && propositionValid && knowledge.propositionId !== undefined
                        && !String(knowledge.propositionId).startsWith(`${entity.id}.proposition.`)) {
                        add(`${knowledgePath}.propositionId`, 'invalid_owner', 'Exploration proposition IDs must be namespaced by the source event.');
                      }
                      validateId(knowledge.subjectId, `${knowledgePath}.subjectId`, add);
                      requireString(knowledge.predicate, `${knowledgePath}.predicate`, add);
                      optionalId(knowledge.objectId, `${knowledgePath}.objectId`, add);
                      optionalString(knowledge.claim, `${knowledgePath}.claim`, add);
                      validateIdArray(knowledge.evidenceFactIds, `${knowledgePath}.evidenceFactIds`, add);
                      validateIdArray(knowledge.supersedesFactIds, `${knowledgePath}.supersedesFactIds`, add);
                      if (knowledge.source !== undefined) {
                        if (!isRecord(knowledge.source)) {
                          add(`${knowledgePath}.source`, 'invalid_type', 'Knowledge source must be an object.');
                        } else {
                          if (!['observed', 'npc_statement', 'document', 'public_rumor'].includes(String(knowledge.source.kind))) {
                            add(`${knowledgePath}.source.kind`, 'invalid_enum', 'Unknown player knowledge source kind.');
                          }
                          optionalId(knowledge.source.actorId, `${knowledgePath}.source.actorId`, add);
                          requireString(knowledge.source.label, `${knowledgePath}.source.label`, add);
                        }
                      }
                      if (!['confirmed', 'rumor'].includes(String(knowledge.status))) {
                        add(`${knowledgePath}.status`, 'invalid_enum', 'Player knowledge status must be confirmed or rumor.');
                      }
                      if (!['player', 'public'].includes(String(knowledge.disclosureScope))) {
                        add(`${knowledgePath}.disclosureScope`, 'invalid_enum', 'disclosureScope must be player or public.');
                      }
                    });
                    forEachRecord(rawEffects.pathReceipts, `${effectsPath}.pathReceipts`, (receipt, receiptPath) => {
                      for (const field of ['receiptId', 'sourceEventId', 'choiceId', 'mutexGroupId']) {
                        const valid = validateId(receipt[field], `${receiptPath}.${field}`, add);
                        if (field === 'receiptId' && valid) {
                          const receiptId = String(receipt[field]);
                          if (pathReceiptIds.has(receiptId)) add(`${receiptPath}.${field}`, 'duplicate_id', `Duplicate path receipt "${receiptId}".`);
                          pathReceiptIds.add(receiptId);
                        }
                      }
                      if (entity.exploration !== undefined) {
                        if (receipt.sourceEventId !== entity.id) {
                          add(`${receiptPath}.sourceEventId`, 'invalid_owner', 'Exploration path receipts must reference their owning event.');
                        }
                        if (receipt.choiceId !== action.id) {
                          add(`${receiptPath}.choiceId`, 'invalid_owner', 'Exploration path receipts must reference their owning action.');
                        }
                        if (typeof receipt.receiptId === 'string'
                          && !receipt.receiptId.startsWith(`${entity.id}.path.`)) {
                          add(`${receiptPath}.receiptId`, 'invalid_owner', 'Exploration receipt IDs must be namespaced by the source event.');
                        }
                        if (typeof receipt.mutexGroupId === 'string'
                          && !receipt.mutexGroupId.startsWith(`${entity.id}.mutex.`)) {
                          add(`${receiptPath}.mutexGroupId`, 'invalid_owner', 'Exploration mutex IDs must be namespaced by the source event.');
                        }
                      }
                      if (!['position', 'allegiance', 'method', 'participation', 'route'].includes(String(receipt.dimension))) {
                        add(`${receiptPath}.dimension`, 'invalid_enum', 'Path receipt dimension must be position, allegiance, method, participation, or route.');
                      }
                      requireString(receipt.label, `${receiptPath}.label`, add);
                      validateIdArray(receipt.consumeAtEventIds, `${receiptPath}.consumeAtEventIds`, add);
                      if (!Array.isArray(receipt.consumeAtEventIds) || receipt.consumeAtEventIds.length < 1) {
                        add(`${receiptPath}.consumeAtEventIds`, 'required_array', 'Path receipt must declare at least one downstream consumer.');
                      }
                      optionalId(receipt.expiresAfterEventId, `${receiptPath}.expiresAfterEventId`, add);
                    });
                    forEachRecord(rawEffects.memories, `${effectsPath}.memories`, (memory, memoryPath) => {
                      validateIdArray(memory.actorIds, `${memoryPath}.actorIds`, add);
                      for (const actorId of Array.isArray(memory.actorIds) ? memory.actorIds : []) {
                        if (typeof actorId === 'string' && !characterIds.has(actorId)) {
                          add(`${memoryPath}.actorIds`, 'unknown_reference', `Unknown character "${actorId}".`);
                        }
                      }
                      requireString(memory.summary, `${memoryPath}.summary`, add);
                      validateStringArray(memory.tags, `${memoryPath}.tags`, add);
                      if (typeof memory.salience !== 'number' || !Number.isFinite(memory.salience)
                        || memory.salience < 1 || memory.salience > 100) {
                        add(`${memoryPath}.salience`, 'invalid_range', 'Memory salience must be within 1..100.');
                      }
                    });
                  }
                }
              }
            });
            for (const reference of requiredPreparationRefs) {
              if (!grantedPreparationIds.has(reference.key)) {
                add(reference.path, 'unknown_reference', `Unknown preparation key "${reference.key}".`);
              }
            }
          }
          const completion = Array.isArray(entity.completion) ? entity.completion : [];
          const standardEngineFlag = completion.length === 1
            && isRecord(completion[0])
            && typeof completion[0].path === 'string'
            && completion[0].path.startsWith('flags.')
            && completion[0].operator === 'eq'
            && completion[0].value === true;
          if (!standardEngineFlag) {
            add(contractPath, 'unsupported_completion', 'A local event contract requires exactly one flags.* = true event completion condition.');
          }
        }
      }
      if (entity.narrativeFactReceipts !== undefined) {
        const receiptsPath = `${entity.__path}.narrativeFactReceipts`;
        if (!Array.isArray(entity.narrativeFactReceipts)) {
          add(receiptsPath, 'invalid_type', 'narrativeFactReceipts must be an array.');
        } else {
          const contract = isRecord(entity.playerCompletionContract)
            ? entity.playerCompletionContract
            : undefined;
          const contractActions = contract && Array.isArray(contract.actions)
            ? contract.actions.filter(isRecord)
            : [];
          const actionIds = new Set(
            contractActions.map(action => action.id).filter((id): id is string => typeof id === 'string'),
          );
          const receiptIds = new Set<string>();
          forEachRecord(entity.narrativeFactReceipts, receiptsPath, (receipt, receiptPath) => {
            if (validateId(receipt.id, `${receiptPath}.id`, add)) {
              const id = String(receipt.id);
              if (receiptIds.has(id)) add(`${receiptPath}.id`, 'duplicate_id', `Duplicate narrative fact receipt "${id}".`);
              receiptIds.add(id);
            }
            if (validateId(receipt.actionId, `${receiptPath}.actionId`, add)
              && !actionIds.has(String(receipt.actionId))) {
              add(`${receiptPath}.actionId`, 'unknown_reference', `Unknown event action "${receipt.actionId}".`);
            }
            if (!['success', 'partial', 'failure'].includes(String(receipt.outcome))) {
              add(`${receiptPath}.outcome`, 'invalid_enum', 'Narrative fact outcome must be success, partial, or failure.');
            }
            if (receipt.category !== 'loss') {
              add(`${receiptPath}.category`, 'invalid_enum', 'Narrative fact category currently supports only loss.');
            }
            const boundAction = contractActions.find(action => action.id === receipt.actionId);
            const settleOn = contract && Array.isArray(contract.settleOn) ? contract.settleOn : [];
            if (
              boundAction
              && (boundAction.kind === 'prepare' || !settleOn.includes(receipt.outcome))
            ) {
              add(receiptPath, 'non_settling_binding', 'Narrative fact receipts must bind to an event-settling action and outcome.');
            }
            requireString(receipt.claim, `${receiptPath}.claim`, add);
            if (
              typeof receipt.claim === 'string'
              && (receipt.claim.length > 120 || /[；。！？\n\r]|renderGuard\./u.test(receipt.claim))
            ) {
              add(`${receiptPath}.claim`, 'invalid_value', 'Narrative fact claim must be a short single clause without control markers or sentence punctuation.');
            }
          });
        }
      }
      if (entity.timeline !== undefined) {
        const timelinePath = `${entity.__path}.timeline`;
        if (!isRecord(entity.timeline)) {
          add(timelinePath, 'invalid_type', 'timeline must be an object.');
        } else {
          if (!EVENT_TIMELINE_KINDS.has(String(entity.timeline.kind))) {
            add(`${timelinePath}.kind`, 'invalid_enum', 'timeline kind must be canon_anchor, window, or emergent.');
          }
          const notBefore = entity.timeline.notBeforeTurns;
          if (typeof notBefore !== 'number' || !Number.isInteger(notBefore) || notBefore < 0) {
            add(`${timelinePath}.notBeforeTurns`, 'invalid_range', 'notBeforeTurns must be a non-negative integer.');
          }
          const deadline = entity.timeline.deadlineTurns;
          if (
            deadline !== undefined
            && (typeof deadline !== 'number' || !Number.isInteger(deadline) || deadline < 0)
          ) {
            add(`${timelinePath}.deadlineTurns`, 'invalid_range', 'deadlineTurns must be a non-negative integer.');
          }
          if (typeof notBefore === 'number' && typeof deadline === 'number' && deadline < notBefore) {
            add(`${timelinePath}.deadlineTurns`, 'invalid_range', 'deadlineTurns must not precede notBeforeTurns.');
          }
          if (['canon_anchor', 'window'].includes(String(entity.timeline.kind)) && typeof deadline !== 'number') {
            add(`${timelinePath}.deadlineTurns`, 'required_number', 'canon_anchor and window timelines require a deadlineTurns value.');
          }
          if (entity.timeline.kind === 'emergent' && deadline !== undefined) {
            add(`${timelinePath}.deadlineTurns`, 'unexpected_value', 'emergent timelines must not declare a hard deadline.');
          }
          if (typeof deadline === 'number' && !isRecord(entity.offscreenResolution)) {
            add(`${timelinePath}.deadlineTurns`, 'missing_resolution', 'A timeline deadline requires offscreenResolution.');
          }
          if (!isRecord(entity.timeline.reveal)) {
            add(`${timelinePath}.reveal`, 'required_object', 'timeline.reveal is required.');
          } else {
            const publicAfter = entity.timeline.reveal.publicAfterTurns;
            if (
              publicAfter !== undefined
              && (typeof publicAfter !== 'number' || !Number.isInteger(publicAfter) || publicAfter < 0)
            ) {
              add(`${timelinePath}.reveal.publicAfterTurns`, 'invalid_range', 'publicAfterTurns must be a non-negative integer.');
            }
            if (!EVENT_KNOWLEDGE_POLICIES.has(String(entity.timeline.reveal.playerKnowledge))) {
              add(`${timelinePath}.reveal.playerKnowledge`, 'invalid_enum', 'playerKnowledge must be immediate, public_report, or permission.');
            }
            if (entity.timeline.reveal.playerKnowledge === 'public_report' && typeof publicAfter !== 'number') {
              add(`${timelinePath}.reveal.publicAfterTurns`, 'required_number', 'public_report requires publicAfterTurns.');
            }
            if (entity.timeline.reveal.playerKnowledge === 'permission') {
              validateId(entity.timeline.reveal.permissionKey, `${timelinePath}.reveal.permissionKey`, add);
            } else if (entity.timeline.reveal.permissionKey !== undefined) {
              add(`${timelinePath}.reveal.permissionKey`, 'unexpected_value', 'permissionKey is only valid for permission knowledge.');
            }
            const presentation = entity.timeline.reveal.presentation;
            if (presentation !== undefined) {
              if (!isRecord(presentation)) {
                add(`${timelinePath}.reveal.presentation`, 'invalid_type', 'reveal presentation must be an object.');
              } else {
                if (typeof presentation.title !== 'string' || !presentation.title.trim()) {
                  add(`${timelinePath}.reveal.presentation.title`, 'required_string', 'reveal presentation title is required.');
                }
                if (typeof presentation.text !== 'string' || !presentation.text.trim()) {
                  add(`${timelinePath}.reveal.presentation.text`, 'required_string', 'reveal presentation text is required.');
                }
              }
            }
            if (entity.timeline.omen !== undefined) {
              validateWorldOmen(entity.timeline.omen, `${timelinePath}.omen`, add, characterIds, omenIds);
              if (
                isRecord(entity.timeline.omen)
                && typeof deadline === 'number'
                && typeof entity.timeline.omen.afterTurns === 'number'
                && entity.timeline.omen.afterTurns >= deadline
              ) {
                add(`${timelinePath}.omen.afterTurns`, 'invalid_range', 'omen.afterTurns must precede deadlineTurns.');
              }
            }
          }
        }
      }
      forEachRecord(entity.narrativeVariants, `${entity.__path}.narrativeVariants`, (variant, variantPath) => {
        validateConditions(variant.when, `${variantPath}.when`, add);
        optionalBoolean(variant.replacesCanonRail, `${variantPath}.replacesCanonRail`, add);
        optionalString(variant.name, `${variantPath}.name`, add);
        optionalString(variant.description, `${variantPath}.description`, add);
        optionalString(variant.axisBeat, `${variantPath}.axisBeat`, add);
        optionalString(variant.objective, `${variantPath}.objective`, add);
      });
      if (entity.offscreenResolution !== undefined) {
        const resolutionPath = `${entity.__path}.offscreenResolution`;
        if (!isRecord(entity.offscreenResolution)) {
          add(resolutionPath, 'invalid_type', 'offscreenResolution must be an object.');
        } else {
          validateId(entity.offscreenResolution.id, `${resolutionPath}.id`, add);
          optionalNumber(entity.offscreenResolution.afterStallTurns, `${resolutionPath}.afterStallTurns`, add);
          if (typeof entity.offscreenResolution.afterStallTurns !== 'number' || entity.offscreenResolution.afterStallTurns < 1) {
            add(`${resolutionPath}.afterStallTurns`, 'invalid_range', 'afterStallTurns must be at least 1.');
          }
          if (!validateScenarioPath(entity.offscreenResolution.flagKey)) {
            add(`${resolutionPath}.flagKey`, 'invalid_path', 'flagKey must be a safe dotted runtime flag path.');
          }
          validateIdArray(entity.offscreenResolution.resolvedEventIds, `${resolutionPath}.resolvedEventIds`, add);
          requireString(entity.offscreenResolution.worldDelta, `${resolutionPath}.worldDelta`, add);
          requireString(entity.offscreenResolution.evidence, `${resolutionPath}.evidence`, add);
        }
      }
      if (entity.worldActor !== undefined) {
        const actorPath = `${entity.__path}.worldActor`;
        if (!isRecord(entity.worldActor)) {
          add(actorPath, 'invalid_type', 'worldActor must be an object.');
        } else {
          const pressure = entity.worldActor.pressure;
          if (!isRecord(pressure)) {
            add(`${actorPath}.pressure`, 'required_object', 'worldActor.pressure is required.');
          } else {
            validateId(pressure.id, `${actorPath}.pressure.id`, add);
            requireString(pressure.summary, `${actorPath}.pressure.summary`, add);
            if (!WORLD_ACTOR_SCOPES.has(String(pressure.scope))) add(`${actorPath}.pressure.scope`, 'invalid_enum', 'worldActor pressure scope is not supported.');
            if (!WORLD_ACTOR_POLICIES.has(String(pressure.canonPolicy))) add(`${actorPath}.pressure.canonPolicy`, 'invalid_enum', 'worldActor canonPolicy is not supported.');
            if (![1, 2, 3].includes(Number(pressure.intensity))) add(`${actorPath}.pressure.intensity`, 'invalid_enum', 'worldActor intensity must be 1, 2, or 3.');
            validateStringArray(pressure.domains, `${actorPath}.pressure.domains`, add);
            validateStringArray(pressure.geography, `${actorPath}.pressure.geography`, add);
            validateIdArray(pressure.factionIds, `${actorPath}.pressure.factionIds`, add);
          }
          if (!Array.isArray(entity.worldActor.agendas) && !isRecord(entity.worldActor.decisionCore)) {
            add(`${actorPath}.agendas`, 'required_array', 'worldActor requires legacy agendas or a decisionCore.');
          }
          forEachRecord(entity.worldActor.agendas, `${actorPath}.agendas`, (agenda, agendaPath) => {
            validateId(agenda.id, `${agendaPath}.id`, add);
            validateId(agenda.characterId, `${agendaPath}.characterId`, add);
            requireString(agenda.goal, `${agendaPath}.goal`, add);
            requireString(agenda.nextAction, `${agendaPath}.nextAction`, add);
            requireString(agenda.visibleSignal, `${agendaPath}.visibleSignal`, add);
            requireString(agenda.offscreenAction, `${agendaPath}.offscreenAction`, add);
            validateStringArray(agenda.forbiddenOutcomes, `${agendaPath}.forbiddenOutcomes`, add);
          });
          if (entity.worldActor.decisionCore !== undefined) {
            validateNpcDecisionCore(
              entity.worldActor.decisionCore,
              `${actorPath}.decisionCore`,
              characterIds,
              factionIds,
              locationIds,
              add,
            );
          }
          if (!Array.isArray(entity.worldActor.opportunities) || entity.worldActor.opportunities.length === 0) {
            add(`${actorPath}.opportunities`, 'required_array', 'worldActor.opportunities must contain at least one opportunity.');
          }
          forEachRecord(entity.worldActor.opportunities, `${actorPath}.opportunities`, (opportunity, opportunityPath) => {
            validateId(opportunity.id, `${opportunityPath}.id`, add);
            requireString(opportunity.title, `${opportunityPath}.title`, add);
            validateIdArray(opportunity.characterIds, `${opportunityPath}.characterIds`, add);
            for (const key of ['whyNow', 'nextStep', 'stakes', 'rewardPreview', 'futureHint', 'actionText', 'rewardLabel']) {
              requireString(opportunity[key], `${opportunityPath}.${key}`, add);
            }
            validateId(opportunity.rewardKey, `${opportunityPath}.rewardKey`, add);
            if (
              opportunity.expiresAfterTurns !== undefined
              && (
                typeof opportunity.expiresAfterTurns !== 'number'
                || !Number.isInteger(opportunity.expiresAfterTurns)
                || opportunity.expiresAfterTurns < 1
                || opportunity.expiresAfterTurns > 20
              )
            ) {
              add(`${opportunityPath}.expiresAfterTurns`, 'invalid_range', 'expiresAfterTurns must be an integer from 1 to 20.');
            }
            if (opportunity.completionContract !== undefined) {
              const contractPath = `${opportunityPath}.completionContract`;
              if (!isRecord(opportunity.completionContract)) {
                add(contractPath, 'invalid_type', 'completionContract must be an object.');
              } else {
                const contract = opportunity.completionContract;
                if (contract.kind !== 'player_action_sequence') {
                  add(`${contractPath}.kind`, 'invalid_enum', 'completionContract.kind must be player_action_sequence.');
                }
                if (contract.settlement !== undefined && !['immediate', 'timeline_deadline'].includes(String(contract.settlement))) {
                  add(`${contractPath}.settlement`, 'invalid_enum', 'completionContract.settlement must be immediate or timeline_deadline.');
                }
                if (contract.expiry !== undefined && !['standard', 'persistent'].includes(String(contract.expiry))) {
                  add(`${contractPath}.expiry`, 'invalid_enum', 'completionContract.expiry must be standard or persistent.');
                }
                if (contract.expiry === 'persistent' && opportunity.expiresAfterTurns !== undefined) {
                  add(`${contractPath}.expiry`, 'conflicting_expiry', 'persistent completion contracts cannot declare expiresAfterTurns.');
                }
                if (
                  contract.settlement === 'timeline_deadline'
                  && (!isRecord(entity.timeline) || typeof entity.timeline.deadlineTurns !== 'number')
                ) {
                  add(`${contractPath}.settlement`, 'missing_deadline', 'timeline_deadline settlement requires event.timeline.deadlineTurns.');
                }
                if (!Array.isArray(contract.steps) || contract.steps.length < 1 || contract.steps.length > 8) {
                  add(`${contractPath}.steps`, 'invalid_range', 'completionContract.steps must contain 1 to 8 steps.');
                } else {
                  const stepIds = new Set<string>();
                  forEachRecord(contract.steps, `${contractPath}.steps`, (step, stepPath) => {
                    if (validateId(step.id, `${stepPath}.id`, add)) {
                      if (stepIds.has(step.id)) add(`${stepPath}.id`, 'duplicate_id', `Duplicate completion step "${step.id}".`);
                      stepIds.add(step.id);
                    }
                    requireString(step.label, `${stepPath}.label`, add);
                    if (step.actions !== undefined && !Array.isArray(step.actions)) {
                      add(`${stepPath}.actions`, 'invalid_type', 'completion step actions must be an array.');
                    } else if (Array.isArray(step.actions)) {
                      const actionIds = new Set<string>();
                      forEachRecord(step.actions, `${stepPath}.actions`, (action, actionPath) => {
                        if (validateId(action.id, `${actionPath}.id`, add)) {
                          if (actionIds.has(action.id)) add(`${actionPath}.id`, 'duplicate_id', `Duplicate step action "${action.id}".`);
                          actionIds.add(action.id);
                        }
                        requireString(action.label, `${actionPath}.label`, add);
                        requireString(action.actionText, `${actionPath}.actionText`, add);
                        if (action.timeCost !== 1) add(`${actionPath}.timeCost`, 'invalid_value', 'R2-11 structured actions currently require timeCost=1.');
                      });
                    }
                    validateStringArray(step.matchAny, `${stepPath}.matchAny`, add);
                    validateStringArray(step.matchAll, `${stepPath}.matchAll`, add);
                    validateStringArray(step.rejectIf, `${stepPath}.rejectIf`, add);
                    const hasAny = Array.isArray(step.matchAny) && step.matchAny.length > 0;
                    const hasAll = Array.isArray(step.matchAll) && step.matchAll.length > 0;
                    if (!hasAny && !hasAll) {
                      add(stepPath, 'empty_matcher', 'A completion step needs matchAny or matchAll evidence.');
                    }
                    if (step.outcomeEffects !== undefined) {
                      if (!isRecord(step.outcomeEffects)) {
                        add(`${stepPath}.outcomeEffects`, 'invalid_type', 'Opportunity step outcomeEffects must be an object.');
                      } else {
                        validateInventoryTransfers(
                          step.outcomeEffects.inventoryTransfers,
                          `${stepPath}.outcomeEffects.inventoryTransfers`,
                          String(entity.id),
                          true,
                        );
                      }
                    }
                  });
                }
                const completion = Array.isArray(entity.completion) ? entity.completion : [];
                const standardEngineFlag = completion.length === 1
                  && isRecord(completion[0])
                  && typeof completion[0].path === 'string'
                  && completion[0].path.startsWith('flags.')
                  && completion[0].operator === 'eq'
                  && completion[0].value === true;
                if (!standardEngineFlag) {
                  add(
                    contractPath,
                    'unsupported_completion',
                    'A deterministic opportunity requires exactly one flags.* = true event completion condition.',
                  );
                }
              }
            }
            if (opportunity.trigger !== undefined && !isRecord(opportunity.trigger)) {
              add(`${opportunityPath}.trigger`, 'invalid_type', 'opportunity.trigger must be an object.');
            } else if (isRecord(opportunity.trigger)) {
              const trigger = opportunity.trigger;
              validateIdArray(trigger.actorIds, `${opportunityPath}.trigger.actorIds`, add);
              for (const actorId of Array.isArray(trigger.actorIds) ? trigger.actorIds : []) {
                if (typeof actorId === 'string' && !characterIds.has(actorId)) {
                  add(`${opportunityPath}.trigger.actorIds`, 'unknown_reference', `Unknown opportunity actor "${actorId}".`);
                }
              }
              validateIdArray(trigger.actionIds, `${opportunityPath}.trigger.actionIds`, add);
              const knownActions = new Set(NPC_ACTION_LIBRARY.map(item => item.id));
              for (const actionId of Array.isArray(trigger.actionIds) ? trigger.actionIds : []) {
                if (typeof actionId === 'string' && !knownActions.has(actionId)) {
                  add(`${opportunityPath}.trigger.actionIds`, 'unknown_action', `Unknown opportunity action "${actionId}".`);
                }
              }
              validateIdArray(trigger.knowledgeFactIds, `${opportunityPath}.trigger.knowledgeFactIds`, add);
              const worldActor = entity.worldActor as Record<string, unknown>;
              const decisionCore = worldActor.decisionCore;
              const facts = isRecord(decisionCore)
                && isRecord(decisionCore.knowledgeFacts)
                ? new Set(Object.keys(decisionCore.knowledgeFacts))
                : new Set<string>();
              for (const factId of Array.isArray(trigger.knowledgeFactIds) ? trigger.knowledgeFactIds : []) {
                if (typeof factId === 'string' && !facts.has(factId)) {
                  add(`${opportunityPath}.trigger.knowledgeFactIds`, 'unknown_knowledge', `Unknown opportunity knowledge "${factId}".`);
                }
              }
              if (!['actorIds', 'actionIds', 'knowledgeFactIds'].some(key =>
                Array.isArray(trigger[key]) && (trigger[key] as unknown[]).length > 0
              )) {
                add(`${opportunityPath}.trigger`, 'empty_trigger', 'Opportunity trigger needs at least one actor, action, or knowledge fact.');
              }
            }
          });
        }
      }
    });
    validateEntityArray(scenario.chapters, 'scenario.chapters', chapterIds, add, entity => {
      requireString(entity.title, `${entity.__path}.title`, add);
      requireString(entity.summary, `${entity.__path}.summary`, add);
      validateConditions(entity.activation, `${entity.__path}.activation`, add);
      validateConditions(entity.completion, `${entity.__path}.completion`, add);
      validateIdArray(entity.eventIds, `${entity.__path}.eventIds`, add);
    }, false);
    if (scenario.worldSimulation !== undefined) {
      const wsPath = 'scenario.worldSimulation';
      if (!isRecord(scenario.worldSimulation)) {
        add(wsPath, 'invalid_type', 'worldSimulation must be an object.');
      } else {
        const ws = scenario.worldSimulation;
        if (ws.version !== 1) add(`${wsPath}.version`, 'unsupported_version', 'worldSimulation.version must be 1.');
        const situationIds = new Set<string>();
        const anchorIds = new Set<string>();
        const outcomeIds = new Set<string>();
        const referenceIds = new Set<string>();
        const collectId = (value: unknown, path: string, target: Set<string>) => {
          if (!validateId(value, path, add)) return;
          const id = String(value);
          if (target.has(id)) add(path, 'duplicate_id', `Duplicate world simulation id "${id}".`);
          target.add(id);
        };
        const validateWorldConditions = (value: unknown, path: string, required = false) => {
          if (required && (!Array.isArray(value) || value.length < 1)) {
            add(path, 'required_array', `${path} must contain at least one flags condition.`);
          }
          validateConditions(value, path, add);
          if (!Array.isArray(value)) return;
          value.forEach((condition, index) => {
            if (isRecord(condition) && typeof condition.path === 'string' && !condition.path.startsWith('flags.')) {
              add(`${path}[${index}].path`, 'invalid_path', 'World simulation conditions may only read flags.* engine state.');
            }
          });
        };
        const validateConditionGroups = (value: unknown, path: string) => {
          if (!Array.isArray(value) || value.length < 1) {
            add(path, 'required_array', `${path} must contain at least one condition group.`);
            return;
          }
          value.forEach((group, index) => {
            if (!Array.isArray(group) || group.length < 1) add(`${path}[${index}]`, 'required_array', 'Condition group cannot be empty.');
            else validateWorldConditions(group, `${path}[${index}]`, true);
          });
        };
        forEachRecord(ws.situations, `${wsPath}.situations`, (situation, path) => {
          collectId(situation.id, `${path}.id`, situationIds);
          requireString(situation.title, `${path}.title`, add);
          requireString(situation.summary, `${path}.summary`, add);
          if (validateId(situation.sourceEventId, `${path}.sourceEventId`, add)
            && !eventIds.has(String(situation.sourceEventId))) {
            add(`${path}.sourceEventId`, 'unknown_reference', `Unknown source event "${situation.sourceEventId}".`);
          }
          validateConditionGroups(situation.settledWhenAny, `${path}.settledWhenAny`);
          validateIdArray(situation.anchorIds, `${path}.anchorIds`, add);
          validateIdArray(situation.outcomeIds, `${path}.outcomeIds`, add);
          if (situation.omen !== undefined) {
            validateWorldOmen(situation.omen, `${path}.omen`, add, characterIds, omenIds);
            if (isRecord(situation.omen) && typeof situation.omen.afterTurns === 'number') {
              const sourceEvent = Array.isArray(scenario.events)
                ? scenario.events.find(event => isRecord(event) && event.id === situation.sourceEventId)
                : undefined;
              const deadline = isRecord(sourceEvent) && isRecord(sourceEvent.timeline)
                ? sourceEvent.timeline.deadlineTurns
                : undefined;
              const stallLimit = isRecord(sourceEvent) && isRecord(sourceEvent.offscreenResolution)
                ? sourceEvent.offscreenResolution.afterStallTurns
                : undefined;
              if (typeof deadline === 'number' && situation.omen.afterTurns >= deadline) {
                add(`${path}.omen.afterTurns`, 'invalid_range', 'omen.afterTurns must precede the source event deadlineTurns.');
              } else if (
                typeof deadline !== 'number'
                && typeof stallLimit === 'number'
                && situation.omen.afterTurns >= stallLimit
              ) {
                add(`${path}.omen.afterTurns`, 'invalid_range', 'omen.afterTurns must precede the source event afterStallTurns.');
              }
            }
          }
        });
        forEachRecord(ws.structuralAnchors, `${wsPath}.structuralAnchors`, (anchor, path) => {
          collectId(anchor.id, `${path}.id`, anchorIds);
          requireString(anchor.summary, `${path}.summary`, add);
          validateIdArray(anchor.sourceEventIds, `${path}.sourceEventIds`, add);
          for (const eventId of Array.isArray(anchor.sourceEventIds) ? anchor.sourceEventIds : []) {
            if (typeof eventId === 'string' && !eventIds.has(eventId)) add(`${path}.sourceEventIds`, 'unknown_reference', `Unknown source event "${eventId}".`);
          }
          validateConditionGroups(anchor.satisfiedWhenAny, `${path}.satisfiedWhenAny`);
        });
        forEachRecord(ws.forkableOutcomes, `${wsPath}.forkableOutcomes`, (outcome, path) => {
          collectId(outcome.id, `${path}.id`, outcomeIds);
          const sourceValid = validateId(outcome.sourceEventId, `${path}.sourceEventId`, add);
          if (sourceValid && !eventIds.has(String(outcome.sourceEventId))) add(`${path}.sourceEventId`, 'unknown_reference', `Unknown source event "${outcome.sourceEventId}".`);
          const resolutionValid = validateId(outcome.defaultResolutionId, `${path}.defaultResolutionId`, add);
          if (sourceValid && resolutionValid && Array.isArray(scenario.events)) {
            const sourceEvent = scenario.events.find(event => isRecord(event) && event.id === outcome.sourceEventId);
            const resolution = isRecord(sourceEvent) && isRecord(sourceEvent.offscreenResolution)
              ? sourceEvent.offscreenResolution
              : undefined;
            if (!resolution || resolution.id !== outcome.defaultResolutionId) {
              add(`${path}.defaultResolutionId`, 'unknown_reference', 'Forkable defaultResolutionId must match the source event offscreenResolution.id.');
            }
          }
          validateWorldConditions(outcome.defaultWhen, `${path}.defaultWhen`, true);
          requireString(outcome.defaultSummary, `${path}.defaultSummary`, add);
          validateIdArray(outcome.preserveAnchorIds, `${path}.preserveAnchorIds`, add);
          if (!Array.isArray(outcome.replacementBranches) || outcome.replacementBranches.length < 1) {
            add(`${path}.replacementBranches`, 'required_array', 'A forkable outcome needs at least one reviewed branch.');
          }
          forEachRecord(outcome.replacementBranches, `${path}.replacementBranches`, (branch, branchPath) => {
            validateId(branch.branchId, `${branchPath}.branchId`, add);
            validateWorldConditions(branch.activeWhen, `${branchPath}.activeWhen`, true);
            requireString(branch.summary, `${branchPath}.summary`, add);
            if (!isRecord(branch.intervention)) {
              add(`${branchPath}.intervention`, 'required_object', 'A replacement branch needs a local intervention contract.');
              return;
            }
            const intervention = branch.intervention;
            validateId(intervention.id, `${branchPath}.intervention.id`, add);
            requireString(intervention.label, `${branchPath}.intervention.label`, add);
            requireString(intervention.actionText, `${branchPath}.intervention.actionText`, add);
            if (!['combat', 'cultivate'].includes(String(intervention.kind))) add(`${branchPath}.intervention.kind`, 'invalid_enum', 'Intervention kind must be combat or cultivate.');
            if (!['hard', 'severe', 'extreme'].includes(String(intervention.difficulty))) add(`${branchPath}.intervention.difficulty`, 'invalid_enum', 'Intervention difficulty must be hard, severe, or extreme.');
            if (typeof intervention.difficultyValue !== 'number' || !Number.isFinite(intervention.difficultyValue) || intervention.difficultyValue < 1) add(`${branchPath}.intervention.difficultyValue`, 'invalid_range', 'Intervention difficultyValue must be positive.');
            validateStringArray(intervention.matchAny, `${branchPath}.intervention.matchAny`, add);
            validateStringArray(intervention.rejectIf, `${branchPath}.intervention.rejectIf`, add);
            if (!Array.isArray(intervention.matchAny) || intervention.matchAny.length < 1) add(`${branchPath}.intervention.matchAny`, 'required_array', 'Intervention requires at least one local action matcher.');
            if (!Array.isArray(intervention.successOutcomes) || intervention.successOutcomes.length < 1
              || intervention.successOutcomes.some(value => !['success', 'great_success', 'perfect'].includes(String(value)))) {
              add(`${branchPath}.intervention.successOutcomes`, 'invalid_enum', 'Intervention successOutcomes may only contain success, great_success, and perfect.');
            }
            if (!isRecord(intervention.characterState)) add(`${branchPath}.intervention.characterState`, 'required_object', 'Intervention requires a character state receipt.');
            else {
              if (validateId(intervention.characterState.characterId, `${branchPath}.intervention.characterState.characterId`, add)
                && !characterIds.has(String(intervention.characterState.characterId))) add(`${branchPath}.intervention.characterState.characterId`, 'unknown_reference', `Unknown character "${intervention.characterState.characterId}".`);
              if (!['alive', 'longrest', 'incapacitated'].includes(String(intervention.characterState.status))) add(`${branchPath}.intervention.characterState.status`, 'invalid_enum', 'Intervention character status is not branch-safe.');
              if (
                typeof outcome.sourceEventId === 'string'
                && typeof branch.branchId === 'string'
                && typeof intervention.characterState.characterId === 'string'
                && typeof intervention.characterState.status === 'string'
                && resolveReconcileBranchId({
                  id: outcome.sourceEventId,
                  verdict: 'void',
                  evidence: 'validator',
                  worldDelta: 'validator',
                  characterStates: { [intervention.characterState.characterId]: intervention.characterState.status },
                }) !== branch.branchId
              ) {
                add(`${branchPath}.branchId`, 'unknown_reference', 'Replacement branch is not backed by the existing deterministic IF registry for this event and character state.');
              }
            }
            requireString(intervention.worldDelta, `${branchPath}.intervention.worldDelta`, add);
            requireString(intervention.evidence, `${branchPath}.intervention.evidence`, add);
          });
        });
        forEachRecord(ws.referenceBeats, `${wsPath}.referenceBeats`, (beat, path) => {
          collectId(beat.id, `${path}.id`, referenceIds);
          validateId(beat.sourceEventId, `${path}.sourceEventId`, add);
          validateId(beat.situationId, `${path}.situationId`, add);
          validateWorldConditions(beat.availableWhen, `${path}.availableWhen`, true);
          validateWorldConditions(beat.invalidWhen, `${path}.invalidWhen`);
          requireString(beat.summary, `${path}.summary`, add);
        });
        forEachRecord(ws.situations, `${wsPath}.situations`, (situation, path) => {
          for (const id of Array.isArray(situation.anchorIds) ? situation.anchorIds : []) if (typeof id === 'string' && !anchorIds.has(id)) add(`${path}.anchorIds`, 'unknown_reference', `Unknown structural anchor "${id}".`);
          for (const id of Array.isArray(situation.outcomeIds) ? situation.outcomeIds : []) if (typeof id === 'string' && !outcomeIds.has(id)) add(`${path}.outcomeIds`, 'unknown_reference', `Unknown forkable outcome "${id}".`);
        });
        forEachRecord(ws.forkableOutcomes, `${wsPath}.forkableOutcomes`, (outcome, path) => {
          for (const id of Array.isArray(outcome.preserveAnchorIds) ? outcome.preserveAnchorIds : []) if (typeof id === 'string' && !anchorIds.has(id)) add(`${path}.preserveAnchorIds`, 'unknown_reference', `Unknown structural anchor "${id}".`);
        });
        forEachRecord(ws.referenceBeats, `${wsPath}.referenceBeats`, (beat, path) => {
          if (typeof beat.sourceEventId === 'string' && !eventIds.has(beat.sourceEventId)) add(`${path}.sourceEventId`, 'unknown_reference', `Unknown source event "${beat.sourceEventId}".`);
          if (typeof beat.situationId === 'string' && !situationIds.has(beat.situationId)) add(`${path}.situationId`, 'unknown_reference', `Unknown situation "${beat.situationId}".`);
        });
      }
    }
  }

  const rules = input.rules;
  if (!isRecord(rules)) {
    add('rules', 'required_object', 'rules is required.');
  } else {
    if (rules.mode !== 'strict' && rules.mode !== 'expand') {
      add('rules.mode', 'invalid_enum', 'rules.mode must be strict or expand.');
    }
    if (rules.mode === 'expand' && isRecord(scenario) && scenario.worldSimulation !== undefined) {
      add('scenario.worldSimulation', 'mode_mismatch', 'worldSimulation is only supported by strict scenario mods.');
    }
    if (rules.lockedFields !== undefined) {
      if (!Array.isArray(rules.lockedFields)) {
        add('rules.lockedFields', 'invalid_type', 'lockedFields must be an array.');
      } else {
        rules.lockedFields.forEach((path, index) => {
          if (!validateScenarioPath(path)) {
            add(`rules.lockedFields[${index}]`, 'invalid_path', 'locked field path is invalid or unsafe.');
          }
        });
      }
    }
    if (rules.contentAccess !== undefined) {
      if (!Array.isArray(rules.contentAccess)) {
        add('rules.contentAccess', 'invalid_type', 'contentAccess must be an array.');
      } else {
        const configuredContentIds = new Set<string>();
        rules.contentAccess.forEach((entry, index) => {
          const path = `rules.contentAccess[${index}]`;
          if (!isRecord(entry)) {
            add(path, 'invalid_type', `${path} must be an object.`);
            return;
          }
          if (validateId(entry.contentId, `${path}.contentId`, add)) {
            if (configuredContentIds.has(entry.contentId)) {
              add(`${path}.contentId`, 'duplicate_content_access', `Duplicate content access rule for "${entry.contentId}".`);
            }
            configuredContentIds.add(entry.contentId);
          }
          if (entry.policy !== 'restricted' && entry.policy !== 'exclusive') {
            add(`${path}.policy`, 'invalid_enum', 'policy must be restricted or exclusive.');
          }
          validateIdArray(entry.allowedCharacterIds, `${path}.allowedCharacterIds`, add);
          if (entry.playerAllowed !== undefined && typeof entry.playerAllowed !== 'boolean') {
            add(`${path}.playerAllowed`, 'invalid_type', 'playerAllowed must be a boolean.');
          }

          const allowedIds = Array.isArray(entry.allowedCharacterIds)
            ? entry.allowedCharacterIds.filter((id): id is string => typeof id === 'string')
            : [];
          const playerCharacterId = isRecord(scenario) && isRecord(scenario.opening)
            ? scenario.opening.playerCharacterId
            : undefined;
          const identities = new Set(allowedIds);
          if (entry.playerAllowed === true && !(typeof playerCharacterId === 'string' && identities.has(playerCharacterId))) {
            identities.add('$independent_player');
          }
          if (identities.size === 0) {
            add(path, 'missing_content_holder', 'A content access rule must allow at least one character or the player.');
          }
          if (entry.policy === 'exclusive' && identities.size > 1) {
            add(path, 'invalid_exclusive_holders', 'An exclusive content rule must resolve to exactly one allowed identity.');
          }
        });
      }
    }
  }

  registerGlobalIds(globalIds, factionIds, 'canon.factions', add);
  registerGlobalIds(globalIds, locationIds, 'canon.locations', add);
  registerGlobalIds(globalIds, characterIds, 'canon.characters', add);
  registerGlobalIds(globalIds, skillIds, 'content.skills', add);
  registerGlobalIds(globalIds, techniqueIds, 'content.techniques', add);
  registerGlobalIds(globalIds, itemIds, 'content.items', add);
  registerGlobalIds(globalIds, eventIds, 'scenario.events', add);
  registerGlobalIds(globalIds, chapterIds, 'scenario.chapters', add);

  if (isRecord(canon)) {
    forEachRecord(canon.factions, 'canon.factions', (entity, path) => {
      checkRef(entity.headquartersLocationId, locationIds, `${path}.headquartersLocationId`, 'location', add);
    });
    forEachRecord(canon.locations, 'canon.locations', (entity, path) => {
      checkRef(entity.continentId, continentIds, `${path}.continentId`, 'continent', add);
      checkRef(entity.factionId, factionIds, `${path}.factionId`, 'faction', add);
    });
    forEachRecord(canon.characters, 'canon.characters', (entity, path) => {
      checkRef(entity.factionId, factionIds, `${path}.factionId`, 'faction', add);
      forEachRecord(entity.affiliations, `${path}.affiliations`, (affiliation, affiliationPath) => {
        checkRef(affiliation.factionId, factionIds, `${affiliationPath}.factionId`, 'faction', add);
      });
      checkRef(entity.locationId, locationIds, `${path}.locationId`, 'location', add);
      checkRefs(entity.skillIds, skillIds, `${path}.skillIds`, 'skill', add);
      checkRefs(entity.techniqueIds, techniqueIds, `${path}.techniqueIds`, 'technique', add);
      checkRefs(entity.itemIds, itemIds, `${path}.itemIds`, 'item', add);
    });
    forEachRecord(canon.playerRelationships, 'canon.playerRelationships', (entry, path) => {
      checkRef(entry.characterId, characterIds, `${path}.characterId`, 'character', add);
    });
    forEachRecord(canon.relationships, 'canon.relationships', (entry, path) => {
      checkRef(entry.fromCharacterId, characterIds, `${path}.fromCharacterId`, 'character', add);
      checkRef(entry.toCharacterId, characterIds, `${path}.toCharacterId`, 'character', add);
    });
    forEachRecord(canon.factionRelationships, 'canon.factionRelationships', (entry, path) => {
      checkRef(entry.fromFactionId, factionIds, `${path}.fromFactionId`, 'faction', add);
      checkRef(entry.toFactionId, factionIds, `${path}.toFactionId`, 'faction', add);
    });
  }
  if (isRecord(content)) {
    forEachRecord(content.techniques, 'content.techniques', (entity, path) => {
      checkRefs(entity.skillIds, skillIds, `${path}.skillIds`, 'skill', add);
    });
    forEachRecord(content.items, 'content.items', (entity, path) => {
      checkRefs(entity.skillIds, skillIds, `${path}.skillIds`, 'skill', add);
      checkRef(entity.techniqueId, techniqueIds, `${path}.techniqueId`, 'technique', add);
    });
  }
  if (isRecord(scenario)) {
    if (isRecord(scenario.opening)) {
      checkRef(scenario.opening.locationId, locationIds, 'scenario.opening.locationId', 'location', add);
      checkRef(scenario.opening.playerCharacterId, characterIds, 'scenario.opening.playerCharacterId', 'character', add);
      checkRefs(scenario.opening.featuredCharacterIds, characterIds, 'scenario.opening.featuredCharacterIds', 'character', add);
    }
    forEachRecord(scenario.initialPlayerKnowledge, 'scenario.initialPlayerKnowledge', (fact, path) => {
      const subjectIds = new Set([...characterIds, ...factionIds, ...eventIds]);
      checkRef(fact.subjectId, subjectIds, `${path}.subjectId`, 'knowledge subject', add);
      checkRef(fact.objectId, new Set([...characterIds, ...factionIds]), `${path}.objectId`, 'knowledge object', add);
      checkRef(fact.sourceEventId, eventIds, `${path}.sourceEventId`, 'event', add);
      if (isRecord(fact.source)) checkRef(fact.source.actorId, characterIds, `${path}.source.actorId`, 'character', add);
    });
    forEachRecord(scenario.initialNpcPrivateKnowledge, 'scenario.initialNpcPrivateKnowledge', (fact, path) => {
      checkRefs(fact.holderCharacterIds, characterIds, `${path}.holderCharacterIds`, 'character', add);
      checkRef(fact.subjectId, new Set([...characterIds, ...factionIds]), `${path}.subjectId`, 'knowledge subject', add);
      const localKnowledgeObjectIds = new Set([...characterIds, ...factionIds]);
      if (
        typeof fact.objectId === 'string'
        && !localKnowledgeObjectIds.has(fact.objectId)
        && getRegistryNamesById(fact.objectId).length === 0
      ) {
        add(`${path}.objectId`, 'missing_reference', `Unknown knowledge object id "${fact.objectId}".`);
      }
      checkRef(fact.sourceEventId, eventIds, `${path}.sourceEventId`, 'event', add);
      checkRef(fact.unlockAfterEventId, eventIds, `${path}.unlockAfterEventId`, 'event', add);
      if (isRecord(scenario.opening) && typeof scenario.opening.playerCharacterId === 'string') {
        for (const holderId of Array.isArray(fact.holderCharacterIds) ? fact.holderCharacterIds : []) {
          if (holderId === scenario.opening.playerCharacterId) {
            add(`${path}.holderCharacterIds`, 'invalid_holder', 'The player character belongs in playerKnowledge, not NPC private knowledge.');
          }
        }
      }
    });
    forEachRecord(scenario.events, 'scenario.events', (entity, path) => {
      checkRefs(entity.relatedCharacterIds, characterIds, `${path}.relatedCharacterIds`, 'character', add);
      checkRefs(entity.relatedFactionIds, factionIds, `${path}.relatedFactionIds`, 'faction', add);
      checkRef(entity.locationId, locationIds, `${path}.locationId`, 'location', add);
      if (isRecord(entity.playerCompletionContract)) {
        const actionIds = new Set(Array.isArray(entity.playerCompletionContract.actions)
          ? entity.playerCompletionContract.actions.filter(isRecord).map(action => action.id).filter((id): id is string => typeof id === 'string')
          : []);
        forEachRecord(entity.playerCompletionContract.actions, `${path}.playerCompletionContract.actions`, (action, actionPath) => {
          if (!isRecord(action.outcomeEffects)) return;
          for (const [outcome, effects] of Object.entries(action.outcomeEffects)) {
            if (!isRecord(effects)) continue;
            forEachRecord(effects.playerKnowledge, `${actionPath}.outcomeEffects.${outcome}.playerKnowledge`, (fact, factPath) => {
              checkRef(fact.subjectId, new Set([...characterIds, ...factionIds, ...eventIds]), `${factPath}.subjectId`, 'knowledge subject', add);
              checkRef(fact.objectId, new Set([...characterIds, ...factionIds]), `${factPath}.objectId`, 'knowledge object', add);
              if (isRecord(fact.source)) checkRef(fact.source.actorId, characterIds, `${factPath}.source.actorId`, 'character', add);
            });
            forEachRecord(effects.pathReceipts, `${actionPath}.outcomeEffects.${outcome}.pathReceipts`, (receipt, receiptPath) => {
              if (receipt.sourceEventId !== entity.id) {
                add(`${receiptPath}.sourceEventId`, 'invalid_reference', 'Path receipt sourceEventId must match its owning event.');
              }
              checkRef(receipt.choiceId, actionIds, `${receiptPath}.choiceId`, 'event action', add);
              checkRefs(receipt.consumeAtEventIds, eventIds, `${receiptPath}.consumeAtEventIds`, 'event', add);
              checkRef(receipt.expiresAfterEventId, eventIds, `${receiptPath}.expiresAfterEventId`, 'event', add);
            });
          }
        });
      }
      if (isRecord(entity.offscreenResolution)) {
        checkRefs(entity.offscreenResolution.resolvedEventIds, eventIds, `${path}.offscreenResolution.resolvedEventIds`, 'event', add);
      }
      if (isRecord(entity.worldActor)) {
        if (isRecord(entity.worldActor.pressure)) {
          checkRefs(entity.worldActor.pressure.factionIds, factionIds, `${path}.worldActor.pressure.factionIds`, 'faction', add);
        }
        forEachRecord(entity.worldActor.agendas, `${path}.worldActor.agendas`, (agenda, agendaPath) => {
          checkRef(agenda.characterId, characterIds, `${agendaPath}.characterId`, 'character', add);
        });
        if (isRecord(entity.worldActor.decisionCore)) {
          forEachRecord(entity.worldActor.decisionCore.actors, `${path}.worldActor.decisionCore.actors`, (actor, actorPath) => {
            checkRef(actor.characterId, characterIds, `${actorPath}.characterId`, 'character', add);
            if (isRecord(actor.identity)) checkRef(actor.identity.factionId, factionIds, `${actorPath}.identity.factionId`, 'faction', add);
          });
        }
        forEachRecord(entity.worldActor.opportunities, `${path}.worldActor.opportunities`, (opportunity, opportunityPath) => {
          checkRefs(opportunity.characterIds, characterIds, `${opportunityPath}.characterIds`, 'character', add);
        });
      }
    });
    forEachRecord(scenario.chapters, 'scenario.chapters', (entity, path) => {
      checkRefs(entity.eventIds, eventIds, `${path}.eventIds`, 'event', add);
    });
  }
  if (isRecord(rules) && Array.isArray(rules.contentAccess)) {
    const contentIds = new Set([...skillIds, ...techniqueIds, ...itemIds]);
    rules.contentAccess.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      checkRef(entry.contentId, contentIds, `rules.contentAccess[${index}].contentId`, 'content', add);
      checkRefs(entry.allowedCharacterIds, characterIds, `rules.contentAccess[${index}].allowedCharacterIds`, 'character', add);
    });
  }

  return issues.length === 0
    ? { valid: true, issues, value: input as unknown as ScenarioMod }
    : { valid: false, issues };
}

export function parseScenarioMod(input: unknown): ScenarioMod {
  const result = validateScenarioMod(input);
  if (result.valid && result.value) return result.value;
  const detail = result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n');
  throw new Error(`Invalid Scenario Mod:\n${detail}`);
}

type AddIssue = (path: string, code: string, message: string) => void;
type EntityRecord = Record<string, unknown> & { __path: string };

function validateNpcDecisionCore(
  value: unknown,
  path: string,
  characterIds: Set<string>,
  factionIds: Set<string>,
  locationIds: Set<string>,
  add: AddIssue,
): void {
  if (!isRecord(value)) {
    add(path, 'invalid_type', 'decisionCore must be an object.');
    return;
  }
  const knowledgeFactIds = new Set<string>();
  const knowledgeAccess = new Map<string, string>();
  if (value.knowledgeFacts !== undefined && !isRecord(value.knowledgeFacts)) {
    add(`${path}.knowledgeFacts`, 'invalid_type', 'decisionCore.knowledgeFacts must be an object.');
  } else if (isRecord(value.knowledgeFacts)) {
    for (const [factId, rawFact] of Object.entries(value.knowledgeFacts)) {
      const factPath = `${path}.knowledgeFacts.${factId}`;
      if (validateId(factId, factPath, add)) knowledgeFactIds.add(factId);
      if (!isRecord(rawFact)) {
        add(factPath, 'invalid_type', 'Knowledge fact must be an object.');
        continue;
      }
      requireString(rawFact.text, `${factPath}.text`, add);
      requireString(rawFact.evidence, `${factPath}.evidence`, add);
      if (!['public', 'restricted', 'secret'].includes(String(rawFact.access))) {
        add(`${factPath}.access`, 'invalid_enum', 'Knowledge access must be public, restricted, or secret.');
      } else {
        knowledgeAccess.set(factId, String(rawFact.access));
      }
    }
  }
  const coreActorIds = new Set(
    Array.isArray(value.actors)
      ? value.actors
        .filter(isRecord)
        .map(actor => actor.characterId)
        .filter((id): id is string => typeof id === 'string')
      : [],
  );
  const situation = value.situation;
  const whitelist = new Set<string>();
  if (!isRecord(situation)) {
    add(`${path}.situation`, 'required_object', 'decisionCore.situation is required.');
  } else {
    validateStringArray(situation.whitelist, `${path}.situation.whitelist`, add);
    for (const key of Array.isArray(situation.whitelist) ? situation.whitelist : []) {
      if (typeof key === 'string') whitelist.add(key);
    }
    if (!isRecord(situation.initialValues)) {
      add(`${path}.situation.initialValues`, 'required_object', 'situation.initialValues is required.');
    } else {
      for (const [key, initial] of Object.entries(situation.initialValues)) {
        if (!whitelist.has(key)) add(`${path}.situation.initialValues.${key}`, 'effect_not_whitelisted', 'Initial situation key must be declared in whitelist.');
        optionalNumber(initial, `${path}.situation.initialValues.${key}`, add);
      }
      for (const key of whitelist) {
        if (!(key in situation.initialValues)) add(`${path}.situation.initialValues.${key}`, 'missing_initial_value', 'Every whitelisted situation key needs an initial value.');
      }
    }
    if (situation.limits !== undefined && !isRecord(situation.limits)) {
      add(`${path}.situation.limits`, 'invalid_type', 'situation.limits must be an object.');
    } else if (isRecord(situation.limits)) {
      for (const [key, rawLimit] of Object.entries(situation.limits)) {
        if (!whitelist.has(key)) add(`${path}.situation.limits.${key}`, 'effect_not_whitelisted', 'Situation limit key must be declared in whitelist.');
        if (!isRecord(rawLimit)) {
          add(`${path}.situation.limits.${key}`, 'invalid_type', 'Situation limit must contain numeric min and max.');
          continue;
        }
        optionalNumber(rawLimit.min, `${path}.situation.limits.${key}.min`, add);
        optionalNumber(rawLimit.max, `${path}.situation.limits.${key}.max`, add);
        if (typeof rawLimit.min === 'number' && typeof rawLimit.max === 'number' && rawLimit.min >= rawLimit.max) {
          add(`${path}.situation.limits.${key}`, 'invalid_range', 'Situation limit min must be lower than max.');
        }
      }
    }
  }
  if (!isRecord(value.canonPolicy)) {
    add(`${path}.canonPolicy`, 'required_object', 'decisionCore.canonPolicy is required.');
  } else {
    validateStringArray(value.canonPolicy.invariant, `${path}.canonPolicy.invariant`, add);
    validateStringArray(value.canonPolicy.forbiddenBefore, `${path}.canonPolicy.forbiddenBefore`, add);
    validateStringArray(value.canonPolicy.processFreedom, `${path}.canonPolicy.processFreedom`, add);
  }
  if (typeof value.maxVisibleActions !== 'number' || ![1, 2, 3].includes(value.maxVisibleActions)) {
    add(`${path}.maxVisibleActions`, 'invalid_enum', 'maxVisibleActions must be 1, 2, or 3.');
  }
  if (value.narrativeGuard !== undefined) {
    if (!isRecord(value.narrativeGuard)) {
      add(`${path}.narrativeGuard`, 'invalid_type', 'narrativeGuard must be an object.');
    } else {
      validateStringArray(value.narrativeGuard.forbiddenTerms, `${path}.narrativeGuard.forbiddenTerms`, add);
      if (value.narrativeGuard.forbiddenAssociations !== undefined) {
        if (!Array.isArray(value.narrativeGuard.forbiddenAssociations)) {
          add(`${path}.narrativeGuard.forbiddenAssociations`, 'invalid_type', 'forbiddenAssociations must be an array.');
        } else {
          value.narrativeGuard.forbiddenAssociations.forEach((rawRule, index) => {
            const rulePath = `${path}.narrativeGuard.forbiddenAssociations[${index}]`;
            if (!isRecord(rawRule)) {
              add(rulePath, 'invalid_type', 'Forbidden association must be an object.');
              return;
            }
            validateStringArray(rawRule.subjects, `${rulePath}.subjects`, add);
            validateStringArray(rawRule.predicates, `${rulePath}.predicates`, add);
            optionalBoolean(rawRule.allowHypothetical, `${rulePath}.allowHypothetical`, add);
            if (!Array.isArray(rawRule.subjects) || rawRule.subjects.length === 0) {
              add(`${rulePath}.subjects`, 'required_array', 'Forbidden association requires at least one subject.');
            }
            if (!Array.isArray(rawRule.predicates) || rawRule.predicates.length === 0) {
              add(`${rulePath}.predicates`, 'required_array', 'Forbidden association requires at least one predicate.');
            }
            if (
              rawRule.maxDistance !== undefined
              && (
                typeof rawRule.maxDistance !== 'number'
                || !Number.isInteger(rawRule.maxDistance)
                || rawRule.maxDistance < 1
                || rawRule.maxDistance > 200
              )
            ) {
              add(`${rulePath}.maxDistance`, 'invalid_range', 'maxDistance must be an integer from 1 to 200.');
            }
          });
        }
      }
      if (
        value.narrativeGuard.rejectConcreteQuantities !== undefined
        && typeof value.narrativeGuard.rejectConcreteQuantities !== 'boolean'
      ) {
        add(`${path}.narrativeGuard.rejectConcreteQuantities`, 'invalid_type', 'rejectConcreteQuantities must be boolean.');
      }
      if (
        value.narrativeGuard.allowUnverifiedQuantities !== undefined
        && typeof value.narrativeGuard.allowUnverifiedQuantities !== 'boolean'
      ) {
        add(`${path}.narrativeGuard.allowUnverifiedQuantities`, 'invalid_type', 'allowUnverifiedQuantities must be boolean.');
      }
    }
  }

  const knownActions = new Set(NPC_ACTION_LIBRARY.map(item => item.id));
  const boundActions = new Set<string>();
  const bindingScopes: Array<{ actionId: string; actorIds?: string[] }> = [];
  if (!Array.isArray(value.actionBindings) || value.actionBindings.length === 0) {
    add(`${path}.actionBindings`, 'required_array', 'decisionCore.actionBindings must not be empty.');
  }
  forEachRecord(value.actionBindings, `${path}.actionBindings`, (binding, bindingPath) => {
    if (!validateId(binding.actionId, `${bindingPath}.actionId`, add)) return;
    if (!knownActions.has(binding.actionId as string)) add(`${bindingPath}.actionId`, 'unknown_action', 'actionId is not in the shared NPC action library.');
    boundActions.add(binding.actionId as string);
    validateIdArray(binding.actorIds, `${bindingPath}.actorIds`, add);
    const actorIds = Array.isArray(binding.actorIds)
      ? binding.actorIds.filter((item): item is string => typeof item === 'string')
      : undefined;
    for (const actorId of actorIds || []) {
      if (!characterIds.has(actorId)) add(`${bindingPath}.actorIds`, 'unknown_reference', `Unknown actor characterId "${actorId}".`);
    }
    if (typeof binding.actionId === 'string') {
      const overlaps = bindingScopes.some(previous =>
        previous.actionId === binding.actionId
        && (!previous.actorIds?.length || !actorIds?.length || previous.actorIds.some(id => actorIds.includes(id))));
      if (overlaps) add(bindingPath, 'duplicate_binding', 'An actor/action pair may have only one binding contract.');
      bindingScopes.push({ actionId: binding.actionId, actorIds });
    }
    for (const key of ['label', 'reason', 'visibleSignal', 'offscreenAction']) requireString(binding[key], `${bindingPath}.${key}`, add);
    validateStringArray(binding.knownFacts, `${bindingPath}.knownFacts`, add);
    validateIdArray(binding.knownFactIds, `${bindingPath}.knownFactIds`, add);
    validateIdArray(binding.requiresKnowledge, `${bindingPath}.requiresKnowledge`, add);
    for (const group of ['knownFactIds', 'requiresKnowledge']) {
      for (const factId of Array.isArray(binding[group]) ? binding[group] : []) {
        if (typeof factId === 'string' && !knowledgeFactIds.has(factId)) {
          add(`${bindingPath}.${group}`, 'unknown_knowledge', `Unknown knowledge fact "${factId}".`);
        }
      }
    }
    forEachRecord(binding.relationshipRequirements, `${bindingPath}.relationshipRequirements`, (requirement, requirementPath) => {
      validateId(requirement.targetCharacterId, `${requirementPath}.targetCharacterId`, add);
      if (typeof requirement.targetCharacterId === 'string' && !characterIds.has(requirement.targetCharacterId)) {
        add(`${requirementPath}.targetCharacterId`, 'unknown_reference', `Unknown relationship target "${requirement.targetCharacterId}".`);
      }
      requireString(requirement.dimension, `${requirementPath}.dimension`, add);
      optionalNumber(requirement.min, `${requirementPath}.min`, add);
      optionalNumber(requirement.max, `${requirementPath}.max`, add);
      validateAttitudeRange(requirement.min, `${requirementPath}.min`, add);
      validateAttitudeRange(requirement.max, `${requirementPath}.max`, add);
      if (requirement.min === undefined && requirement.max === undefined) {
        add(requirementPath, 'missing_threshold', 'Relationship requirement needs min or max.');
      }
      if (typeof requirement.min === 'number' && typeof requirement.max === 'number' && requirement.min > requirement.max) {
        add(requirementPath, 'invalid_range', 'Relationship requirement min must not exceed max.');
      }
    });
    validateStringArray(binding.mustNotInvent, `${bindingPath}.mustNotInvent`, add);
    if (!['public', 'rumor', 'hidden'].includes(String(binding.visibility))) add(`${bindingPath}.visibility`, 'invalid_enum', 'visibility must be public, rumor, or hidden.');
    if (binding.visibility !== 'hidden') {
      for (const factId of Array.isArray(binding.knownFactIds) ? binding.knownFactIds : []) {
        if (typeof factId === 'string' && knowledgeAccess.get(factId) === 'secret') {
          add(
            `${bindingPath}.knownFactIds`,
            'secret_knowledge_exposure',
            'Visible decisions must not project secret knowledge to the narrative renderer.',
          );
        }
      }
    }
    if (typeof binding.durationTurns !== 'number') {
      add(`${bindingPath}.durationTurns`, 'invalid_type', 'durationTurns must be a number.');
    } else if (binding.durationTurns < 1) {
      add(`${bindingPath}.durationTurns`, 'invalid_range', 'durationTurns must be at least 1.');
    }
    if (binding.interaction !== undefined && !isRecord(binding.interaction)) {
      add(`${bindingPath}.interaction`, 'invalid_type', 'interaction must be an object.');
    } else if (isRecord(binding.interaction)) {
      validateId(binding.interaction.domain, `${bindingPath}.interaction.domain`, add);
      if (!['advance', 'defend'].includes(String(binding.interaction.stance))) {
        add(`${bindingPath}.interaction.stance`, 'invalid_enum', 'interaction stance must be advance or defend.');
      }
      optionalNumber(binding.interaction.power, `${bindingPath}.interaction.power`, add);
      validateIdArray(binding.interaction.counters, `${bindingPath}.interaction.counters`, add);
      for (const actionId of Array.isArray(binding.interaction.counters) ? binding.interaction.counters : []) {
        if (typeof actionId === 'string' && !knownActions.has(actionId)) {
          add(`${bindingPath}.interaction.counters`, 'unknown_action', `Unknown counter action "${actionId}".`);
        }
      }
    }
    for (const numericGroup of ['requirements', 'costs']) {
      if (binding[numericGroup] !== undefined && !isRecord(binding[numericGroup])) {
        add(`${bindingPath}.${numericGroup}`, 'invalid_type', `${numericGroup} must be an object.`);
      } else if (isRecord(binding[numericGroup])) {
        for (const [key, amount] of Object.entries(binding[numericGroup])) optionalNumber(amount, `${bindingPath}.${numericGroup}.${key}`, add);
      }
    }
    if (binding.utility !== undefined && !isRecord(binding.utility)) {
      add(`${bindingPath}.utility`, 'invalid_type', 'utility must be an object.');
    } else if (isRecord(binding.utility)) {
      for (const key of ['urgency', 'factionGoal', 'expectedBenefit', 'failureRisk', 'escalation']) {
        optionalNumber(binding.utility[key], `${bindingPath}.utility.${key}`, add);
      }
      if (binding.utility.situation !== undefined && !isRecord(binding.utility.situation)) {
        add(`${bindingPath}.utility.situation`, 'invalid_type', 'utility.situation must be an object.');
      } else if (isRecord(binding.utility.situation)) {
        for (const [key, weight] of Object.entries(binding.utility.situation)) {
          optionalNumber(weight, `${bindingPath}.utility.situation.${key}`, add);
          if (!whitelist.has(key)) add(`${bindingPath}.utility.situation.${key}`, 'effect_not_whitelisted', 'Situation utility may only use this stage whitelist.');
        }
      }
      forEachRecord(binding.utility.relationships, `${bindingPath}.utility.relationships`, (relation, relationPath) => {
        validateId(relation.targetCharacterId, `${relationPath}.targetCharacterId`, add);
        if (typeof relation.targetCharacterId === 'string' && !characterIds.has(relation.targetCharacterId)) {
          add(`${relationPath}.targetCharacterId`, 'unknown_reference', `Unknown relationship target "${relation.targetCharacterId}".`);
        }
        requireString(relation.dimension, `${relationPath}.dimension`, add);
        optionalNumber(relation.weight, `${relationPath}.weight`, add);
      });
      forEachRecord(binding.utility.memories, `${bindingPath}.utility.memories`, (memory, memoryPath) => {
        requireString(memory.tag, `${memoryPath}.tag`, add);
        optionalNumber(memory.weight, `${memoryPath}.weight`, add);
      });
    }
    if (binding.effects !== undefined && !isRecord(binding.effects)) {
      add(`${bindingPath}.effects`, 'invalid_type', 'effects must be an object.');
    } else if (isRecord(binding.effects)) {
      for (const [key, delta] of Object.entries(binding.effects)) {
        optionalNumber(delta, `${bindingPath}.effects.${key}`, add);
        if (!whitelist.has(key)) add(`${bindingPath}.effects.${key}`, 'effect_not_whitelisted', 'NPC effects may only target this stage situation whitelist.');
      }
    }
    if (binding.stateEffects !== undefined && !isRecord(binding.stateEffects)) {
      add(`${bindingPath}.stateEffects`, 'invalid_type', 'stateEffects must be an object.');
    } else if (isRecord(binding.stateEffects)) {
      if (binding.stateEffects.resources !== undefined && !isRecord(binding.stateEffects.resources)) {
        add(`${bindingPath}.stateEffects.resources`, 'invalid_type', 'stateEffects.resources must be an object.');
      } else if (isRecord(binding.stateEffects.resources)) {
        for (const [resource, delta] of Object.entries(binding.stateEffects.resources)) {
          if (!['influence', 'wealth', 'troops', 'intelligence'].includes(resource)) {
            add(`${bindingPath}.stateEffects.resources.${resource}`, 'unknown_resource', `Unknown NPC resource "${resource}".`);
          }
          optionalNumber(delta, `${bindingPath}.stateEffects.resources.${resource}`, add);
        }
      }
      forEachRecord(binding.stateEffects.relationships, `${bindingPath}.stateEffects.relationships`, (relation, relationPath) => {
        if (relation.actorId !== undefined) {
          validateId(relation.actorId, `${relationPath}.actorId`, add);
          if (typeof relation.actorId === 'string' && !coreActorIds.has(relation.actorId)) {
            add(`${relationPath}.actorId`, 'unknown_reference', `Relationship effect actor "${relation.actorId}" is not active in this core.`);
          }
        }
        validateId(relation.targetCharacterId, `${relationPath}.targetCharacterId`, add);
        if (typeof relation.targetCharacterId === 'string' && !characterIds.has(relation.targetCharacterId)) {
          add(`${relationPath}.targetCharacterId`, 'unknown_reference', `Unknown relationship target "${relation.targetCharacterId}".`);
        }
        if (!isRecord(relation.deltas)) {
          add(`${relationPath}.deltas`, 'required_object', 'Relationship effect deltas are required.');
        } else {
          for (const [dimension, delta] of Object.entries(relation.deltas)) {
            optionalNumber(delta, `${relationPath}.deltas.${dimension}`, add);
            validateAttitudeRange(delta, `${relationPath}.deltas.${dimension}`, add);
          }
        }
      });
      forEachRecord(binding.stateEffects.knowledge, `${bindingPath}.stateEffects.knowledge`, (knowledge, knowledgePath) => {
        validateIdArray(knowledge.actorIds, `${knowledgePath}.actorIds`, add);
        for (const actorId of Array.isArray(knowledge.actorIds) ? knowledge.actorIds : []) {
          if (typeof actorId === 'string' && !coreActorIds.has(actorId)) {
            add(`${knowledgePath}.actorIds`, 'unknown_reference', `Knowledge effect actor "${actorId}" is not active in this core.`);
          }
        }
        validateIdArray(knowledge.add, `${knowledgePath}.add`, add);
        validateIdArray(knowledge.remove, `${knowledgePath}.remove`, add);
        if (!Array.isArray(knowledge.add) && !Array.isArray(knowledge.remove)) {
          add(knowledgePath, 'missing_effect', 'Knowledge effect needs add or remove.');
        }
        for (const factId of [
          ...(Array.isArray(knowledge.add) ? knowledge.add : []),
          ...(Array.isArray(knowledge.remove) ? knowledge.remove : []),
        ]) {
          if (typeof factId === 'string' && !knowledgeFactIds.has(factId)) {
            add(knowledgePath, 'unknown_knowledge', `Unknown knowledge fact "${factId}".`);
          }
        }
      });
    }
    validateStringArray(binding.canonTags, `${bindingPath}.canonTags`, add);
  });

  if (!Array.isArray(value.actors) || value.actors.length === 0) {
    add(`${path}.actors`, 'required_array', 'decisionCore.actors must not be empty.');
  }
  forEachRecord(value.actors, `${path}.actors`, (actor, actorPath) => {
    validateId(actor.characterId, `${actorPath}.characterId`, add);
    if (typeof actor.characterId === 'string' && !characterIds.has(actor.characterId)) {
      add(`${actorPath}.characterId`, 'unknown_reference', `Unknown actor characterId "${actor.characterId}".`);
    }
    if (!isRecord(actor.identity)) {
      add(`${actorPath}.identity`, 'required_object', 'actor.identity is required.');
    } else {
      validateId(actor.identity.factionId, `${actorPath}.identity.factionId`, add);
      optionalString(actor.identity.office, `${actorPath}.identity.office`, add);
      optionalNumber(actor.identity.rank, `${actorPath}.identity.rank`, add);
    }
    const evidence = isRecord(actor.evidence) ? actor.evidence : {};
    if (!isRecord(actor.evidence)) add(`${actorPath}.evidence`, 'required_object', 'actor.evidence is required.');
    const requireEvidence = (key: string) => {
      if (!isNonEmptyString(evidence[key])) add(`${actorPath}.evidence.${key}`, 'missing_canon_evidence', `Numeric field "${key}" requires canon evidence.`);
    };
    requireEvidence('identity.rank');
    for (const group of ['personality', 'motives', 'resources']) {
      if (!isRecord(actor[group])) {
        add(`${actorPath}.${group}`, 'required_object', `actor.${group} is required.`);
        continue;
      }
      for (const [key, amount] of Object.entries(actor[group])) {
        optionalNumber(amount, `${actorPath}.${group}.${key}`, add);
        requireEvidence(`${group}.${key}`);
      }
    }
    if (isRecord(actor.personality) && Object.keys(actor.personality).length > 4) {
      add(`${actorPath}.personality`, 'too_many_dimensions', 'NPC personality may use at most four dimensions.');
    }
    if (!isRecord(actor.relationships)) {
      add(`${actorPath}.relationships`, 'required_object', 'actor.relationships is required.');
    } else {
      for (const [targetId, relation] of Object.entries(actor.relationships)) {
        if (!characterIds.has(targetId)) {
          add(`${actorPath}.relationships.${targetId}`, 'unknown_reference', `Unknown relationship target "${targetId}".`);
        }
        if (!isRecord(relation)) {
          add(`${actorPath}.relationships.${targetId}`, 'invalid_type', 'relationship dimensions must be an object.');
          continue;
        }
        if (Object.keys(relation).length > 3) add(`${actorPath}.relationships.${targetId}`, 'too_many_dimensions', 'A relationship may use at most three dimensions.');
        for (const [dimension, amount] of Object.entries(relation)) {
          optionalNumber(amount, `${actorPath}.relationships.${targetId}.${dimension}`, add);
          validateAttitudeRange(amount, `${actorPath}.relationships.${targetId}.${dimension}`, add);
          requireEvidence(`relationships.${targetId}.${dimension}`);
        }
      }
    }
    validateStringArray(actor.knowledge, `${actorPath}.knowledge`, add);
    if (knowledgeFactIds.size) {
      for (const factId of Array.isArray(actor.knowledge) ? actor.knowledge : []) {
        if (typeof factId === 'string' && !knowledgeFactIds.has(factId)) {
          add(`${actorPath}.knowledge`, 'unknown_knowledge', `Unknown knowledge fact "${factId}".`);
        }
      }
    }
    validateIdArray(actor.allowedActionIds, `${actorPath}.allowedActionIds`, add);
    for (const actionId of Array.isArray(actor.allowedActionIds) ? actor.allowedActionIds : []) {
      if (typeof actionId === 'string' && !boundActions.has(actionId)) add(`${actorPath}.allowedActionIds`, 'unbound_action', `Allowed action "${actionId}" has no stage binding.`);
    }
    if (actor.wake !== undefined && !isRecord(actor.wake)) {
      add(`${actorPath}.wake`, 'invalid_type', 'actor.wake must be an object.');
    } else if (isRecord(actor.wake)) {
      const tiers = ['local_critical', 'faction', 'offscreen_critical', 'minor', 'group'];
      if (!tiers.includes(String(actor.wake.tier))) {
        add(`${actorPath}.wake.tier`, 'invalid_enum', 'wake tier must be local_critical, faction, offscreen_critical, minor, or group.');
      }
      if (
        actor.wake.cadenceTurns !== undefined
        && (
          typeof actor.wake.cadenceTurns !== 'number'
          || !Number.isInteger(actor.wake.cadenceTurns)
          || actor.wake.cadenceTurns < 2
          || actor.wake.cadenceTurns > 5
        )
      ) {
        add(`${actorPath}.wake.cadenceTurns`, 'invalid_range', 'wake cadenceTurns must be an integer from 2 to 5.');
      }
      if (
        ['faction', 'group'].includes(String(actor.wake.tier))
        && actor.wake.cadenceTurns === undefined
      ) {
        add(`${actorPath}.wake.cadenceTurns`, 'required_number', 'faction and group wake tiers require cadenceTurns.');
      }
      validateIdArray(actor.wake.locationIds, `${actorPath}.wake.locationIds`, add);
      for (const locationId of Array.isArray(actor.wake.locationIds) ? actor.wake.locationIds : []) {
        if (typeof locationId === 'string' && !locationIds.has(locationId)) {
          add(`${actorPath}.wake.locationIds`, 'unknown_reference', `Unknown wake location "${locationId}".`);
        }
      }
      validateIdArray(actor.wake.factionIds, `${actorPath}.wake.factionIds`, add);
      for (const factionId of Array.isArray(actor.wake.factionIds) ? actor.wake.factionIds : []) {
        if (typeof factionId === 'string' && !factionIds.has(factionId)) {
          add(`${actorPath}.wake.factionIds`, 'unknown_reference', `Unknown wake faction "${factionId}".`);
        }
      }
    }
    forEachRecord(actor.agendas, `${actorPath}.agendas`, (agenda, agendaPath) => {
      validateId(agenda.id, `${agendaPath}.id`, add);
      requireString(agenda.goal, `${agendaPath}.goal`, add);
      optionalNumber(agenda.clock, `${agendaPath}.clock`, add);
      validateStringArray(agenda.escalation, `${agendaPath}.escalation`, add);
      if (typeof agenda.id === 'string') requireEvidence(`agendas.${agenda.id}.clock`);
    });
  });
}

function validateWorldOmen(
  value: unknown,
  path: string,
  add: AddIssue,
  characterIds: Set<string>,
  omenIds?: Set<string>,
): void {
  if (!isRecord(value)) {
    add(path, 'invalid_type', 'omen must be an object.');
    return;
  }
  if (validateId(value.id, `${path}.id`, add) && omenIds) {
    const omenId = String(value.id);
    if (omenIds.has(omenId)) add(`${path}.id`, 'duplicate_id', `Duplicate omen id "${omenId}".`);
    omenIds.add(omenId);
  }
  if (typeof value.afterTurns !== 'number' || !Number.isInteger(value.afterTurns) || value.afterTurns < 0) {
    add(`${path}.afterTurns`, 'invalid_range', 'afterTurns must be a non-negative integer.');
  }
  if (!Array.isArray(value.observableFacts) || value.observableFacts.length < 1) {
    add(`${path}.observableFacts`, 'required_array', 'omen requires at least one observable fact.');
  } else {
    validateStringArray(value.observableFacts, `${path}.observableFacts`, add);
  }
  requireString(value.environmentFallback, `${path}.environmentFallback`, add);
  if (!isRecord(value.presentation)) {
    add(`${path}.presentation`, 'required_object', 'omen presentation is required.');
  } else {
    if (typeof value.presentation.title !== 'string' || !value.presentation.title.trim()) {
      add(`${path}.presentation.title`, 'required_string', 'omen presentation title is required.');
    }
    if (typeof value.presentation.text !== 'string' || !value.presentation.text.trim()) {
      add(`${path}.presentation.text`, 'required_string', 'omen presentation text is required.');
    }
  }
  const omenText = [
    ...(Array.isArray(value.observableFacts) ? value.observableFacts : []),
    value.environmentFallback,
    isRecord(value.presentation) ? value.presentation.title : '',
    isRecord(value.presentation) ? value.presentation.text : '',
  ].filter(item => typeof item === 'string').join('｜');
  if (/(机会卡|世界回合|最后\s*\d+\s*轮|剩余\s*\d+\s*回合|倒计时)/u.test(omenText)) {
    add(`${path}.presentation.text`, 'meta_language', 'Omen text cannot use meta UI terms such as remaining turns or opportunity cards.');
  }
  if (/(将死|必死|终将(死亡|身亡|登基)|注定(死亡|身亡|登基)|必然(死亡|身亡|登基)|必定(死|登基|身亡)|一定(死|身亡|登基)|已经身亡|已经登基)/u.test(omenText)) {
    add(`${path}.presentation.text`, 'spoiler_outcome', 'Omen text may only describe observable pressure, not a predetermined outcome.');
  }
  if (value.transmitters === undefined) return;
  if (!Array.isArray(value.transmitters)) {
    add(`${path}.transmitters`, 'invalid_type', 'transmitters must be an array.');
    return;
  }
  value.transmitters.forEach((transmitter, index) => {
    const transmitterPath = `${path}.transmitters[${index}]`;
    if (!isRecord(transmitter)) {
      add(transmitterPath, 'invalid_type', 'transmitter must be an object.');
      return;
    }
    if (!WORLD_OMEN_TRANSMITTER_KINDS.has(String(transmitter.kind))) {
      add(`${transmitterPath}.kind`, 'invalid_enum', 'transmitter kind must be related_npc, companion, messenger, or environment.');
    }
    if (transmitter.characterId !== undefined
      && validateId(transmitter.characterId, `${transmitterPath}.characterId`, add)
      && !characterIds.has(String(transmitter.characterId))) {
      add(`${transmitterPath}.characterId`, 'unknown_reference', `Unknown character "${transmitter.characterId}".`);
    }
  });
}

function requireString(value: unknown, path: string, add: AddIssue): void {
  if (!isNonEmptyString(value)) add(path, 'required_string', `${path} must be a non-empty string.`);
}

function optionalString(value: unknown, path: string, add: AddIssue): void {
  if (value !== undefined && !isNonEmptyString(value)) add(path, 'invalid_string', `${path} must be a non-empty string.`);
}

function optionalStringOrNull(value: unknown, path: string, add: AddIssue): void {
  if (value !== undefined && value !== null && !isNonEmptyString(value)) add(path, 'invalid_string', `${path} must be a non-empty string or null.`);
}

function optionalNumber(value: unknown, path: string, add: AddIssue): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
    add(path, 'invalid_number', `${path} must be a finite number.`);
  }
}

function validateAttitudeRange(value: unknown, path: string, add: AddIssue): void {
  if (typeof value === 'number' && Number.isFinite(value) && (value < -100 || value > 100)) {
    add(path, 'invalid_range', `${path} must stay within the NPC attitude range -100..100.`);
  }
}

function optionalNumberOrNull(value: unknown, path: string, add: AddIssue): void {
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    add(path, 'invalid_number', `${path} must be a finite number or null.`);
  }
}

function optionalBoolean(value: unknown, path: string, add: AddIssue): void {
  if (value !== undefined && typeof value !== 'boolean') {
    add(path, 'invalid_type', `${path} must be a boolean.`);
  }
}

function validateId(value: unknown, path: string, add: AddIssue): value is string {
  if (!isNonEmptyString(value) || !ID_PATTERN.test(value)) {
    add(path, 'invalid_id', `${path} must use lowercase letters, numbers, dot, dash or underscore.`);
    return false;
  }
  return true;
}

function optionalId(value: unknown, path: string, add: AddIssue): void {
  if (value !== undefined) validateId(value, path, add);
}

function validateStringArray(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  value.forEach((entry, index) => requireString(entry, `${path}[${index}]`, add));
}

function normalizeIntentPhrase(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

const EVENT_ACTION_JUDGEMENT_KINDS = new Set([
  'combat', 'cultivate', 'craft', 'explore', 'social', 'escape', 'stealth', 'scheme',
]);
const EVENT_ACTION_JUDGEMENT_DIFFICULTIES = new Set(['easy', 'normal', 'hard', 'severe', 'extreme']);
const EVENT_ACTION_JUDGEMENT_SUCCESS = new Set(['success', 'great_success', 'perfect']);

function validateEventActionJudgement(
  value: unknown,
  path: string,
  characterIds: Set<string>,
  add: AddIssue,
): void {
  if (!isRecord(value)) {
    add(path, 'invalid_type', 'Event action judgement must be an object.');
    return;
  }
  if (!EVENT_ACTION_JUDGEMENT_KINDS.has(String(value.kind))) {
    add(`${path}.kind`, 'invalid_enum', 'Event action judgement kind is invalid.');
  }
  if (!EVENT_ACTION_JUDGEMENT_DIFFICULTIES.has(String(value.difficulty))) {
    add(`${path}.difficulty`, 'invalid_enum', 'Event action judgement difficulty is invalid.');
  }
  if (typeof value.difficultyValue !== 'number' || !Number.isFinite(value.difficultyValue) || value.difficultyValue < 1) {
    add(`${path}.difficultyValue`, 'invalid_number', 'Event action judgement difficultyValue must be a positive number.');
  }
  if (value.target !== undefined) {
    if (validateId(value.target, `${path}.target`, add) && !characterIds.has(String(value.target))) {
      add(`${path}.target`, 'unknown_reference', `Unknown character "${value.target}".`);
    }
  }
  if (!Array.isArray(value.successOutcomes) || value.successOutcomes.length < 1
    || value.successOutcomes.some(outcome => !EVENT_ACTION_JUDGEMENT_SUCCESS.has(String(outcome)))) {
    add(`${path}.successOutcomes`, 'invalid_enum', 'successOutcomes must contain success, great_success, and/or perfect.');
  }
  if (value.applyCultivationRecovery !== undefined && typeof value.applyCultivationRecovery !== 'boolean') {
    add(`${path}.applyCultivationRecovery`, 'invalid_type', 'applyCultivationRecovery must be a boolean.');
  }
  if (value.spiritCost !== undefined) {
    if (!isRecord(value.spiritCost)) {
      add(`${path}.spiritCost`, 'invalid_type', 'spiritCost must be an object.');
    } else {
      for (const key of ['onResolveRatio', 'criticalFailureRatio'] as const) {
        const ratio = value.spiritCost[key];
        if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
          add(`${path}.spiritCost.${key}`, 'invalid_number', `${key} must be a ratio from 0 to 1.`);
        }
      }
    }
  }
  if (value.allyFactors !== undefined) {
    forEachRecord(value.allyFactors, `${path}.allyFactors`, (factor, factorPath) => {
      if (validateId(factor.characterId, `${factorPath}.characterId`, add)
        && !characterIds.has(String(factor.characterId))) {
        add(`${factorPath}.characterId`, 'unknown_reference', `Unknown character "${factor.characterId}".`);
      }
      requireString(factor.label, `${factorPath}.label`, add);
      if (typeof factor.value !== 'number' || !Number.isFinite(factor.value)) {
        add(`${factorPath}.value`, 'invalid_number', 'Ally factor value must be a number.');
      }
    });
  }
  if (value.receiptFactors !== undefined) {
    forEachRecord(value.receiptFactors, `${path}.receiptFactors`, (factor, factorPath) => {
      validateId(factor.eventId, `${factorPath}.eventId`, add);
      requireString(factor.actionId, `${factorPath}.actionId`, add);
      requireString(factor.label, `${factorPath}.label`, add);
      if (typeof factor.value !== 'number' || !Number.isFinite(factor.value)) {
        add(`${factorPath}.value`, 'invalid_number', 'Receipt factor value must be a number.');
      }
    });
  }
  if (value.whyNow !== undefined) requireString(value.whyNow, `${path}.whyNow`, add);
  if (value.stakes !== undefined) {
    if (!isRecord(value.stakes)) {
      add(`${path}.stakes`, 'invalid_type', 'stakes must be an object.');
    } else {
      for (const key of ['success', 'partial', 'failure'] as const) {
        requireString(value.stakes[key], `${path}.stakes.${key}`, add);
      }
    }
  }
}

function validateIntentMatch(value: unknown, path: string, add: AddIssue): void {
  if (!isRecord(value)) {
    add(path, 'invalid_type', `${path} must be an object.`);
    return;
  }
  const positive = new Set<string>();
  let hasPositive = false;
  for (const key of ['matchAny', 'matchAll'] as const) {
    const entries = value[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8) {
      add(`${path}.${key}`, 'invalid_range', `${path}.${key} must contain 1 to 8 phrases.`);
      continue;
    }
    hasPositive = true;
    const local = new Set<string>();
    entries.forEach((entry, index) => {
      const entryPath = `${path}.${key}[${index}]`;
      if (!isNonEmptyString(entry)) {
        add(entryPath, 'required_string', `${entryPath} must be a non-empty string.`);
        return;
      }
      const normalized = normalizeIntentPhrase(entry.trim());
      if (!normalized) {
        add(entryPath, 'invalid_string', `${entryPath} must contain letters or numbers.`);
      } else if (local.has(normalized) || positive.has(normalized)) {
        add(entryPath, 'duplicate_value', `Duplicate normalized intent phrase "${normalized}".`);
      }
      local.add(normalized);
      positive.add(normalized);
    });
  }
  if (!hasPositive) {
    add(path, 'required_matcher', 'intentMatch must declare matchAny and/or matchAll.');
  }
  const rejected = value.rejectIf;
  if (rejected !== undefined) {
    if (!Array.isArray(rejected) || rejected.length < 1 || rejected.length > 8) {
      add(`${path}.rejectIf`, 'invalid_range', `${path}.rejectIf must contain 1 to 8 phrases.`);
      return;
    }
    const local = new Set<string>();
    rejected.forEach((entry, index) => {
      const entryPath = `${path}.rejectIf[${index}]`;
      if (!isNonEmptyString(entry)) {
        add(entryPath, 'required_string', `${entryPath} must be a non-empty string.`);
        return;
      }
      const normalized = normalizeIntentPhrase(entry.trim());
      if (!normalized) {
        add(entryPath, 'invalid_string', `${entryPath} must contain letters or numbers.`);
      } else if (local.has(normalized)) {
        add(entryPath, 'duplicate_value', `Duplicate normalized intent phrase "${normalized}".`);
      } else if (positive.has(normalized)) {
        add(entryPath, 'conflicting_value', `Rejected intent phrase "${normalized}" duplicates a positive phrase.`);
      }
      local.add(normalized);
    });
  }
}

function validateIdArray(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  value.forEach((entry, index) => validateId(entry, `${path}[${index}]`, add));
}

function validateNumber(value: unknown, path: string, min: number, max: number, add: AddIssue): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    add(path, 'invalid_number', `${path} must be a number from ${min} to ${max}.`);
  }
}

function validatePoint(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'invalid_type', `${path} must be an object.`);
    return;
  }
  validateNumber(value.x, `${path}.x`, 0, 10000, add);
  validateNumber(value.y, `${path}.y`, 0, 10000, add);
}

function validatePointArray(value: unknown, path: string, add: AddIssue, minItems: number): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  if (value.length < minItems) {
    add(path, 'too_few_points', `${path} must contain at least ${minItems} points.`);
  }
  value.forEach((entry, index) => validatePoint(entry, `${path}[${index}]`, add));
}

function validateWorldMap(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'invalid_type', `${path} must be an object.`);
    return;
  }
  optionalId(value.atlasId, `${path}.atlasId`, add);
  if (value.locked !== undefined && typeof value.locked !== 'boolean') {
    add(`${path}.locked`, 'invalid_type', `${path}.locked must be a boolean.`);
  }
  optionalString(value.backgroundImage, `${path}.backgroundImage`, add);
  if (value.mapConfig !== undefined) {
    if (!isRecord(value.mapConfig)) {
      add(`${path}.mapConfig`, 'invalid_type', `${path}.mapConfig must be an object.`);
    } else {
      validateNumber(value.mapConfig.width, `${path}.mapConfig.width`, 1, Number.MAX_SAFE_INTEGER, add);
      validateNumber(value.mapConfig.height, `${path}.mapConfig.height`, 1, Number.MAX_SAFE_INTEGER, add);
      ['minLng', 'maxLng', 'minLat', 'maxLat'].forEach(key => {
        if ((value.mapConfig as Record<string, unknown>)[key] !== undefined) {
          validateNumber((value.mapConfig as Record<string, unknown>)[key], `${path}.mapConfig.${key}`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, add);
        }
      });
    }
  }
}

function validateCharacterProfile(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'invalid_type', `${path} must be an object.`);
    return;
  }
  optionalString(value.appearance, `${path}.appearance`, add);
  validateStringArray(value.personality, `${path}.personality`, add);
  optionalString(value.currentAppearance, `${path}.currentAppearance`, add);
  optionalString(value.currentThought, `${path}.currentThought`, add);
  validateStringArray(value.memories, `${path}.memories`, add);
  optionalString(value.race, `${path}.race`, add);
  optionalString(value.origin, `${path}.origin`, add);
  validateStringArray(value.notes, `${path}.notes`, add);
  optionalString(value.avatar, `${path}.avatar`, add);
  optionalString(value.portrait, `${path}.portrait`, add);
  if (value.spiritRoot !== undefined) {
    if (!isRecord(value.spiritRoot)) {
      add(`${path}.spiritRoot`, 'invalid_type', `${path}.spiritRoot must be an object.`);
    } else {
      requireString(value.spiritRoot.name, `${path}.spiritRoot.name`, add);
      optionalString(value.spiritRoot.tier, `${path}.spiritRoot.tier`, add);
      optionalString(value.spiritRoot.description, `${path}.spiritRoot.description`, add);
    }
  }
  if (value.talents !== undefined) {
    if (!Array.isArray(value.talents)) {
      add(`${path}.talents`, 'invalid_type', `${path}.talents must be an array.`);
    } else {
      value.talents.forEach((entry, index) => {
        const talentPath = `${path}.talents[${index}]`;
        if (!isRecord(entry)) {
          add(talentPath, 'invalid_type', `${talentPath} must be an object.`);
          return;
        }
        requireString(entry.name, `${talentPath}.name`, add);
        optionalString(entry.description, `${talentPath}.description`, add);
      });
    }
  }
  if (value.attributes !== undefined) {
    if (!isRecord(value.attributes)) {
      add(`${path}.attributes`, 'invalid_type', `${path}.attributes must be an object.`);
    } else {
      const attributes = value.attributes as Record<string, unknown>;
      ['rootBone', 'spirituality', 'comprehension', 'fortune', 'charm', 'temperament'].forEach(key => {
        if (attributes[key] !== undefined) validateInteger(attributes[key], `${path}.attributes.${key}`, 0, 10, add);
      });
    }
  }
}

function validateCharacterAffiliations(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  const entries = new Set<string>();
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      add(itemPath, 'invalid_type', `${itemPath} must be an object.`);
      return;
    }
    validateId(entry.factionId, `${itemPath}.factionId`, add);
    if (!['sect', 'military', 'state', 'clan', 'organization'].includes(String(entry.category))) {
      add(`${itemPath}.category`, 'invalid_enum', 'Affiliation category is invalid.');
    }
    optionalString(entry.role, `${itemPath}.role`, add);
    if (entry.exclusive !== undefined && typeof entry.exclusive !== 'boolean') {
      add(`${itemPath}.exclusive`, 'invalid_type', 'exclusive must be a boolean.');
    }
    const identity = `${String(entry.category)}:${String(entry.factionId)}`;
    if (entries.has(identity)) add(itemPath, 'duplicate_affiliation', `Duplicate affiliation "${identity}".`);
    entries.add(identity);
  });
}

function validateScore(value: unknown, path: string, add: AddIssue): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -100 || value > 100) {
    add(path, 'invalid_score', `${path} must be a number from -100 to 100.`);
  }
}

function validateCreationPreset(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'invalid_type', `${path} must be an object.`);
    return;
  }
  requireString(value.characterName, `${path}.characterName`, add);
  requireString(value.gender, `${path}.gender`, add);
  requireString(value.race, `${path}.race`, add);
  validateInteger(value.age, `${path}.age`, 1, 3000, add);
  validatePresetNamedEntry(value.talentTier, `${path}.talentTier`, add);
  validatePresetNamedEntry(value.origin, `${path}.origin`, add);
  validatePresetNamedEntry(value.spiritRoot, `${path}.spiritRoot`, add, true);
  if (!Array.isArray(value.talents) || value.talents.length === 0) {
    add(`${path}.talents`, 'required_array', `${path}.talents must contain at least one talent.`);
  } else {
    value.talents.forEach((entry, index) => validatePresetNamedEntry(entry, `${path}.talents[${index}]`, add));
  }
  if (!isRecord(value.attributes)) {
    add(`${path}.attributes`, 'required_object', `${path}.attributes must be an object.`);
  } else {
    const attributes = value.attributes as Record<string, unknown>;
    ['rootBone', 'spirituality', 'comprehension', 'fortune', 'charm', 'temperament'].forEach(key => {
      validateInteger(attributes[key], `${path}.attributes.${key}`, 0, 10, add);
    });
  }
  if (value.locked !== undefined && typeof value.locked !== 'boolean') {
    add(`${path}.locked`, 'invalid_type', `${path}.locked must be a boolean.`);
  }
}

function validatePresetNamedEntry(value: unknown, path: string, add: AddIssue, spiritRoot = false): void {
  if (!isRecord(value)) {
    add(path, 'required_object', `${path} must be an object.`);
    return;
  }
  requireString(value.name, `${path}.name`, add);
  requireString(value.description, `${path}.description`, add);
  if (spiritRoot) {
    requireString(value.tier, `${path}.tier`, add);
    validateStringArray(value.specialEffects, `${path}.specialEffects`, add);
  }
}

function validateInteger(value: unknown, path: string, min: number, max: number, add: AddIssue): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    add(path, 'invalid_number', `${path} must be an integer from ${min} to ${max}.`);
  }
}

function validatePlayerRelationships(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) return add(itemPath, 'invalid_type', `${itemPath} must be an object.`);
    if (validateId(entry.characterId, `${itemPath}.characterId`, add)) {
      if (seen.has(entry.characterId)) add(itemPath, 'duplicate_player_relationship', `Duplicate player relationship for "${entry.characterId}".`);
      seen.add(entry.characterId);
    }
    requireString(entry.relation, `${itemPath}.relation`, add);
    validateScore(entry.favorability, `${itemPath}.favorability`, add);
    validateStringArray(entry.memories, `${itemPath}.memories`, add);
  });
}

function validateCharacterRelationships(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) return add(itemPath, 'invalid_type', `${itemPath} must be an object.`);
    const fromValid = validateId(entry.fromCharacterId, `${itemPath}.fromCharacterId`, add);
    const toValid = validateId(entry.toCharacterId, `${itemPath}.toCharacterId`, add);
    if (fromValid && toValid) {
      if (entry.fromCharacterId === entry.toCharacterId) add(itemPath, 'self_relationship', 'A relationship cannot point to the same character.');
      const identity = `${entry.fromCharacterId}::${entry.toCharacterId}`;
      if (seen.has(identity)) add(itemPath, 'duplicate_relationship', `Duplicate relationship "${identity}".`);
      seen.add(identity);
    }
    requireString(entry.relation, `${itemPath}.relation`, add);
    validateScore(entry.score, `${itemPath}.score`, add);
    if (entry.direction !== undefined && entry.direction !== 'directed' && entry.direction !== 'bidirectional') {
      add(`${itemPath}.direction`, 'invalid_enum', 'direction must be directed or bidirectional.');
    }
    validateStringArray(entry.tags, `${itemPath}.tags`, add);
    validateStringArray(entry.events, `${itemPath}.events`, add);
  });
}

function validateFactionRelationships(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) return add(itemPath, 'invalid_type', `${itemPath} must be an object.`);
    const fromValid = validateId(entry.fromFactionId, `${itemPath}.fromFactionId`, add);
    const toValid = validateId(entry.toFactionId, `${itemPath}.toFactionId`, add);
    if (fromValid && toValid) {
      if (entry.fromFactionId === entry.toFactionId) add(itemPath, 'self_relationship', 'A faction relationship cannot point to the same faction.');
      const identity = `${entry.fromFactionId}::${entry.toFactionId}`;
      if (seen.has(identity)) add(itemPath, 'duplicate_relationship', `Duplicate faction relationship "${identity}".`);
      seen.add(identity);
    }
    requireString(entry.relation, `${itemPath}.relation`, add);
    validateScore(entry.score, `${itemPath}.score`, add);
    if (entry.direction !== undefined && entry.direction !== 'directed' && entry.direction !== 'bidirectional') {
      add(`${itemPath}.direction`, 'invalid_enum', 'direction must be directed or bidirectional.');
    }
    validateStringArray(entry.tags, `${itemPath}.tags`, add);
  });
}

function validateEntityArray(
  value: unknown,
  path: string,
  ids: Set<string>,
  add: AddIssue,
  validateExtra: (entity: EntityRecord) => void,
  requireName = true,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  value.forEach((entry, index) => {
    const entityPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      add(entityPath, 'invalid_type', `${entityPath} must be an object.`);
      return;
    }
    if (validateId(entry.id, `${entityPath}.id`, add)) {
      if (ids.has(entry.id)) add(`${entityPath}.id`, 'duplicate_id', `Duplicate id "${entry.id}".`);
      ids.add(entry.id);
    }
    if (requireName) requireString(entry.name, `${entityPath}.name`, add);
    validateExtra({ ...entry, __path: entityPath });
  });
}

function validateFlags(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'invalid_type', `${path} must be an object.`);
    return;
  }
  for (const [key, flag] of Object.entries(value)) {
    if (!ID_PATTERN.test(key)) add(`${path}.${key}`, 'invalid_id', 'Flag key is invalid.');
    if (flag !== null && !['string', 'number', 'boolean'].includes(typeof flag)) {
      add(`${path}.${key}`, 'invalid_flag', 'Flag values must be string, number, boolean or null.');
    }
  }
}

function validateConditions(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  value.forEach((condition, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(condition)) {
      add(itemPath, 'invalid_type', `${itemPath} must be an object.`);
      return;
    }
    if (!validateScenarioPath(condition.path)) add(`${itemPath}.path`, 'invalid_path', 'Condition path is invalid or unsafe.');
    if (!CONDITION_OPERATORS.has(String(condition.operator))) add(`${itemPath}.operator`, 'invalid_enum', 'Condition operator is invalid.');
    if (condition.operator !== 'exists' && !Object.prototype.hasOwnProperty.call(condition, 'value')) {
      add(`${itemPath}.value`, 'required_value', 'Condition value is required for this operator.');
    }
    const typed = condition as unknown as ScenarioCondition;
    if (typed.value !== undefined && typed.value !== null && !['string', 'number', 'boolean'].includes(typeof typed.value)) {
      add(`${itemPath}.value`, 'invalid_value', 'Condition value must be scalar.');
    }
  });
}

function registerGlobalIds(global: Map<string, string>, ids: Set<string>, path: string, add: AddIssue): void {
  for (const id of ids) {
    const previous = global.get(id);
    if (previous) add(path, 'duplicate_global_id', `ID "${id}" is already used in ${previous}.`);
    else global.set(id, path);
  }
}

function forEachRecord(
  value: unknown,
  basePath: string,
  callback: (entry: Record<string, unknown>, path: string) => void,
): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    if (isRecord(entry)) callback(entry, `${basePath}[${index}]`);
  });
}

function checkRef(value: unknown, ids: Set<string>, path: string, target: string, add: AddIssue): void {
  if (typeof value === 'string' && !ids.has(value)) add(path, 'missing_reference', `Unknown ${target} id "${value}".`);
}

function checkRefs(value: unknown, ids: Set<string>, path: string, target: string, add: AddIssue): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => checkRef(entry, ids, `${path}[${index}]`, target, add));
}
