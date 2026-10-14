-- Each link gets its own choices, starting from the account's; existing feeds keep showing all of the account's links.
ALTER TABLE "calendar_feed" ADD COLUMN "source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "calendar_feed" SET "source_ids" = COALESCE((SELECT jsonb_agg("calendar_source"."id" ORDER BY "calendar_source"."created_at", "calendar_source"."id") FROM "calendar_source" WHERE "calendar_source"."user_id" = "calendar_feed"."user_id"), '[]'::jsonb);--> statement-breakpoint
ALTER TABLE "calendar_feed" ALTER COLUMN "source_ids" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "calendar_source" ADD COLUMN "selection" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "calendar_source" SET "selection" = jsonb_strip_nulls(jsonb_build_object(
  'subjects', "calendar"."settings"->'subjects',
  'excludedSubjects', "calendar"."settings"->'excludedSubjects',
  'excludedCourses', "calendar"."settings"->'excludedCourses',
  'excludedSlots', "calendar"."settings"->'excludedSlots',
  'hiddenEvents', "calendar"."settings"->'hiddenEvents'
)) FROM "calendar" WHERE "calendar"."user_id" = "calendar_source"."user_id";--> statement-breakpoint
ALTER TABLE "calendar_source" ALTER COLUMN "selection" DROP DEFAULT;
