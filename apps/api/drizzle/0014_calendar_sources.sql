ALTER TABLE "calendar_feed" DROP CONSTRAINT "calendar_feed_source_id_calendar_source_id_fk";
--> statement-breakpoint
ALTER TABLE "calendar_source" DROP CONSTRAINT "calendar_source_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "calendar_feed_source_id_idx";--> statement-breakpoint
DROP INDEX "calendar_source_user_id_idx";--> statement-breakpoint
ALTER TABLE "calendar_feed" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_user_id_calendar_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."calendar"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_feed_user_id_idx" ON "calendar_feed" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_source_user_id_idx" ON "calendar_source" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "calendar_feed" DROP COLUMN "source_id";--> statement-breakpoint
ALTER TABLE "calendar_source" DROP COLUMN "settings";--> statement-breakpoint
ALTER TABLE "calendar_source" DROP COLUMN "changes";