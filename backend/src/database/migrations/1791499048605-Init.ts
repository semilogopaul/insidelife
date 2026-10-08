import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Full schema (generated from the entities, plus hand-written expression indexes). */

export class Init1791499048605 implements MigrationInterface {
  name = 'Init1791499048605';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "family_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_id" uuid, "user_agent" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d5e27da0cd39bc3bb2811fc8ba" ON "refresh_tokens"  ("family_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "business_pnl" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "business_id" uuid NOT NULL, "character_id" uuid NOT NULL, "month_index" integer NOT NULL, "revenue" bigint NOT NULL, "costs" bigint NOT NULL, "event_costs" bigint NOT NULL, "tax" bigint NOT NULL, "profit" bigint NOT NULL, "owner_cash_flow" bigint NOT NULL, "debt_after" bigint NOT NULL, "notes" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b3ff7259c5e5c990ad674cb6cf9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "business_pnl_character_month" ON "business_pnl"  ("character_id", "month_index") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "business_pnl_business_month" ON "business_pnl"  ("business_id", "month_index") `,
    );
    await queryRunner.query(
      `CREATE TABLE "businesses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "type_id" character varying(32) NOT NULL, "name" character varying(40) NOT NULL, "district_id" character varying(24) NOT NULL, "units" integer NOT NULL DEFAULT '1', "invested_capital" bigint NOT NULL, "opened_at" bigint NOT NULL, "status" character varying(8) NOT NULL DEFAULT 'active', "closed_at" bigint, "debt" bigint NOT NULL DEFAULT '0', "management_minutes_month" integer NOT NULL DEFAULT '0', "consecutive_losses" integer NOT NULL DEFAULT '0', "traction" real NOT NULL DEFAULT '1', "event_modifier" real NOT NULL DEFAULT '1', "last_event_at" bigint, "event_costs" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bc1bf63498dd2368ce3dc8686e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "businesses_character_status" ON "businesses"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "employment_history" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "employment_id" uuid NOT NULL, "job_id" character varying(48) NOT NULL, "title" character varying(80) NOT NULL, "employer" character varying(80) NOT NULL, "final_level" integer NOT NULL, "started_at" bigint NOT NULL, "ended_at" bigint NOT NULL, "reason" character varying(16) NOT NULL, "total_earned" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_27b0c31619fc4a20f21a6d776a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_644534740d923f08b31824cea4" ON "employment_history"  ("employment_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "employment_history_character_ended" ON "employment_history"  ("character_id", "ended_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "employments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "job_id" character varying(48) NOT NULL, "level" integer NOT NULL DEFAULT '0', "started_at" bigint NOT NULL, "level_started_at" bigint NOT NULL, "performance" real NOT NULL DEFAULT '0.7', "goodwill" real NOT NULL DEFAULT '0', "pay_adjustment" real NOT NULL DEFAULT '1', "employer_override" character varying(80), "month_index" integer NOT NULL, "scheduled_minutes_month" integer NOT NULL DEFAULT '0', "worked_minutes_month" integer NOT NULL DEFAULT '0', "absent_minutes_month" integer NOT NULL DEFAULT '0', "late_minutes_month" integer NOT NULL DEFAULT '0', "scheduled_minutes_day" integer NOT NULL DEFAULT '0', "worked_minutes_day" integer NOT NULL DEFAULT '0', "late_minutes_day" integer NOT NULL DEFAULT '0', "strikes" real NOT NULL DEFAULT '0', "warnings" integer NOT NULL DEFAULT '0', "last_warning_at" bigint, "leave_from" bigint, "leave_until" bigint, "leave_year" integer NOT NULL, "leave_days_used" integer NOT NULL DEFAULT '0', "promotion_attempts" integer NOT NULL DEFAULT '0', "last_promotion_request_at" bigint, "promotion_notified_level" integer NOT NULL DEFAULT '-1', "licence_granted" boolean NOT NULL DEFAULT false, "total_earned" bigint NOT NULL DEFAULT '0', "last_payslip" jsonb, "held_payslip" jsonb, "salary_delay_days" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_208f1abe9b236e156e33f9eeb58" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "employments_one_per_character" ON "employments"  ("character_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "job_applications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "job_id" character varying(48) NOT NULL, "status" character varying(12) NOT NULL, "applied_at" bigint NOT NULL, "decide_at" bigint NOT NULL, "decided_at" bigint, "interview_bonus" real NOT NULL DEFAULT '0', "interview_card_dealt" boolean NOT NULL DEFAULT false, "message" character varying(240), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c56a5e86707d0f0df18fa111280" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "job_applications_character_job" ON "job_applications"  ("character_id", "job_id", "applied_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "job_applications_character_status" ON "job_applications"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "characters" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "handle" character varying(20) NOT NULL, "first_name" character varying(40) NOT NULL, "last_name" character varying(40) NOT NULL, "gender" character varying(8) NOT NULL, "state_of_origin" character varying(24) NOT NULL, "background" character varying(24) NOT NULL, "appearance" jsonb NOT NULL, "outfit" jsonb NOT NULL DEFAULT '{}', "born_at" bigint NOT NULL, "alive" boolean NOT NULL DEFAULT true, "died_at" bigint, "cause_of_death" character varying(120), "generation" integer NOT NULL DEFAULT '1', "dynasty_id" uuid NOT NULL, "predecessor_id" uuid, "lifestyle" character varying(16) NOT NULL, "default_transport" character varying(8) NOT NULL DEFAULT 'danfo', "needs" jsonb NOT NULL, "health" real NOT NULL DEFAULT '80', "fitness" real NOT NULL DEFAULT '40', "skills" jsonb NOT NULL, "mood_modifiers" jsonb NOT NULL DEFAULT '[]', "status" integer NOT NULL DEFAULT '0', "connections" real NOT NULL DEFAULT '5', "location_id" character varying(64) NOT NULL, "region_id" character varying(16) NOT NULL DEFAULT 'lagos', "home_district_id" character varying(24) NOT NULL, "activity" jsonb, "travel" jsonb, "habits" jsonb NOT NULL DEFAULT '[]', "habits_paused_until" bigint, "habit_log" jsonb, "settled_at" bigint NOT NULL, "seed" character varying(32) NOT NULL, "earned_total" bigint NOT NULL DEFAULT '0', "unearned_total" bigint NOT NULL DEFAULT '0', "purchased_total" bigint NOT NULL DEFAULT '0', "net_worth" bigint NOT NULL DEFAULT '0', "last_active_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, CONSTRAINT "PK_9d731e05758f26b9315dac5e378" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_c6e648aeaab79e4213def02aba" ON "characters"  ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7af8d2d81b5d486b27b918da46" ON "characters"  ("handle") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ea3dd2760c6f278451f2b1c772" ON "characters"  ("dynasty_id") `);
    await queryRunner.query(
      `CREATE INDEX "characters_status_alive" ON "characters"  ("status") WHERE "alive" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX "characters_location_alive" ON "characters"  ("location_id") WHERE "alive" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX "characters_settle_queue" ON "characters"  ("alive", "settled_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "characters_one_living_per_user" ON "characters"  ("user_id") WHERE "alive" = true`,
    );
    await queryRunner.query(
      `CREATE TABLE "education_admission_applications" ("id" uuid NOT NULL, "character_id" uuid NOT NULL, "exam_registration_id" uuid, "institution_id" character varying(32) NOT NULL, "course_id" character varying(32) NOT NULL, "status" character varying(12) NOT NULL, "utme_score" integer, "entry_points" real, "screening_score" real NOT NULL, "aggregate" real, "cutoff" real NOT NULL, "catchment_bonus" real NOT NULL DEFAULT '0', "supplementary_list" boolean NOT NULL DEFAULT false, "fee_paid" bigint NOT NULL, "applied_at" bigint NOT NULL, "decision_at" bigint NOT NULL, "decided_at" bigint, "accept_by" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_df1b32bf71c994681f17dddf8b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "education_admission_applications_character_status" ON "education_admission_applications"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "education_certifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "code" character varying(32) NOT NULL, "score" real, "source" character varying(32) NOT NULL, "granted_at" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1f3f89277e2af198d618d33f7bf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "education_certifications_character_code" ON "education_certifications"  ("character_id", "code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "education_exam_registrations" ("id" uuid NOT NULL, "character_id" uuid NOT NULL, "kind" character varying(12) NOT NULL, "attempt" integer NOT NULL, "status" character varying(12) NOT NULL, "venue_id" character varying(64) NOT NULL, "registered_at" bigint NOT NULL, "earliest_sitting_at" bigint NOT NULL, "institution_id" character varying(32), "course_id" character varying(32), "prep_hours" real NOT NULL DEFAULT '0', "fee" bigint NOT NULL, "sitting_started_at" bigint, "written_at" bigint, "result_at" bigint, "score" integer, "gce_subjects" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e4d86febc33e8fa9fda5518119b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "education_exam_registrations_character_kind" ON "education_exam_registrations"  ("character_id", "kind", "registered_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "education_enrolments" ("id" uuid NOT NULL, "character_id" uuid NOT NULL, "application_id" uuid NOT NULL, "institution_id" character varying(32) NOT NULL, "course_id" character varying(32) NOT NULL, "status" character varying(12) NOT NULL, "level" integer NOT NULL DEFAULT '1', "session" integer NOT NULL DEFAULT '1', "semester" integer NOT NULL DEFAULT '1', "completed_semesters" integer NOT NULL DEFAULT '0', "extra_semesters" integer NOT NULL DEFAULT '0', "starts_at" bigint NOT NULL, "progress_minutes" bigint NOT NULL DEFAULT '0', "paused_minutes" bigint NOT NULL DEFAULT '0', "mastery" real NOT NULL DEFAULT '0', "lecture_minutes_scheduled" integer NOT NULL DEFAULT '0', "lecture_minutes_attended" integer NOT NULL DEFAULT '0', "semester_results" jsonb NOT NULL DEFAULT '[]', "cgpa" real, "fees_due" bigint NOT NULL DEFAULT '0', "fees_due_at" bigint, "fees_paid_sessions" integer NOT NULL DEFAULT '0', "sponsored_first_session" boolean NOT NULL DEFAULT false, "suspended_at" bigint, "on_strike" boolean NOT NULL DEFAULT false, "graduated_at" bigint, "degree_class" character varying(16), "ended_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a2bffd1a149b02caf218355679e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "education_enrolments_character_status" ON "education_enrolments"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "education_nysc_services" ("id" uuid NOT NULL, "character_id" uuid NOT NULL, "enrolment_id" uuid NOT NULL, "status" character varying(12) NOT NULL, "state_code" character varying(16), "ppa_venue_id" character varying(64), "ppa_stipend" bigint NOT NULL DEFAULT '0', "starts_at" bigint NOT NULL, "ends_at" bigint, "ppa_minutes_scheduled" integer NOT NULL DEFAULT '0', "ppa_minutes_attended" integer NOT NULL DEFAULT '0', "completed_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8cdccaf4a83b89e3fcc607844e2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "education_nysc_services_character" ON "education_nysc_services"  ("character_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "education_programme_enrolments" ("id" uuid NOT NULL, "character_id" uuid NOT NULL, "programme_id" character varying(32) NOT NULL, "status" character varying(12) NOT NULL, "fee_paid" bigint NOT NULL, "started_at" bigint NOT NULL, "ends_at" bigint NOT NULL, "prep_hours" real NOT NULL DEFAULT '0', "class_minutes_scheduled" integer NOT NULL DEFAULT '0', "class_minutes_attended" integer NOT NULL DEFAULT '0', "score" real, "completed_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4c73a5a1feca4dec39535d6b691" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "education_programme_enrolments_character_status" ON "education_programme_enrolments"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "education_waec_results" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "kind" character varying(8) NOT NULL, "sitting" integer NOT NULL, "subjects" jsonb NOT NULL, "credits" integer NOT NULL, "released_at" bigint NOT NULL, "registration_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_40b077a488801e5dc20f6673252" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "education_waec_results_character_sitting" ON "education_waec_results"  ("character_id", "sitting") `,
    );
    await queryRunner.query(
      `CREATE TABLE "family_triggers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "event_id" character varying(64) NOT NULL, "dedupe_key" character varying(120) NOT NULL, "params" jsonb NOT NULL DEFAULT '{}', "status" character varying(12) NOT NULL DEFAULT 'queued', "created_at_game" bigint NOT NULL, "delivered_at_game" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_340743d89c517eab155f4d101f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "family_triggers_dedupe" ON "family_triggers"  ("character_id", "dedupe_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "family_triggers_character_status" ON "family_triggers"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "family_marriages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "spouse_character_id" uuid, "spouse_person_id" uuid, "status" character varying(12) NOT NULL DEFAULT 'active', "married_at" bigint NOT NULL, "ended_at" bigint, "wedding_tier" character varying(12), "traditional" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a963f43317cc4aaf6f5763ea1a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "family_marriages_spouse_character" ON "family_marriages"  ("spouse_character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "family_marriages_character" ON "family_marriages"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "family_people" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "owner_character_id" uuid NOT NULL, "first_name" character varying(40) NOT NULL, "last_name" character varying(40) NOT NULL, "gender" character varying(8) NOT NULL, "born_at" bigint NOT NULL, "ethnicity" character varying(12) NOT NULL, "traits" jsonb NOT NULL DEFAULT '[]', "occupation" character varying(60), "monthly_income" bigint NOT NULL DEFAULT '0', "wealth" character varying(12) NOT NULL DEFAULT 'managing', "alive" boolean NOT NULL DEFAULT true, "deceased_at" bigint, "available" boolean NOT NULL DEFAULT true, "parent_person_ids" jsonb NOT NULL DEFAULT '[]', "parent_character_ids" jsonb NOT NULL DEFAULT '[]', "character_id" uuid, "guardian_character_id" uuid, "school_tier" character varying(16) NOT NULL DEFAULT 'none', "school_performance" real NOT NULL DEFAULT '0.5', "sent_home_term" integer, "milestones" jsonb NOT NULL DEFAULT '[]', "waec_credits" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b06ecbcf81c7be9f20bad845dcc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "family_people_guardian" ON "family_people"  ("guardian_character_id") `,
    );
    await queryRunner.query(`CREATE INDEX "family_people_owner" ON "family_people"  ("owner_character_id") `);
    await queryRunner.query(
      `CREATE TABLE "family_proposals" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "from_character_id" uuid NOT NULL, "to_character_id" uuid NOT NULL, "kind" character varying(12) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'pending', "message" character varying(140), "ring_value" bigint NOT NULL DEFAULT '0', "created_at_game" bigint NOT NULL, "responded_at_game" bigint, "proposer_synced" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5dcee9211b7eb83d502028c68a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "family_proposals_one_pending" ON "family_proposals"  ("from_character_id", "to_character_id", "kind") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "family_proposals_from" ON "family_proposals"  ("from_character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "family_proposals_to" ON "family_proposals"  ("to_character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "family_relationships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "person_id" uuid, "other_character_id" uuid, "kind" character varying(16) NOT NULL, "closeness" real NOT NULL DEFAULT '0', "romance" real NOT NULL DEFAULT '0', "since" bigint NOT NULL, "last_contact_at" bigint NOT NULL, "last_romance_at" bigint NOT NULL, "met_at" character varying(64), "flags" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fe48a493e1a946437fbae4e1a34" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "family_relationships_other" ON "family_relationships"  ("other_character_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "family_relationships_player" ON "family_relationships"  ("character_id", "other_character_id") WHERE "other_character_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "family_relationships_person" ON "family_relationships"  ("character_id", "person_id") WHERE "person_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "family_relationships_character" ON "family_relationships"  ("character_id", "kind") `,
    );
    await queryRunner.query(
      `CREATE TABLE "family_successions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "dynasty_id" uuid NOT NULL, "deceased_character_id" uuid NOT NULL, "deceased_name" character varying(82) NOT NULL, "generation" integer NOT NULL, "died_at" bigint NOT NULL, "cause_of_death" character varying(120), "heir_character_id" uuid, "heir_person_id" uuid, "heir_name" character varying(82), "aged_up" boolean NOT NULL DEFAULT false, "gross" bigint NOT NULL, "funeral" bigint NOT NULL, "funeral_tier" character varying(16) NOT NULL, "probate" bigint NOT NULL, "inherited" bigint NOT NULL, "created_at_game" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c6e12e24200019e418dec32f04d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4ff9955200a35171d11f948e07" ON "family_successions"  ("deceased_character_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "family_successions_user" ON "family_successions"  ("user_id", "created_at_game") `,
    );
    await queryRunner.query(
      `CREATE TABLE "life_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "event_id" character varying(64) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'pending', "params" jsonb NOT NULL DEFAULT '{}', "created_at_game" bigint NOT NULL, "expires_at_game" bigint NOT NULL, "choice_id" character varying(32), "outcome" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a80fe2651b1c3d0371feffcd030" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "life_events_character_event" ON "life_events"  ("character_id", "event_id", "created_at_game") `,
    );
    await queryRunner.query(
      `CREATE INDEX "life_events_character_status" ON "life_events"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "health_conditions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "condition_id" character varying(24) NOT NULL, "severity" character varying(10) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'active', "onset_at" bigint NOT NULL, "diagnosed" boolean NOT NULL DEFAULT false, "treated_at" bigint, "critical_since" bigint, "warnings_seen" integer NOT NULL DEFAULT '0', "managed_until" bigint, "resolved_at" bigint, "source" character varying(32) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_12b81475de97ee70b41ee2d6dc8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "health_conditions_character_status" ON "health_conditions"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "hmo_memberships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "plan_id" character varying(16) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'active', "started_at" bigint NOT NULL, "covered_from" bigint NOT NULL, "paid_through_month" integer NOT NULL, "cover_year" integer NOT NULL, "cover_used" bigint NOT NULL DEFAULT '0', "ended_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b274a6c37c4b4f5f13087b92238" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "hmo_memberships_character_status" ON "hmo_memberships"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "hospital_admissions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "venue_id" character varying(64) NOT NULL, "facility" character varying(20) NOT NULL, "condition_record_id" uuid, "pregnancy_id" uuid, "reason" character varying(120) NOT NULL, "admitted_at" bigint NOT NULL, "discharge_at" bigint NOT NULL, "daily_rate" bigint NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'admitted', "ended_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_13926d9c11e186f8487d9aaa570" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "hospital_admissions_character_status" ON "hospital_admissions"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "medical_records" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "kind" character varying(20) NOT NULL, "condition_id" character varying(24), "summary" character varying(240) NOT NULL, "cost" bigint NOT NULL DEFAULT '0', "venue_id" character varying(64), "game_minute" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c200c0b76638124b7ed51424823" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "medical_records_character_time" ON "medical_records"  ("character_id", "game_minute") `,
    );
    await queryRunner.query(
      `CREATE TABLE "health_profiles" ("character_id" uuid NOT NULL, "low_need_streak" integer NOT NULL DEFAULT '0', "stress_streak" integer NOT NULL DEFAULT '0', "protections" jsonb NOT NULL DEFAULT '{}', "last_drift" jsonb, "family_rescue_at" bigint, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2c1cf8cfdf19a015d76d551e72a" PRIMARY KEY ("character_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "pregnancies" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "carrier" character varying(8) NOT NULL, "partner_name" character varying(80) NOT NULL, "conceived_at" bigint NOT NULL, "due_at" bigint NOT NULL, "antenatal_visits" integer NOT NULL DEFAULT '0', "reminders_sent" integer NOT NULL DEFAULT '0', "risk_roll" real NOT NULL, "high_risk" boolean NOT NULL DEFAULT false, "planned_facility" character varying(20) NOT NULL DEFAULT 'hospital-public', "planned_venue_id" character varying(64), "status" character varying(12) NOT NULL DEFAULT 'ongoing', "delivered_at" bigint, "delivery_mode" character varying(12), "delivery_venue_id" character varying(64), "complications" boolean NOT NULL DEFAULT false, "condition_record_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3f6d6f7ffea27daa3168d1cfccd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "pregnancies_character_status" ON "pregnancies"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "housing_leases" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "listing_id" character varying(64) NOT NULL, "district_id" character varying(24) NOT NULL, "type_id" character varying(16) NOT NULL, "label" character varying(120) NOT NULL, "features" jsonb NOT NULL DEFAULT '[]', "annual_rent" bigint NOT NULL, "service_charge" bigint NOT NULL DEFAULT '0', "caution_deposit" bigint NOT NULL DEFAULT '0', "start_at" bigint NOT NULL, "end_at" bigint NOT NULL, "status" character varying(12) NOT NULL, "pending_increase" real NOT NULL DEFAULT '0', "renewal_decided_for" bigint, "renewal_years" integer NOT NULL DEFAULT '1', "non_renewing" boolean NOT NULL DEFAULT false, "non_renewing_reason" character varying(16), "grace_until" bigint, "evict_at" bigint, "flags" jsonb NOT NULL DEFAULT '{}', "ended_at" bigint, "end_reason" character varying(24), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7e63b00295c4b4bd1d9d35b0b17" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "housing_leases_character_status" ON "housing_leases"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "housing_property_sales" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "property_id" uuid NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'listed', "listed_at" bigint NOT NULL, "closes_at" bigint NOT NULL, "asking_price" bigint NOT NULL, "agent_rate" real NOT NULL, "sale_price" bigint, "proceeds" bigint, "closed_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9f11e796d5de7d5d57a20ee60a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "housing_property_sales_character_status" ON "housing_property_sales"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "housing_properties" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "district_id" character varying(24) NOT NULL, "label" character varying(120) NOT NULL, "plots" integer NOT NULL DEFAULT '1', "title" character varying(20) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'owned', "purchase_price" bigint NOT NULL, "cost_basis" bigint NOT NULL, "market_value" bigint NOT NULL, "last_appreciated_month" integer NOT NULL DEFAULT '-1', "value_history" jsonb NOT NULL DEFAULT '[]', "dispute" jsonb, "title_perfection" jsonb, "arrears" bigint NOT NULL DEFAULT '0', "acquired_at" bigint NOT NULL, "disposed_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c165b5ece74c977c2eb2fd8ff32" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "housing_properties_character_status" ON "housing_properties"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "housing_residences" ("character_id" uuid NOT NULL, "kind" character varying(8) NOT NULL, "lease_id" uuid, "building_id" uuid, "family_district_id" character varying(24) NOT NULL, "family_comfort" integer NOT NULL DEFAULT '0', "moved_in_at" bigint NOT NULL, "generator_dry_day" integer, "last_flood_day" integer, "security_until" bigint, "family_hints" integer NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ef607856a39fd1b15af71b5676d" PRIMARY KEY ("character_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "housing_buildings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "property_id" uuid NOT NULL, "character_id" uuid NOT NULL, "blueprint_id" character varying(24) NOT NULL, "status" character varying(20) NOT NULL, "payment_plan" character varying(12) NOT NULL, "budget" bigint NOT NULL, "cost_paid" bigint NOT NULL DEFAULT '0', "progress_days" real NOT NULL DEFAULT '0', "duration_days" integer NOT NULL, "milestones_paid" integer NOT NULL DEFAULT '0', "milestones" integer NOT NULL, "started_at" bigint NOT NULL, "completed_at" bigint, "stalled_since" bigint, "overrun" jsonb, "value" bigint NOT NULL DEFAULT '0', "condition" real NOT NULL DEFAULT '100', "owner_occupied" boolean NOT NULL DEFAULT false, "letting" boolean NOT NULL DEFAULT false, "units" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f22aa08a01ebdc27be5b7311f4f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "housing_buildings_property" ON "housing_buildings"  ("property_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "housing_buildings_character" ON "housing_buildings"  ("character_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_deposits" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "idempotency_key" character varying(96) NOT NULL, "product" character varying(16) NOT NULL, "principal" bigint NOT NULL, "annual_rate" numeric(8,6) NOT NULL, "tenor_days" integer, "started_at" bigint NOT NULL, "matures_at" bigint, "accrued" numeric(20,4) NOT NULL DEFAULT '0', "last_accrual_day" integer, "status" character varying(10) NOT NULL DEFAULT 'active', "closed_at" bigint, "interest_paid" bigint NOT NULL DEFAULT '0', "withholding_tax" bigint NOT NULL DEFAULT '0', "penalty" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_29ed7d3d1267047c32b860bd982" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "investment_deposits_character_key" ON "investment_deposits"  ("character_id", "idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "investment_deposits_character_status" ON "investment_deposits"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_savings_accruals" ("character_id" uuid NOT NULL, "accrued" numeric(20,4) NOT NULL DEFAULT '0', "last_accrual_day" integer NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e6bde7e98a0d34f083084e3008f" PRIMARY KEY ("character_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_trades" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "idempotency_key" character varying(96) NOT NULL, "instrument_id" character varying(16) NOT NULL, "side" character varying(8) NOT NULL, "quantity" bigint NOT NULL, "price" numeric(24,8) NOT NULL, "gross" bigint NOT NULL, "fee" bigint NOT NULL DEFAULT '0', "realized_gain" bigint, "game_minute" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_dab5bbb632bf6bc8b48e793aac0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "investment_trades_character_created" ON "investment_trades"  ("character_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "investment_trades_character_key" ON "investment_trades"  ("character_id", "idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_holdings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "instrument_id" character varying(16) NOT NULL, "micro_units" bigint NOT NULL, "cost_basis" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2091fdb00bc8fd75df48865d0db" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "investment_holdings_character_instrument" ON "investment_holdings"  ("character_id", "instrument_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_ponzi_stakes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "scheme" character varying(48) NOT NULL, "amount" bigint NOT NULL, "promised_payout" bigint NOT NULL, "joined_at" bigint NOT NULL, "payout_at" bigint NOT NULL, "collapse_at" bigint NOT NULL, "status" character varying(10) NOT NULL DEFAULT 'active', "resolved_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_61025c7e933b50b5f6060817509" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "investment_ponzi_stakes_character_status" ON "investment_ponzi_stakes"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_accounts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "owner_id" uuid, "kind" character varying(16) NOT NULL, "code" character varying(48), "currency" character varying(3) NOT NULL DEFAULT 'NGN', "balance" bigint NOT NULL DEFAULT '0', "allow_negative" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ledger_accounts_non_negative" CHECK ("allow_negative" OR "balance" >= 0), CONSTRAINT "PK_62b34396dda564757cf123fff0e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9c1b2dbdbb9a7d8b6cc44dfea1" ON "ledger_accounts"  ("code") WHERE "code" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ledger_accounts_owner_kind" ON "ledger_accounts"  ("owner_id", "kind") WHERE "owner_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_system_deltas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "account_id" uuid NOT NULL, "amount" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0e24f8f089a5f67daaeb3392095" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_transactions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "idempotency_key" character varying(160) NOT NULL, "kind" character varying(32) NOT NULL, "memo" character varying(200) NOT NULL, "game_minute" bigint NOT NULL, "character_id" uuid, "counterparty_character_id" uuid, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_633d103c9e415d615aacf9b1929" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_01ff7d3a76be6b7ca5fd33761d" ON "ledger_transactions"  ("idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ledger_transactions_character_created" ON "ledger_transactions"  ("character_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_entries" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "transaction_id" uuid NOT NULL, "account_id" uuid NOT NULL, "amount" bigint NOT NULL, "balance_after" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6efcb84411d3f08b08450ae75d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b26c5ef5853fd6e0a8680427f6" ON "ledger_entries"  ("transaction_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ledger_entries_account_created" ON "ledger_entries"  ("account_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "reference" character varying(64) NOT NULL, "user_id" uuid NOT NULL, "character_id" uuid, "purpose" character varying(16) NOT NULL, "subject_id" character varying(64) NOT NULL, "description" character varying(120) NOT NULL, "amount_kobo" bigint NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'NGN', "provider" character varying(10) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'initialized', "channel" character varying(32), "gateway_response" jsonb, "failure_reason" character varying(160), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "verified_at" TIMESTAMP WITH TIME ZONE, "fulfilled_at" TIMESTAMP WITH TIME ZONE, "fulfillment_attempts" integer NOT NULL DEFAULT '0', "last_fulfillment_error" character varying(200), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_866ddee0e17d9385b4e3b86851" ON "payments"  ("reference") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_c63448218b36dc171b42c2c9da" ON "payments"  ("character_id") `);
    await queryRunner.query(
      `CREATE INDEX "payments_status_created" ON "payments"  ("status", "created_at") `,
    );
    await queryRunner.query(`CREATE INDEX "payments_user_created" ON "payments"  ("user_id", "created_at") `);
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "kind" character varying(24) NOT NULL, "title" character varying(120) NOT NULL, "body" character varying(500) NOT NULL, "tone" character varying(8) NOT NULL DEFAULT 'neutral', "amount" bigint, "game_minute" bigint NOT NULL, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "notifications_character_created" ON "notifications"  ("character_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "progression_daily_welcomes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "character_id" uuid NOT NULL, "real_date" character varying(10) NOT NULL, "flavour_id" character varying(40) NOT NULL, "cash" integer NOT NULL, "mood_boost" integer NOT NULL, "game_minute" bigint NOT NULL, "claimed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_79a92062fa180c9c468679978df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "progression_daily_welcomes_character" ON "progression_daily_welcomes"  ("character_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "progression_daily_welcomes_user_date" ON "progression_daily_welcomes"  ("user_id", "real_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "progression_goals" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "goal_id" character varying(48) NOT NULL, "chapter" integer NOT NULL, "status" character varying(12) NOT NULL, "path_id" character varying(24), "completed_at" bigint, "rewarded" boolean NOT NULL DEFAULT false, "reward_cash" integer NOT NULL DEFAULT '0', "reward_clout" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35a3c397c6462c985874d0b811d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "progression_goals_character_goal" ON "progression_goals"  ("character_id", "goal_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "progression_achievements" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "achievement_id" character varying(48) NOT NULL, "unlocked_at" bigint NOT NULL, "clout" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_61d1a131ce9ce4519fd43307f83" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "progression_achievements_achievement" ON "progression_achievements"  ("achievement_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "progression_achievements_character_achievement" ON "progression_achievements"  ("character_id", "achievement_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "progression_milestones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "moment_id" character varying(32) NOT NULL, "dedupe_key" character varying(160) NOT NULL, "title" character varying(120) NOT NULL, "body" character varying(500) NOT NULL, "icon" character varying(40) NOT NULL, "share_text" character varying(200) NOT NULL, "stats" jsonb NOT NULL DEFAULT '[]', "game_minute" bigint NOT NULL, "acknowledged_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_49cc57a8c34fe773f59fc223d25" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "progression_milestones_character_pending" ON "progression_milestones"  ("character_id", "acknowledged_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "progression_milestones_character_dedupe" ON "progression_milestones"  ("character_id", "dedupe_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "progression_counters" ("character_id" uuid NOT NULL, "key" character varying(80) NOT NULL, "value" bigint NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_570aee1a602cf1c51363737f395" PRIMARY KEY ("character_id", "key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "progression_profiles" ("character_id" uuid NOT NULL, "chapter" integer NOT NULL DEFAULT '1', "legacy_complete" boolean NOT NULL DEFAULT false, "clout" integer NOT NULL DEFAULT '0', "job_key" character varying(160), "earned_mark" bigint NOT NULL DEFAULT '0', "last_probed_day" integer, "seeded_at" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_79597cbade817fae7e3888797ec" PRIMARY KEY ("character_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "promotion_campaigns" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "owner_user_id" uuid NOT NULL, "owner_character_id" uuid, "slot_id" character varying(32) NOT NULL, "title" character varying(80) NOT NULL, "creative_key" character varying(200) NOT NULL, "creative_url" character varying(500) NOT NULL, "link_url" character varying(500) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "days" smallint NOT NULL, "amount_kobo" bigint NOT NULL, "status" character varying(16) NOT NULL, "rejection_reason" character varying(300), "hold_expires_at" TIMESTAMP WITH TIME ZONE, "payment_reference" character varying(100), "checkout_url" character varying(500), "paid_at" TIMESTAMP WITH TIME ZONE, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, "impressions" bigint NOT NULL DEFAULT '0', "clicks" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35aea06069957b862f524f49311" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "promotion_campaigns_payment_reference" ON "promotion_campaigns"  ("payment_reference") WHERE payment_reference IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_campaigns_status_start" ON "promotion_campaigns"  ("status", "start_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_campaigns_slot_window" ON "promotion_campaigns"  ("slot_id", "status", "start_date", "end_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_campaigns_owner_created" ON "promotion_campaigns"  ("owner_user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "promotion_club_orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "track_id" uuid NOT NULL, "owner_user_id" uuid NOT NULL, "owner_character_id" uuid, "product_id" character varying(24) NOT NULL, "all_clubs" boolean NOT NULL DEFAULT false, "clubs" character varying(64) array NOT NULL DEFAULT '{}', "start_date" date NOT NULL, "end_date" date NOT NULL, "days" smallint NOT NULL, "amount_kobo" bigint NOT NULL, "status" character varying(16) NOT NULL, "rejection_reason" character varying(300), "hold_expires_at" TIMESTAMP WITH TIME ZONE, "payment_reference" character varying(100), "checkout_url" character varying(500), "paid_at" TIMESTAMP WITH TIME ZONE, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, "plays" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b220fec1aac7015209d0c819274" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "promotion_club_orders_payment_reference" ON "promotion_club_orders"  ("payment_reference") WHERE payment_reference IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_club_orders_status_window" ON "promotion_club_orders"  ("status", "start_date", "end_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_club_orders_owner_created" ON "promotion_club_orders"  ("owner_user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_club_orders_track_created" ON "promotion_club_orders"  ("track_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "promotion_tracks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "owner_user_id" uuid NOT NULL, "owner_character_id" uuid, "artist_name" character varying(40) NOT NULL, "title" character varying(80) NOT NULL, "audio_key" character varying(200) NOT NULL, "audio_url" character varying(500) NOT NULL, "content_type" character varying(16) NOT NULL, "duration_seconds" smallint NOT NULL, "bytes" integer NOT NULL, "removed_at" TIMESTAMP WITH TIME ZONE, "plays" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_87e074220b3c77c7750f5c47843" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_tracks_owner_created" ON "promotion_tracks"  ("owner_user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "promotion_creatives" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "owner_user_id" uuid NOT NULL, "format" character varying(16) NOT NULL, "width" smallint NOT NULL, "height" smallint NOT NULL, "key" character varying(200) NOT NULL, "url" character varying(500) NOT NULL, "bytes" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_75a872e4d60d84a9eb56ec6d6b5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "promotion_creatives_key" ON "promotion_creatives"  ("key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_creatives_owner_created" ON "promotion_creatives"  ("owner_user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "promotion_moderation_log" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "subject_type" character varying(16) NOT NULL, "subject_id" uuid NOT NULL, "action" character varying(24) NOT NULL, "from_status" character varying(16), "to_status" character varying(16), "actor_user_id" uuid, "reason" character varying(300), "payment_reference" character varying(100), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c67dd5657df3fdb9de2507dbcf1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "promotion_moderation_log_subject" ON "promotion_moderation_log"  ("subject_type", "subject_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_dm_threads" ("character_id" uuid NOT NULL, "channel" character varying(96) NOT NULL, "counterpart_id" uuid NOT NULL, "last_message_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_sender_id" uuid NOT NULL, "last_preview" character varying(120) NOT NULL, "last_read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_495be9969a41df254fc62a4163d" PRIMARY KEY ("character_id", "channel"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "chat_dm_threads_character_recent" ON "chat_dm_threads"  ("character_id", "last_message_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "channel" character varying(96) NOT NULL, "sender_id" uuid NOT NULL, "sender_handle" character varying(20) NOT NULL, "sender_first_name" character varying(40) NOT NULL, "sender_status" integer NOT NULL DEFAULT '0', "body" character varying(280) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "chat_messages_channel_created" ON "chat_messages"  ("channel", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "item_id" character varying(64) NOT NULL, "kind" character varying(12) NOT NULL, "quantity" integer NOT NULL DEFAULT '1', "condition" real NOT NULL DEFAULT '100', "condition_at" bigint NOT NULL, "acquired_at" bigint NOT NULL, "source" character varying(12) NOT NULL, "unit_price" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cf2f451407242e132547ac19169" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "inventory_items_character" ON "inventory_items"  ("character_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "inventory_items_character_item" ON "inventory_items"  ("character_id", "item_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "shop_orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "item_id" character varying(64) NOT NULL, "kind" character varying(12) NOT NULL, "quantity" integer NOT NULL, "unit_price" bigint NOT NULL, "delivery_fee" bigint NOT NULL DEFAULT '0', "total" bigint NOT NULL, "channel" character varying(10) NOT NULL, "venue_id" character varying(64), "status" character varying(12) NOT NULL, "ordered_at" bigint NOT NULL, "arrives_at" bigint, "delivered_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_144b24698d178764ea5bb26da3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "shop_orders_character_status" ON "shop_orders"  ("character_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_blocks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "blocker_id" uuid NOT NULL, "blocked_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d3983468f269b8210e1c7e9f99c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_48364f256e6bc2d8da74983730" ON "social_blocks"  ("blocked_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "social_blocks_pair" ON "social_blocks"  ("blocker_id", "blocked_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_friendships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "pair_key" character varying(73) NOT NULL, "requester_id" uuid NOT NULL, "addressee_id" uuid NOT NULL, "status" character varying(12) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "accepted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_acbefdabd92d265936d9e857da5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_996f021801b8ae4f4328025a21" ON "social_friendships"  ("pair_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aabbd761f6c589527374bf9965" ON "social_friendships"  ("requester_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_356008147d8ea3dceb75658338" ON "social_friendships"  ("addressee_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_party_guests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "party_id" uuid NOT NULL, "character_id" uuid NOT NULL, "joined_at" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_13563bb147c5bd0be323635acd2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b26879888f992ea8787271103a" ON "social_party_guests"  ("character_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "social_party_guests_pair" ON "social_party_guests"  ("party_id", "character_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_parties" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "host_id" uuid NOT NULL, "venue_id" character varying(64) NOT NULL, "venue_kind" character varying(16) NOT NULL, "district_id" character varying(24) NOT NULL, "title" character varying(60) NOT NULL, "tier" character varying(16) NOT NULL, "dress_code" character varying(20) NOT NULL, "starts_at" bigint NOT NULL, "ends_at" bigint NOT NULL, "capacity" integer NOT NULL, "cost_paid" bigint NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'scheduled', "guest_count" integer NOT NULL DEFAULT '0', "total_sprayed" bigint NOT NULL DEFAULT '0', "host_clout" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1ab0556b60c31d85dcd242916d7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "social_parties_host_status" ON "social_parties"  ("host_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "social_parties_status_ends" ON "social_parties"  ("status", "ends_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_reports" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "reporter_id" uuid NOT NULL, "target_id" uuid NOT NULL, "reason" character varying(24) NOT NULL, "context" jsonb NOT NULL, "message_id" uuid, "status" character varying(12) NOT NULL DEFAULT 'open', "game_minute" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8ae7c1f6dfc65aa7a592393e206" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "social_reports_reporter_created" ON "social_reports"  ("reporter_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "social_reports_target_status" ON "social_reports"  ("target_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_profiles" ("character_id" uuid NOT NULL, "title" character varying(96), "badges" jsonb NOT NULL DEFAULT '[]', "degree_label" character varying(120), "best_cgpa" real, "children_count" integer NOT NULL DEFAULT '0', "married" boolean NOT NULL DEFAULT false, "monthly_income" bigint NOT NULL DEFAULT '0', "self_made_net_worth" bigint NOT NULL DEFAULT '0', "friend_count" integer NOT NULL DEFAULT '0', "parties_hosted" integer NOT NULL DEFAULT '0', "show_exact_wealth" boolean NOT NULL DEFAULT false, "location_visibility" character varying(8) NOT NULL DEFAULT 'friends', "refreshed_at_game" bigint NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bd8c313d8b87137833cb649341d" PRIMARY KEY ("character_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a68464c413cb6a0a7307503a68" ON "social_profiles"  ("best_cgpa") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ad76fe385ed0fdd820e67e67c0" ON "social_profiles"  ("monthly_income") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_sprays" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "party_id" uuid NOT NULL, "from_id" uuid NOT NULL, "to_id" uuid NOT NULL, "amount" bigint NOT NULL, "game_minute" bigint NOT NULL, "idempotency_key" character varying(64) NOT NULL, "ledger_transaction_id" uuid NOT NULL, "fine" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6b61edc4f6c2273506ab584d43c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "social_sprays_party_to" ON "social_sprays"  ("party_id", "to_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "social_sprays_party_from" ON "social_sprays"  ("party_id", "from_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "social_sprays_idempotency" ON "social_sprays"  ("from_id", "idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "email_verified_at" TIMESTAMP WITH TIME ZONE, "role" character varying(16) NOT NULL DEFAULT 'player', "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `);
    await queryRunner.query(
      `CREATE TABLE "owned_vehicles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "vehicle_id" character varying(64) NOT NULL, "paint" character varying(24) NOT NULL, "plate" character varying(12) NOT NULL, "purchase_price" bigint NOT NULL, "condition" real NOT NULL, "condition_at" bigint NOT NULL, "mileage_km" real NOT NULL DEFAULT '0', "acquired_at" bigint NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "status" character varying(12) NOT NULL DEFAULT 'owned', "arrives_at" bigint, "last_driven_at" bigint, "skipped_services" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6687871721e37e457a3abff0452" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "owned_vehicles_character" ON "owned_vehicles"  ("character_id") `);
    // Rich list: leaderboards rank living characters by self-made net worth (see social/rules/leaderboard.rules.ts).
    await queryRunner.query(
      `CREATE INDEX "characters_self_made_net_worth" ON "characters" ((GREATEST(0, "net_worth" - "unearned_total")) DESC) WHERE "alive"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."characters_self_made_net_worth"`);
    await queryRunner.query(`DROP INDEX "public"."owned_vehicles_character"`);
    await queryRunner.query(`DROP TABLE "owned_vehicles"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."social_sprays_idempotency"`);
    await queryRunner.query(`DROP INDEX "public"."social_sprays_party_from"`);
    await queryRunner.query(`DROP INDEX "public"."social_sprays_party_to"`);
    await queryRunner.query(`DROP TABLE "social_sprays"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ad76fe385ed0fdd820e67e67c0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a68464c413cb6a0a7307503a68"`);
    await queryRunner.query(`DROP TABLE "social_profiles"`);
    await queryRunner.query(`DROP INDEX "public"."social_reports_target_status"`);
    await queryRunner.query(`DROP INDEX "public"."social_reports_reporter_created"`);
    await queryRunner.query(`DROP TABLE "social_reports"`);
    await queryRunner.query(`DROP INDEX "public"."social_parties_status_ends"`);
    await queryRunner.query(`DROP INDEX "public"."social_parties_host_status"`);
    await queryRunner.query(`DROP TABLE "social_parties"`);
    await queryRunner.query(`DROP INDEX "public"."social_party_guests_pair"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b26879888f992ea8787271103a"`);
    await queryRunner.query(`DROP TABLE "social_party_guests"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_356008147d8ea3dceb75658338"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_aabbd761f6c589527374bf9965"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_996f021801b8ae4f4328025a21"`);
    await queryRunner.query(`DROP TABLE "social_friendships"`);
    await queryRunner.query(`DROP INDEX "public"."social_blocks_pair"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_48364f256e6bc2d8da74983730"`);
    await queryRunner.query(`DROP TABLE "social_blocks"`);
    await queryRunner.query(`DROP INDEX "public"."shop_orders_character_status"`);
    await queryRunner.query(`DROP TABLE "shop_orders"`);
    await queryRunner.query(`DROP INDEX "public"."inventory_items_character_item"`);
    await queryRunner.query(`DROP INDEX "public"."inventory_items_character"`);
    await queryRunner.query(`DROP TABLE "inventory_items"`);
    await queryRunner.query(`DROP INDEX "public"."chat_messages_channel_created"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP INDEX "public"."chat_dm_threads_character_recent"`);
    await queryRunner.query(`DROP TABLE "chat_dm_threads"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_moderation_log_subject"`);
    await queryRunner.query(`DROP TABLE "promotion_moderation_log"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_creatives_owner_created"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_creatives_key"`);
    await queryRunner.query(`DROP TABLE "promotion_creatives"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_tracks_owner_created"`);
    await queryRunner.query(`DROP TABLE "promotion_tracks"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_orders_track_created"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_orders_owner_created"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_orders_status_window"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_orders_payment_reference"`);
    await queryRunner.query(`DROP TABLE "promotion_club_orders"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_campaigns_owner_created"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_campaigns_slot_window"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_campaigns_status_start"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_campaigns_payment_reference"`);
    await queryRunner.query(`DROP TABLE "promotion_campaigns"`);
    await queryRunner.query(`DROP TABLE "progression_profiles"`);
    await queryRunner.query(`DROP TABLE "progression_counters"`);
    await queryRunner.query(`DROP INDEX "public"."progression_milestones_character_dedupe"`);
    await queryRunner.query(`DROP INDEX "public"."progression_milestones_character_pending"`);
    await queryRunner.query(`DROP TABLE "progression_milestones"`);
    await queryRunner.query(`DROP INDEX "public"."progression_achievements_character_achievement"`);
    await queryRunner.query(`DROP INDEX "public"."progression_achievements_achievement"`);
    await queryRunner.query(`DROP TABLE "progression_achievements"`);
    await queryRunner.query(`DROP INDEX "public"."progression_goals_character_goal"`);
    await queryRunner.query(`DROP TABLE "progression_goals"`);
    await queryRunner.query(`DROP INDEX "public"."progression_daily_welcomes_user_date"`);
    await queryRunner.query(`DROP INDEX "public"."progression_daily_welcomes_character"`);
    await queryRunner.query(`DROP TABLE "progression_daily_welcomes"`);
    await queryRunner.query(`DROP INDEX "public"."notifications_character_created"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP INDEX "public"."payments_user_created"`);
    await queryRunner.query(`DROP INDEX "public"."payments_status_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c63448218b36dc171b42c2c9da"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_866ddee0e17d9385b4e3b86851"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP INDEX "public"."ledger_entries_account_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b26c5ef5853fd6e0a8680427f6"`);
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP INDEX "public"."ledger_transactions_character_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_01ff7d3a76be6b7ca5fd33761d"`);
    await queryRunner.query(`DROP TABLE "ledger_transactions"`);
    await queryRunner.query(`DROP TABLE "ledger_system_deltas"`);
    await queryRunner.query(`DROP INDEX "public"."ledger_accounts_owner_kind"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9c1b2dbdbb9a7d8b6cc44dfea1"`);
    await queryRunner.query(`DROP TABLE "ledger_accounts"`);
    await queryRunner.query(`DROP INDEX "public"."investment_ponzi_stakes_character_status"`);
    await queryRunner.query(`DROP TABLE "investment_ponzi_stakes"`);
    await queryRunner.query(`DROP INDEX "public"."investment_holdings_character_instrument"`);
    await queryRunner.query(`DROP TABLE "investment_holdings"`);
    await queryRunner.query(`DROP INDEX "public"."investment_trades_character_key"`);
    await queryRunner.query(`DROP INDEX "public"."investment_trades_character_created"`);
    await queryRunner.query(`DROP TABLE "investment_trades"`);
    await queryRunner.query(`DROP TABLE "investment_savings_accruals"`);
    await queryRunner.query(`DROP INDEX "public"."investment_deposits_character_status"`);
    await queryRunner.query(`DROP INDEX "public"."investment_deposits_character_key"`);
    await queryRunner.query(`DROP TABLE "investment_deposits"`);
    await queryRunner.query(`DROP INDEX "public"."housing_buildings_character"`);
    await queryRunner.query(`DROP INDEX "public"."housing_buildings_property"`);
    await queryRunner.query(`DROP TABLE "housing_buildings"`);
    await queryRunner.query(`DROP TABLE "housing_residences"`);
    await queryRunner.query(`DROP INDEX "public"."housing_properties_character_status"`);
    await queryRunner.query(`DROP TABLE "housing_properties"`);
    await queryRunner.query(`DROP INDEX "public"."housing_property_sales_character_status"`);
    await queryRunner.query(`DROP TABLE "housing_property_sales"`);
    await queryRunner.query(`DROP INDEX "public"."housing_leases_character_status"`);
    await queryRunner.query(`DROP TABLE "housing_leases"`);
    await queryRunner.query(`DROP INDEX "public"."pregnancies_character_status"`);
    await queryRunner.query(`DROP TABLE "pregnancies"`);
    await queryRunner.query(`DROP TABLE "health_profiles"`);
    await queryRunner.query(`DROP INDEX "public"."medical_records_character_time"`);
    await queryRunner.query(`DROP TABLE "medical_records"`);
    await queryRunner.query(`DROP INDEX "public"."hospital_admissions_character_status"`);
    await queryRunner.query(`DROP TABLE "hospital_admissions"`);
    await queryRunner.query(`DROP INDEX "public"."hmo_memberships_character_status"`);
    await queryRunner.query(`DROP TABLE "hmo_memberships"`);
    await queryRunner.query(`DROP INDEX "public"."health_conditions_character_status"`);
    await queryRunner.query(`DROP TABLE "health_conditions"`);
    await queryRunner.query(`DROP INDEX "public"."life_events_character_status"`);
    await queryRunner.query(`DROP INDEX "public"."life_events_character_event"`);
    await queryRunner.query(`DROP TABLE "life_events"`);
    await queryRunner.query(`DROP INDEX "public"."family_successions_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4ff9955200a35171d11f948e07"`);
    await queryRunner.query(`DROP TABLE "family_successions"`);
    await queryRunner.query(`DROP INDEX "public"."family_relationships_character"`);
    await queryRunner.query(`DROP INDEX "public"."family_relationships_person"`);
    await queryRunner.query(`DROP INDEX "public"."family_relationships_player"`);
    await queryRunner.query(`DROP INDEX "public"."family_relationships_other"`);
    await queryRunner.query(`DROP TABLE "family_relationships"`);
    await queryRunner.query(`DROP INDEX "public"."family_proposals_to"`);
    await queryRunner.query(`DROP INDEX "public"."family_proposals_from"`);
    await queryRunner.query(`DROP INDEX "public"."family_proposals_one_pending"`);
    await queryRunner.query(`DROP TABLE "family_proposals"`);
    await queryRunner.query(`DROP INDEX "public"."family_people_owner"`);
    await queryRunner.query(`DROP INDEX "public"."family_people_guardian"`);
    await queryRunner.query(`DROP TABLE "family_people"`);
    await queryRunner.query(`DROP INDEX "public"."family_marriages_character"`);
    await queryRunner.query(`DROP INDEX "public"."family_marriages_spouse_character"`);
    await queryRunner.query(`DROP TABLE "family_marriages"`);
    await queryRunner.query(`DROP INDEX "public"."family_triggers_character_status"`);
    await queryRunner.query(`DROP INDEX "public"."family_triggers_dedupe"`);
    await queryRunner.query(`DROP TABLE "family_triggers"`);
    await queryRunner.query(`DROP INDEX "public"."education_waec_results_character_sitting"`);
    await queryRunner.query(`DROP TABLE "education_waec_results"`);
    await queryRunner.query(`DROP INDEX "public"."education_programme_enrolments_character_status"`);
    await queryRunner.query(`DROP TABLE "education_programme_enrolments"`);
    await queryRunner.query(`DROP INDEX "public"."education_nysc_services_character"`);
    await queryRunner.query(`DROP TABLE "education_nysc_services"`);
    await queryRunner.query(`DROP INDEX "public"."education_enrolments_character_status"`);
    await queryRunner.query(`DROP TABLE "education_enrolments"`);
    await queryRunner.query(`DROP INDEX "public"."education_exam_registrations_character_kind"`);
    await queryRunner.query(`DROP TABLE "education_exam_registrations"`);
    await queryRunner.query(`DROP INDEX "public"."education_certifications_character_code"`);
    await queryRunner.query(`DROP TABLE "education_certifications"`);
    await queryRunner.query(`DROP INDEX "public"."education_admission_applications_character_status"`);
    await queryRunner.query(`DROP TABLE "education_admission_applications"`);
    await queryRunner.query(`DROP INDEX "public"."characters_one_living_per_user"`);
    await queryRunner.query(`DROP INDEX "public"."characters_settle_queue"`);
    await queryRunner.query(`DROP INDEX "public"."characters_location_alive"`);
    await queryRunner.query(`DROP INDEX "public"."characters_status_alive"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ea3dd2760c6f278451f2b1c772"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7af8d2d81b5d486b27b918da46"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c6e648aeaab79e4213def02aba"`);
    await queryRunner.query(`DROP TABLE "characters"`);
    await queryRunner.query(`DROP INDEX "public"."job_applications_character_status"`);
    await queryRunner.query(`DROP INDEX "public"."job_applications_character_job"`);
    await queryRunner.query(`DROP TABLE "job_applications"`);
    await queryRunner.query(`DROP INDEX "public"."employments_one_per_character"`);
    await queryRunner.query(`DROP TABLE "employments"`);
    await queryRunner.query(`DROP INDEX "public"."employment_history_character_ended"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_644534740d923f08b31824cea4"`);
    await queryRunner.query(`DROP TABLE "employment_history"`);
    await queryRunner.query(`DROP INDEX "public"."businesses_character_status"`);
    await queryRunner.query(`DROP TABLE "businesses"`);
    await queryRunner.query(`DROP INDEX "public"."business_pnl_business_month"`);
    await queryRunner.query(`DROP INDEX "public"."business_pnl_character_month"`);
    await queryRunner.query(`DROP TABLE "business_pnl"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d5e27da0cd39bc3bb2811fc8ba"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
