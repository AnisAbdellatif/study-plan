CREATE TABLE "plan_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "plan_share_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "plan_share" ADD CONSTRAINT "plan_share_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_share_plan_id_idx" ON "plan_share" USING btree ("plan_id");