import { IsIn } from 'class-validator';
import { TOUR_OUTCOMES, type TourOutcome, type TourOutcomeRequest } from '@insidelife/shared';

export class TourOutcomeDto implements TourOutcomeRequest {
  @IsIn(TOUR_OUTCOMES)
  readonly outcome: TourOutcome;
}
