CREATE TABLE "analyses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"repository_id" text NOT NULL,
	"requested_by_user_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"commit_sha" text,
	"commit_date" timestamp with time zone,
	"branch" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error" text,
	"health_score" real,
	"grade" text,
	"category_scores" jsonb,
	"finding_summary" jsonb,
	"metrics" jsonb,
	"analyzer_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_steps" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"analysis_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"detail" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"analysis_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"severity_rank" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"file_path" text,
	"line" integer,
	"end_line" integer,
	"symbol" text,
	"evidence" jsonb NOT NULL,
	"recommendation" text NOT NULL,
	"fingerprint" text NOT NULL,
	"github_issue_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_edges" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"analysis_id" text NOT NULL,
	"kind" text NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"in_cycle" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_nodes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"analysis_id" text NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"parent_path" text,
	"loc" integer DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"fan_in" integer DEFAULT 0 NOT NULL,
	"fan_out" integer DEFAULT 0 NOT NULL,
	"instability" real,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"in_cycle" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_user_id" text,
	"github_id" bigint,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"size_kb" integer,
	"primary_language" text,
	"description" text,
	"html_url" text NOT NULL,
	"clone_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_github_token" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"github_id" bigint NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_edges" ADD CONSTRAINT "module_edges_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_nodes" ADD CONSTRAINT "module_nodes_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_repository_created_idx" ON "analyses" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE INDEX "analyses_repository_status_idx" ON "analyses" USING btree ("repository_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_steps_analysis_key_idx" ON "analysis_steps" USING btree ("analysis_id","key");--> statement-breakpoint
CREATE INDEX "findings_analysis_severity_idx" ON "findings" USING btree ("analysis_id","severity_rank","id");--> statement-breakpoint
CREATE INDEX "findings_analysis_file_idx" ON "findings" USING btree ("analysis_id","file_path");--> statement-breakpoint
CREATE INDEX "findings_analysis_fingerprint_idx" ON "findings" USING btree ("analysis_id","fingerprint");--> statement-breakpoint
CREATE INDEX "findings_analysis_category_idx" ON "findings" USING btree ("analysis_id","category");--> statement-breakpoint
CREATE INDEX "module_edges_analysis_kind_idx" ON "module_edges" USING btree ("analysis_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "module_nodes_analysis_path_kind_idx" ON "module_nodes" USING btree ("analysis_id","path","kind");--> statement-breakpoint
CREATE INDEX "module_nodes_analysis_parent_idx" ON "module_nodes" USING btree ("analysis_id","kind","parent_path");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_owner_full_name_idx" ON "repositories" USING btree ("owner_user_id","full_name");--> statement-breakpoint
CREATE INDEX "repositories_full_name_idx" ON "repositories" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "repositories_is_demo_idx" ON "repositories" USING btree ("is_demo");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_id_idx" ON "users" USING btree ("github_id");