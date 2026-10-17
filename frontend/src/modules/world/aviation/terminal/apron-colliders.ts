import type { PropSpec } from '../../interiors/props/prop-types';
import type { InteriorTemplate } from '../../interiors/templates/types';
import { planeColliders, type ApronLayout } from './apron-layout';

/**
 * The template with the planes' fuselages and wing roots added as invisible boxes, for the walker's collisions only (the
 * apron draws the planes themselves). You can walk under the outer wings and round the nose and tail.
 */
export function withApronColliders(template: InteriorTemplate, layout: ApronLayout): InteriorTemplate {
  const planes = layout.own ? [layout.own, ...layout.others] : layout.others;
  const solid: PropSpec[] = planes.flatMap((plane) => planeColliders(plane).map((box): PropSpec => ({ kind: 'box', at: box.at, size: box.size, color: '#000000' })));
  return solid.length > 0 ? { ...template, props: [...template.props, ...solid] } : template;
}
