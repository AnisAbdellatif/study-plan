CREATE TABLE "preset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_name" text NOT NULL,
	"programme_name" text NOT NULL,
	"degree" text NOT NULL,
	"po_version" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "preset_programme_idx" ON "preset" USING btree ("university_name","programme_name","degree","po_version");