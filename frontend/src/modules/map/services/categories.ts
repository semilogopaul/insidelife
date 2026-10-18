import type { VenueType } from '@insidelife/shared';

export interface MapCategory {
  readonly label: string;
  readonly types: readonly VenueType[];
}

/** The Map's category chips. */
export const CATEGORIES: readonly MapCategory[] = [
  // The landmarks first: they're what the "now live" announcement points players to.
  { label: 'Must see', types: ['mansion', 'private-jet', 'refinery'] },
  { label: 'Food', types: ['buka', 'restaurant'] },
  { label: 'School', types: ['campus', 'cbt-centre', 'school'] },
  { label: 'Work', types: ['office', 'government'] },
  { label: 'Health', types: ['hospital-public', 'hospital-private', 'pharmacy'] },
  { label: 'Shopping', types: ['market', 'mall', 'car-dealer', 'salon'] },
  { label: 'Fun', types: ['bar', 'club', 'beach', 'park', 'cinema', 'event-centre', 'gym'] },
  { label: 'Hotels', types: ['hotel'] },
  {
    label: 'Services',
    types: ['estate-agency', 'airport', 'aviation-terminal', 'motor-park', 'church', 'mosque'],
  },
];
