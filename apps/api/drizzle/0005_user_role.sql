ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_superadmin_idx" ON "user" USING btree ("role") WHERE role = 'superadmin';