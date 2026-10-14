CREATE TABLE "calendar" (
	"user_id" text PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "calendar_source" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "calendar" ADD CONSTRAINT "calendar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_user_id_calendar_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."calendar"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Settings, changes and feeds move from the single link to the account; the next migration drops the old columns.
INSERT INTO "calendar" ("user_id", "settings", "changes", "created_at", "updated_at")
SELECT "user_id", "settings", "changes", "created_at", "updated_at" FROM "calendar_source";--> statement-breakpoint
UPDATE "calendar_feed" SET "user_id" = "calendar_source"."user_id" FROM "calendar_source" WHERE "calendar_feed"."source_id" = "calendar_source"."id";
