import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Who has seen or heard a promotion, for unique counts only. `subjectId` is a campaign (its unique viewers), a club
 * order (its unique listeners) or a single play (its audience); `viewerHash` is a keyed hash of the character id and
 * the subject, so it can't be reversed or linked across promotions. No other personal data is kept.
 */
@Entity('promotion_audience')
@Index('promotion_audience_created', ['createdAt'])
export class PromotionAudienceEntity {
  @PrimaryColumn({ type: 'uuid' })
  subjectId: string;

  @PrimaryColumn({ type: 'varchar', length: 24 })
  viewerHash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
