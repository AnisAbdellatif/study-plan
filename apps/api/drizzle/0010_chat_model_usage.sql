CREATE TABLE "chat_model_usage" (
	"day" date NOT NULL,
	"model" text NOT NULL,
	"questions" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" bigint DEFAULT 0 NOT NULL,
	"completion_tokens" bigint DEFAULT 0 NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_model_usage_day_model_pk" PRIMARY KEY("day","model")
);
