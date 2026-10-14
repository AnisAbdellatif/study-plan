CREATE TABLE "calendar_feed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subjects" jsonb,
	"token_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_url" text NOT NULL,
	"host" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_source_id_calendar_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."calendar_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_feed_source_id_idx" ON "calendar_feed" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_source_user_id_idx" ON "calendar_source" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_source_last_fetched_at_idx" ON "calendar_source" USING btree ("last_fetched_at");