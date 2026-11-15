CREATE TABLE "usage" (
	"user_id" text,
	"kind" text,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"used" integer NOT NULL,
	CONSTRAINT "usage_pk" PRIMARY KEY("user_id","kind")
);
