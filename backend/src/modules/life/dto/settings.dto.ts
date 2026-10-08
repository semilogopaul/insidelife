import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import {
  HABIT_ACTIONS,
  HABIT_DAYS,
  HABIT_EARLIEST_START,
  HABIT_LATEST_START,
  LIFESTYLE_TIERS,
  MAX_HABITS,
  TRANSPORT_MODES,
  type Habit,
  type HabitActionId,
  type HabitDays,
  type LifestyleTier,
  type TransportMode,
} from '@insidelife/shared';

export class HabitDto implements Habit {
  @IsIn(HABIT_ACTIONS)
  readonly actionId!: HabitActionId;

  @IsInt()
  @Min(HABIT_EARLIEST_START)
  @Max(HABIT_LATEST_START)
  readonly startMinute!: number;

  @IsInt()
  @Min(15)
  @Max(600)
  readonly durationMinutes!: number;

  @IsIn(HABIT_DAYS)
  readonly days!: HabitDays;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(LIFESTYLE_TIERS)
  readonly lifestyle?: LifestyleTier;

  @IsOptional()
  @IsIn(TRANSPORT_MODES)
  readonly defaultTransport?: TransportMode;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HABITS)
  @ValidateNested({ each: true })
  @Type(() => HabitDto)
  readonly habits?: HabitDto[];
}
