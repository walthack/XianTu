import locations from '../../../mod-kit/entity-catalog/locations.json';
import { canonicalEntityId } from './namedEntities';

/** 地点总表的国别为权威，未知国别不猜、不改变子地点。 */
export function canonicalLocationCountry(id?: string): string | undefined {
  const canonical = id && canonicalEntityId('location', id);
  const entry = locations.entries.find(e => e.id === canonical);
  return (entry?.definition as { country?: string } | undefined)?.country;
}
export function normalizeLocationCountry(position: { locationId?: string; 描述?: string } | undefined): void {
  if (!position?.描述) return;
  const country = canonicalLocationCountry(position.locationId);
  const segments = position.描述.split('·');
  if (country && segments.length > 1) position.描述 = [country, ...segments.slice(1)].join('·');
}
