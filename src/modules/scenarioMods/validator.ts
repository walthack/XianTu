import {
  SCENARIO_MOD_SCHEMA,
  SCENARIO_MOD_VERSION,
  type ScenarioCondition,
  type ScenarioMod,
} from './schema';

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
    validateEntityArray(world.continents, 'world.continents', continentIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
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

  const canon = input.canon;
  if (canon !== undefined && !isRecord(canon)) {
    add('canon', 'invalid_type', 'canon must be an object.');
  } else if (isRecord(canon)) {
    validateEntityArray(canon.factions, 'canon.factions', factionIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.type, `${entity.__path}.type`, add);
      optionalId(entity.headquartersLocationId, `${entity.__path}.headquartersLocationId`, add);
    });
    validateEntityArray(canon.locations, 'canon.locations', locationIds, add, entity => {
      optionalString(entity.description, `${entity.__path}.description`, add);
      optionalString(entity.type, `${entity.__path}.type`, add);
      optionalId(entity.continentId, `${entity.__path}.continentId`, add);
      optionalId(entity.factionId, `${entity.__path}.factionId`, add);
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
    });
    validatePlayerRelationships(canon.playerRelationships, 'canon.playerRelationships', add);
    validateCharacterRelationships(canon.relationships, 'canon.relationships', add);
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
    validateEntityArray(scenario.events, 'scenario.events', eventIds, add, entity => {
      requireString(entity.description, `${entity.__path}.description`, add);
      validateConditions(entity.conditions, `${entity.__path}.conditions`, add);
      validateConditions(entity.completion, `${entity.__path}.completion`, add);
      validateIdArray(entity.relatedCharacterIds, `${entity.__path}.relatedCharacterIds`, add);
      validateIdArray(entity.relatedFactionIds, `${entity.__path}.relatedFactionIds`, add);
      optionalId(entity.locationId, `${entity.__path}.locationId`, add);
    });
    validateEntityArray(scenario.chapters, 'scenario.chapters', chapterIds, add, entity => {
      requireString(entity.title, `${entity.__path}.title`, add);
      requireString(entity.summary, `${entity.__path}.summary`, add);
      validateConditions(entity.activation, `${entity.__path}.activation`, add);
      validateConditions(entity.completion, `${entity.__path}.completion`, add);
      validateIdArray(entity.eventIds, `${entity.__path}.eventIds`, add);
    }, false);
  }

  const rules = input.rules;
  if (!isRecord(rules)) {
    add('rules', 'required_object', 'rules is required.');
  } else {
    if (rules.mode !== 'strict' && rules.mode !== 'expand') {
      add('rules.mode', 'invalid_enum', 'rules.mode must be strict or expand.');
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
    forEachRecord(scenario.events, 'scenario.events', (entity, path) => {
      checkRefs(entity.relatedCharacterIds, characterIds, `${path}.relatedCharacterIds`, 'character', add);
      checkRefs(entity.relatedFactionIds, factionIds, `${path}.relatedFactionIds`, 'faction', add);
      checkRef(entity.locationId, locationIds, `${path}.locationId`, 'location', add);
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

function requireString(value: unknown, path: string, add: AddIssue): void {
  if (!isNonEmptyString(value)) add(path, 'required_string', `${path} must be a non-empty string.`);
}

function optionalString(value: unknown, path: string, add: AddIssue): void {
  if (value !== undefined && !isNonEmptyString(value)) add(path, 'invalid_string', `${path} must be a non-empty string.`);
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

function validateIdArray(value: unknown, path: string, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(path, 'invalid_type', `${path} must be an array.`);
    return;
  }
  value.forEach((entry, index) => validateId(entry, `${path}[${index}]`, add));
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
