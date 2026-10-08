import { Injectable } from '@nestjs/common';
import type { LifeEventDefinition } from './interfaces/life-event.interface.js';

/** Domain modules register their life-event cards here in `onModuleInit`. */
@Injectable()
export class LifeEventsRegistry {
  private readonly definitions = new Map<string, LifeEventDefinition>();

  register(...definitions: readonly LifeEventDefinition[]): void {
    for (const definition of definitions) {
      if (this.definitions.has(definition.id)) throw new RangeError(`Life event "${definition.id}" registered twice`);
      if (!definition.choices.some((choice) => choice.id === definition.defaultChoiceId)) {
        throw new RangeError(`Life event "${definition.id}" default choice is missing`);
      }
      this.definitions.set(definition.id, definition);
    }
  }

  get(id: string): LifeEventDefinition | undefined {
    return this.definitions.get(id);
  }

  get all(): readonly LifeEventDefinition[] {
    return [...this.definitions.values()];
  }
}
