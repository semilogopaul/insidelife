import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BACKGROUNDS, formatNaira } from '@insidelife/shared';
import { CREDENTIALS_PORT, type CredentialsPort } from '../../../common/ports/credentials.port.js';
import { FAMILY_PORT, type FamilyPort } from '../../../common/ports/family.port.js';
import type { SimulationSystem } from '../interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation-context.js';
import { SimulationRegistry } from '../simulation-registry.service.js';

/** Last birthday that still gets pocket money from the family. */
const ALLOWANCE_UNTIL_AGE = 22;

/** Monthly pocket money from parents, by birth-lottery background, until 22 or graduation. Unearned money. */
@Injectable()
export class AllowanceSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'allowance';
  readonly order = 20;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly modules: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const allowance = BACKGROUNDS[ctx.character.background].allowance;
    if (allowance <= 0 || ctx.age >= ALLOWANCE_UNTIL_AGE || ctx.character.generation > 1) return;
    if ((await this.hasGraduated(ctx)) || !(await this.parentAlive(ctx))) return;
    await ctx.wallet.receive(allowance, 'allowance', 'Pocket money from home', `allowance:${monthIndex}`, { income: 'unearned' });
    ctx.notify({
      kind: 'family',
      title: 'Alert! Pocket money landed',
      body: `Mummy sent ${formatNaira(allowance)}. “Spend it wisely o.”`,
      tone: 'good',
      amount: allowance,
    });
  }

  /** No parents, no pocket money. Family sits above the core, so its port is resolved lazily too. */
  private async parentAlive(ctx: SimulationContext): Promise<boolean> {
    let family: FamilyPort;
    try {
      family = this.modules.get<FamilyPort>(FAMILY_PORT, { strict: false });
    } catch {
      return true;
    }
    const { members } = await family.snapshot(ctx);
    const parents = members.filter((member) => member.relation === 'father' || member.relation === 'mother');
    return parents.length === 0 || parents.some((parent) => parent.alive);
  }

  /** Education sits above the simulation core, so its port is resolved lazily (no import cycle). */
  private async hasGraduated(ctx: SimulationContext): Promise<boolean> {
    let credentials: CredentialsPort;
    try {
      credentials = this.modules.get<CredentialsPort>(CREDENTIALS_PORT, { strict: false });
    } catch {
      return false;
    }
    const snapshot = await credentials.credentials(ctx);
    return snapshot.degrees.length > 0;
  }
}
