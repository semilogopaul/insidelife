import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminPortalAuditAndAccounts1791548416514 implements MigrationInterface {
    name = 'AdminPortalAuditAndAccounts1791548416514'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(), "actor_user_id" uuid, "actor_email" character varying(254), "actor_role" character varying(16) NOT NULL, "action" character varying(64) NOT NULL, "target_type" character varying(32) NOT NULL, "target_id" character varying(64), "target_label" character varying(200), "before" jsonb, "after" jsonb, "reason" character varying(1000), "metadata" jsonb NOT NULL DEFAULT '{}', "ip" character varying(64), "user_agent" character varying(255), "trace_id" character varying(64), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "audit_logs_action_occurred" ON "audit_logs"  ("action", "occurred_at") `);
        await queryRunner.query(`CREATE INDEX "audit_logs_target_occurred" ON "audit_logs"  ("target_type", "target_id", "occurred_at") `);
        await queryRunner.query(`CREATE INDEX "audit_logs_actor_occurred" ON "audit_logs"  ("actor_user_id", "occurred_at") `);
        await queryRunner.query(`CREATE INDEX "audit_logs_occurred" ON "audit_logs"  ("occurred_at", "id") `);
        // Append-only: UPDATE, DELETE and TRUNCATE are refused, except inside the account purge job's transaction, which
        // sets insidelife.audit_maintenance to scrub a purged player's identity (AuditService.scrubPlayer).
        await queryRunner.query(`CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF current_setting('insidelife.audit_maintenance', true) = 'on' THEN
                    RETURN COALESCE(NEW, OLD);
                END IF;
                RAISE EXCEPTION 'audit_logs is append-only';
            END $$`);
        await queryRunner.query(`CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"()`);
        await queryRunner.query(`CREATE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_append_only"()`);
        await queryRunner.query(`CREATE TABLE "admin_mfa" ("user_id" uuid NOT NULL, "secret" character varying(512), "pending_secret" character varying(512), "pending_created_at" TIMESTAMP WITH TIME ZONE, "enabled_at" TIMESTAMP WITH TIME ZONE, "last_used_step" bigint, "recovery_code_hashes" jsonb NOT NULL DEFAULT '[]', "recovery_codes_created_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bcee0cea63c09d13bd37df834bb" PRIMARY KEY ("user_id"))`);
        await queryRunner.query(`CREATE TABLE "admin_sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "previous_token_hash" character varying(64), "rotated_at" TIMESTAMP WITH TIME ZONE, "idle_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "absolute_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "revoked_reason" character varying(32), "ip" character varying(64), "user_agent" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_38bb553c2372215d48de2306c5e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_820cb9c73b9f2bf3f2fb678d93" ON "admin_sessions"  ("token_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_3b31548399fab4a15cc089c06e" ON "admin_sessions"  ("previous_token_hash") `);
        await queryRunner.query(`CREATE INDEX "admin_sessions_user" ON "admin_sessions"  ("user_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "characters" ADD "hidden_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "social_reports" ADD "resolved_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "social_reports" ADD "resolved_by" uuid`);
        await queryRunner.query(`ALTER TABLE "social_reports" ADD "resolution_note" character varying(1000)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "suspended_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "suspension_reason" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "suspended_by" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_by" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "purge_after" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "purged_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "users_deleted_at" ON "users"  ("deleted_at") WHERE "deleted_at" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."users_deleted_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "purged_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "purge_after"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspended_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspension_reason"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspended_at"`);
        await queryRunner.query(`ALTER TABLE "social_reports" DROP COLUMN "resolution_note"`);
        await queryRunner.query(`ALTER TABLE "social_reports" DROP COLUMN "resolved_by"`);
        await queryRunner.query(`ALTER TABLE "social_reports" DROP COLUMN "resolved_at"`);
        await queryRunner.query(`ALTER TABLE "characters" DROP COLUMN "hidden_at"`);
        await queryRunner.query(`DROP INDEX "public"."admin_sessions_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3b31548399fab4a15cc089c06e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_820cb9c73b9f2bf3f2fb678d93"`);
        await queryRunner.query(`DROP TABLE "admin_sessions"`);
        await queryRunner.query(`DROP TABLE "admin_mfa"`);
        await queryRunner.query(`DROP TRIGGER "audit_logs_no_truncate" ON "audit_logs"`);
        await queryRunner.query(`DROP TRIGGER "audit_logs_append_only" ON "audit_logs"`);
        await queryRunner.query(`DROP FUNCTION "audit_logs_append_only"()`);
        await queryRunner.query(`DROP INDEX "public"."audit_logs_occurred"`);
        await queryRunner.query(`DROP INDEX "public"."audit_logs_actor_occurred"`);
        await queryRunner.query(`DROP INDEX "public"."audit_logs_target_occurred"`);
        await queryRunner.query(`DROP INDEX "public"."audit_logs_action_occurred"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
