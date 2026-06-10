


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."couple_partner"("p_couple_id" "text", "p_actor" "uuid") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
           when c.owner_user_id = p_actor then c.partner_user_id
           else c.owner_user_id
         end
  from public.date_planner_couples c
  where c.id = p_couple_id;
$$;


ALTER FUNCTION "public"."couple_partner"("p_couple_id" "text", "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_couple_member"("target_couple_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.date_planner_couples c
    where c.id = target_couple_id
      and (c.owner_user_id = auth.uid() or c.partner_user_id = auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_couple_member"("target_couple_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_card"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_partner uuid;
begin
  if NEW.source is distinct from 'ai' then
    return NEW;
  end if;

  v_partner := public.couple_partner(NEW.couple_id, NEW.created_by);
  if v_partner is null then
    return NEW;
  end if;

  insert into public.notifications (user_id, couple_id, type, payload)
  values (
    v_partner,
    NEW.couple_id,
    'new_card',
    jsonb_build_object('card_title', NEW.title, 'card_id', NEW.id)
  );
  return NEW;
end;
$$;


ALTER FUNCTION "public"."notify_on_card"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_reaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_couple_id text;
  v_creator   uuid;
  v_title     text;
begin
  select dc.couple_id, dc.created_by, dc.title
    into v_couple_id, v_creator, v_title
  from public.date_cards dc
  where dc.id = NEW.card_id;

  if v_creator is null or v_creator = NEW.user_id then
    return NEW;
  end if;

  insert into public.notifications (user_id, couple_id, type, payload)
  values (
    v_creator,
    v_couple_id,
    'reaction',
    jsonb_build_object(
      'reaction_type', NEW.reaction_type,
      'condition_tag', NEW.condition_tag,
      'card_title', v_title,
      'card_id', NEW.card_id
    )
  );
  return NEW;
end;
$$;


ALTER FUNCTION "public"."notify_on_reaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_suggestion_requests" (
    "id" "text" NOT NULL,
    "couple_id" "text" NOT NULL,
    "requested_by_user_id" "uuid" NOT NULL,
    "prompt" "text" NOT NULL,
    "result_json" "jsonb",
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_suggestion_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_suggestion_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bucket_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "couple_id" "text" NOT NULL,
    "item" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bucket_list_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."bucket_list" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bucket_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bucket_reactions_reaction_type_check" CHECK (("reaction_type" = ANY (ARRAY['love'::"text", 'next_time'::"text"])))
);


ALTER TABLE "public"."bucket_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."couples" (
    "id" "text" NOT NULL,
    "code" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "partner_user_id" "uuid",
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "linked_at" timestamp with time zone,
    CONSTRAINT "couples_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'linked'::"text"])))
);


ALTER TABLE "public"."couples" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_cards" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "couple_id" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "mode" "text" NOT NULL,
    "input_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "estimated_time" "text" DEFAULT ''::"text" NOT NULL,
    "estimated_budget" "text" DEFAULT ''::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "why_recommended" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'ai'::"text" NOT NULL,
    "confirmed_date" "text",
    "confirmed_time" "text",
    "confirmed_place" "text",
    "confirmed_items" "text",
    CONSTRAINT "date_cards_source_check" CHECK (("source" = ANY (ARRAY['ai'::"text", 'manual'::"text"]))),
    CONSTRAINT "date_cards_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."date_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "couple_id" "text" NOT NULL,
    "card_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "review" "text" DEFAULT ''::"text" NOT NULL,
    "want_again" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."date_memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_options" (
    "id" "text" NOT NULL,
    "proposal_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "place_name" "text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "estimated_cost" "text" DEFAULT ''::"text" NOT NULL,
    "external_url" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text" DEFAULT ''::"text" NOT NULL,
    "partner_preference" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_options_partner_preference_check" CHECK (("partner_preference" = ANY (ARRAY['liked'::"text", 'neutral'::"text", 'not_interested'::"text"])))
);


ALTER TABLE "public"."date_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_planner_ai_requests" (
    "id" "text" NOT NULL,
    "couple_id" "text" NOT NULL,
    "requested_by_user_id" "uuid" NOT NULL,
    "prompt" "text" NOT NULL,
    "result_json" "jsonb",
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_planner_ai_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."date_planner_ai_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_planner_comments" (
    "id" "text" NOT NULL,
    "option_id" "text" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_planner_comments_type_check" CHECK (("type" = ANY (ARRAY['comment'::"text", 'request_change'::"text"])))
);


ALTER TABLE "public"."date_planner_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_planner_couples" (
    "id" "text" NOT NULL,
    "code" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "partner_user_id" "uuid",
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "linked_at" timestamp with time zone,
    CONSTRAINT "date_planner_couples_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'linked'::"text"])))
);


ALTER TABLE "public"."date_planner_couples" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_planner_option_preferences" (
    "option_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "preference" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_planner_option_preferences_preference_check" CHECK (("preference" = ANY (ARRAY['liked'::"text", 'neutral'::"text", 'not_interested'::"text"])))
);


ALTER TABLE "public"."date_planner_option_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_planner_options" (
    "id" "text" NOT NULL,
    "proposal_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "place_name" "text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "estimated_cost" "text" DEFAULT ''::"text" NOT NULL,
    "external_url" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text" DEFAULT ''::"text" NOT NULL,
    "partner_preference" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_planner_options_partner_preference_check" CHECK (("partner_preference" = ANY (ARRAY['liked'::"text", 'neutral'::"text", 'not_interested'::"text"])))
);


ALTER TABLE "public"."date_planner_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_planner_profiles" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "couple_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "anniversary_date" "date",
    "profile_photo_url" "text"
);


ALTER TABLE "public"."date_planner_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_planner_proposals" (
    "id" "text" NOT NULL,
    "couple_id" "text" NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "proposed_date" "date" NOT NULL,
    "proposed_time" time without time zone NOT NULL,
    "location_area" "text" NOT NULL,
    "category" "text" NOT NULL,
    "details" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" NOT NULL,
    "selected_option_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_planner_proposals_category_check" CHECK (("category" = ANY (ARRAY['meal'::"text", 'movie'::"text", 'walk'::"text", 'cafe'::"text", 'activity'::"text", 'custom'::"text"]))),
    CONSTRAINT "date_planner_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."date_planner_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."date_proposals" (
    "id" "text" NOT NULL,
    "couple_id" "text" NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "proposed_date" "date" NOT NULL,
    "proposed_time" time without time zone NOT NULL,
    "location_area" "text" NOT NULL,
    "category" "text" NOT NULL,
    "details" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" NOT NULL,
    "selected_option_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_proposals_category_check" CHECK (("category" = ANY (ARRAY['meal'::"text", 'movie'::"text", 'walk'::"text", 'cafe'::"text", 'activity'::"text", 'custom'::"text"]))),
    CONSTRAINT "date_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."date_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "couple_id" "text",
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['reaction'::"text", 'new_card'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."option_comments" (
    "id" "text" NOT NULL,
    "option_id" "text" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "option_comments_type_check" CHECK (("type" = ANY (ARRAY['comment'::"text", 'request_change'::"text"])))
);


ALTER TABLE "public"."option_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "couple_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "condition_tag" "text",
    "note" "text",
    CONSTRAINT "reactions_condition_tag_check" CHECK ((("condition_tag" IS NULL) OR ("condition_tag" = ANY (ARRAY['change_place'::"text", 'closer'::"text", 'indoor'::"text", 'budget_adjust'::"text"])))),
    CONSTRAINT "reactions_reaction_type_check" CHECK (("reaction_type" = ANY (ARRAY['love'::"text", 'like'::"text", 'burden'::"text", 'next_time'::"text"])))
);


ALTER TABLE "public"."reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."soft_messages" (
    "id" "text" NOT NULL,
    "couple_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "free_text" "text",
    "generated_text" "text" NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."soft_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "preferred_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "avoid_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_long_distance" boolean DEFAULT false NOT NULL,
    "planning_style" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarding_completed" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_suggestion_requests"
    ADD CONSTRAINT "ai_suggestion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bucket_list"
    ADD CONSTRAINT "bucket_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bucket_reactions"
    ADD CONSTRAINT "bucket_reactions_bucket_id_user_id_key" UNIQUE ("bucket_id", "user_id");



ALTER TABLE ONLY "public"."bucket_reactions"
    ADD CONSTRAINT "bucket_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."couples"
    ADD CONSTRAINT "couples_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."couples"
    ADD CONSTRAINT "couples_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_cards"
    ADD CONSTRAINT "date_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_memories"
    ADD CONSTRAINT "date_memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_options"
    ADD CONSTRAINT "date_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_planner_ai_requests"
    ADD CONSTRAINT "date_planner_ai_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_planner_comments"
    ADD CONSTRAINT "date_planner_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_planner_couples"
    ADD CONSTRAINT "date_planner_couples_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."date_planner_couples"
    ADD CONSTRAINT "date_planner_couples_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_planner_option_preferences"
    ADD CONSTRAINT "date_planner_option_preferences_pkey" PRIMARY KEY ("option_id", "user_id");



ALTER TABLE ONLY "public"."date_planner_options"
    ADD CONSTRAINT "date_planner_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_planner_profiles"
    ADD CONSTRAINT "date_planner_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_planner_profiles"
    ADD CONSTRAINT "date_planner_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."date_planner_proposals"
    ADD CONSTRAINT "date_planner_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."date_proposals"
    ADD CONSTRAINT "date_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."option_comments"
    ADD CONSTRAINT "option_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_card_id_user_id_key" UNIQUE ("card_id", "user_id");



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."soft_messages"
    ADD CONSTRAINT "soft_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");



CREATE INDEX "date_cards_couple_created_idx" ON "public"."date_cards" USING "btree" ("couple_id", "created_at" DESC);



CREATE INDEX "date_memories_couple_created_idx" ON "public"."date_memories" USING "btree" ("couple_id", "created_at" DESC);



CREATE INDEX "date_memories_user_created_idx" ON "public"."date_memories" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "reactions_card_idx" ON "public"."reactions" USING "btree" ("card_id");



CREATE INDEX "reactions_user_idx" ON "public"."reactions" USING "btree" ("user_id");



CREATE INDEX "soft_messages_couple_created_idx" ON "public"."soft_messages" USING "btree" ("couple_id", "created_at" DESC);



CREATE INDEX "user_preferences_user_idx" ON "public"."user_preferences" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_notify_card" AFTER INSERT ON "public"."date_cards" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_card"();



CREATE OR REPLACE TRIGGER "trg_notify_reaction" AFTER INSERT ON "public"."reactions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_reaction"();



ALTER TABLE ONLY "public"."ai_suggestion_requests"
    ADD CONSTRAINT "ai_suggestion_requests_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_suggestion_requests"
    ADD CONSTRAINT "ai_suggestion_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bucket_list"
    ADD CONSTRAINT "bucket_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bucket_reactions"
    ADD CONSTRAINT "bucket_reactions_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "public"."bucket_list"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bucket_reactions"
    ADD CONSTRAINT "bucket_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."couples"
    ADD CONSTRAINT "couples_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."couples"
    ADD CONSTRAINT "couples_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."date_cards"
    ADD CONSTRAINT "date_cards_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."date_planner_couples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_cards"
    ADD CONSTRAINT "date_cards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_memories"
    ADD CONSTRAINT "date_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_options"
    ADD CONSTRAINT "date_options_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."date_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_ai_requests"
    ADD CONSTRAINT "date_planner_ai_requests_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."date_planner_couples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_ai_requests"
    ADD CONSTRAINT "date_planner_ai_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_comments"
    ADD CONSTRAINT "date_planner_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_comments"
    ADD CONSTRAINT "date_planner_comments_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."date_planner_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_couples"
    ADD CONSTRAINT "date_planner_couples_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_couples"
    ADD CONSTRAINT "date_planner_couples_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."date_planner_option_preferences"
    ADD CONSTRAINT "date_planner_option_preferences_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."date_planner_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_option_preferences"
    ADD CONSTRAINT "date_planner_option_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_options"
    ADD CONSTRAINT "date_planner_options_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."date_planner_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_profiles"
    ADD CONSTRAINT "date_planner_profiles_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."date_planner_couples"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."date_planner_profiles"
    ADD CONSTRAINT "date_planner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_proposals"
    ADD CONSTRAINT "date_planner_proposals_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."date_planner_couples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_proposals"
    ADD CONSTRAINT "date_planner_proposals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_planner_proposals"
    ADD CONSTRAINT "date_planner_proposals_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "public"."date_planner_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."date_proposals"
    ADD CONSTRAINT "date_proposals_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_proposals"
    ADD CONSTRAINT "date_proposals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."date_proposals"
    ADD CONSTRAINT "date_proposals_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "public"."date_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."date_planner_couples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."option_comments"
    ADD CONSTRAINT "option_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."option_comments"
    ADD CONSTRAINT "option_comments_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."date_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."date_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."soft_messages"
    ADD CONSTRAINT "soft_messages_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "public"."date_planner_couples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."soft_messages"
    ADD CONSTRAINT "soft_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."ai_suggestion_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_suggestion_requests_member_all" ON "public"."ai_suggestion_requests" USING ("public"."is_couple_member"("couple_id")) WITH CHECK ("public"."is_couple_member"("couple_id"));



CREATE POLICY "ai_suggestion_requests_member_all" ON "public"."date_planner_ai_requests" USING ("public"."is_couple_member"("couple_id")) WITH CHECK ("public"."is_couple_member"("couple_id"));



CREATE POLICY "bucket_couple_read" ON "public"."bucket_list" FOR SELECT USING (("couple_id" IN ( SELECT "date_planner_profiles"."couple_id"
   FROM "public"."date_planner_profiles"
  WHERE ("date_planner_profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."bucket_list" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bucket_owner_insert" ON "public"."bucket_list" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "bucket_owner_update" ON "public"."bucket_list" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."bucket_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bucket_rx_couple_read" ON "public"."bucket_reactions" FOR SELECT USING (("bucket_id" IN ( SELECT "bl"."id"
   FROM ("public"."bucket_list" "bl"
     JOIN "public"."date_planner_profiles" "p" ON (("p"."couple_id" = "bl"."couple_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "bucket_rx_owner_insert" ON "public"."bucket_reactions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "bucket_rx_owner_update" ON "public"."bucket_reactions" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "couple members can insert" ON "public"."date_cards" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND ("couple_id" IN ( SELECT "date_planner_couples"."id"
   FROM "public"."date_planner_couples"
  WHERE (("date_planner_couples"."owner_user_id" = "auth"."uid"()) OR ("date_planner_couples"."partner_user_id" = "auth"."uid"()))))));



CREATE POLICY "couple members can select" ON "public"."date_cards" FOR SELECT USING (("couple_id" IN ( SELECT "date_planner_couples"."id"
   FROM "public"."date_planner_couples"
  WHERE (("date_planner_couples"."owner_user_id" = "auth"."uid"()) OR ("date_planner_couples"."partner_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."couples" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "couples_insert_owner" ON "public"."couples" FOR INSERT WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "couples_insert_owner" ON "public"."date_planner_couples" FOR INSERT WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "couples_select_member_or_waiting_code" ON "public"."couples" FOR SELECT USING ((("owner_user_id" = "auth"."uid"()) OR ("partner_user_id" = "auth"."uid"()) OR ("status" = 'waiting'::"text")));



CREATE POLICY "couples_select_member_or_waiting_code" ON "public"."date_planner_couples" FOR SELECT USING ((("owner_user_id" = "auth"."uid"()) OR ("partner_user_id" = "auth"."uid"()) OR ("status" = 'waiting'::"text")));



CREATE POLICY "couples_update_member_or_join" ON "public"."couples" FOR UPDATE USING ((("owner_user_id" = "auth"."uid"()) OR ("partner_user_id" = "auth"."uid"()) OR (("status" = 'waiting'::"text") AND ("partner_user_id" IS NULL)))) WITH CHECK ((("owner_user_id" = "auth"."uid"()) OR ("partner_user_id" = "auth"."uid"())));



CREATE POLICY "couples_update_member_or_join" ON "public"."date_planner_couples" FOR UPDATE USING ((("owner_user_id" = "auth"."uid"()) OR ("partner_user_id" = "auth"."uid"()) OR (("status" = 'waiting'::"text") AND ("partner_user_id" IS NULL)))) WITH CHECK ((("owner_user_id" = "auth"."uid"()) OR ("partner_user_id" = "auth"."uid"())));



ALTER TABLE "public"."date_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "date_options_member_all" ON "public"."date_options" USING ((EXISTS ( SELECT 1
   FROM "public"."date_proposals" "p"
  WHERE (("p"."id" = "date_options"."proposal_id") AND "public"."is_couple_member"("p"."couple_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."date_proposals" "p"
  WHERE (("p"."id" = "date_options"."proposal_id") AND "public"."is_couple_member"("p"."couple_id")))));



CREATE POLICY "date_options_member_all" ON "public"."date_planner_options" USING ((EXISTS ( SELECT 1
   FROM "public"."date_planner_proposals" "p"
  WHERE (("p"."id" = "date_planner_options"."proposal_id") AND "public"."is_couple_member"("p"."couple_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."date_planner_proposals" "p"
  WHERE (("p"."id" = "date_planner_options"."proposal_id") AND "public"."is_couple_member"("p"."couple_id")))));



ALTER TABLE "public"."date_planner_ai_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_planner_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_planner_couples" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_planner_option_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_planner_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_planner_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_planner_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."date_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "date_proposals_member_all" ON "public"."date_planner_proposals" USING ("public"."is_couple_member"("couple_id")) WITH CHECK ("public"."is_couple_member"("couple_id"));



CREATE POLICY "date_proposals_member_all" ON "public"."date_proposals" USING ("public"."is_couple_member"("couple_id")) WITH CHECK ("public"."is_couple_member"("couple_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_self" ON "public"."notifications" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_select_self" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_self" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."option_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "option_comments_member_all" ON "public"."date_planner_comments" USING ((EXISTS ( SELECT 1
   FROM ("public"."date_planner_options" "o"
     JOIN "public"."date_planner_proposals" "p" ON (("p"."id" = "o"."proposal_id")))
  WHERE (("o"."id" = "date_planner_comments"."option_id") AND "public"."is_couple_member"("p"."couple_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."date_planner_options" "o"
     JOIN "public"."date_planner_proposals" "p" ON (("p"."id" = "o"."proposal_id")))
  WHERE (("o"."id" = "date_planner_comments"."option_id") AND "public"."is_couple_member"("p"."couple_id")))));



CREATE POLICY "option_comments_member_all" ON "public"."option_comments" USING ((EXISTS ( SELECT 1
   FROM ("public"."date_options" "o"
     JOIN "public"."date_proposals" "p" ON (("p"."id" = "o"."proposal_id")))
  WHERE (("o"."id" = "option_comments"."option_id") AND "public"."is_couple_member"("p"."couple_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."date_options" "o"
     JOIN "public"."date_proposals" "p" ON (("p"."id" = "o"."proposal_id")))
  WHERE (("o"."id" = "option_comments"."option_id") AND "public"."is_couple_member"("p"."couple_id")))));



CREATE POLICY "option_preferences_couple_read" ON "public"."date_planner_option_preferences" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."date_planner_options" "o"
     JOIN "public"."date_planner_proposals" "p" ON (("p"."id" = "o"."proposal_id")))
  WHERE (("o"."id" = "date_planner_option_preferences"."option_id") AND "public"."is_couple_member"("p"."couple_id")))));



CREATE POLICY "option_preferences_own" ON "public"."date_planner_option_preferences" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."date_planner_profiles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self_or_couple_partner" ON "public"."date_planner_profiles" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("couple_id" IN ( SELECT "date_planner_couples"."id"
   FROM "public"."date_planner_couples"
  WHERE (("date_planner_couples"."owner_user_id" = "auth"."uid"()) OR ("date_planner_couples"."partner_user_id" = "auth"."uid"()))))));



CREATE POLICY "profiles_update_self" ON "public"."date_planner_profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reactions_delete" ON "public"."reactions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "reactions_insert" ON "public"."reactions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "reactions_select" ON "public"."reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."date_cards" "dc"
     JOIN "public"."date_planner_profiles" "p" ON (("p"."couple_id" = "dc"."couple_id")))
  WHERE (("dc"."id" = "reactions"."card_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "reactions_update" ON "public"."reactions" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."soft_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "soft_messages_delete_own" ON "public"."soft_messages" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "soft_messages_insert_own" ON "public"."soft_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "soft_messages_select_couple" ON "public"."soft_messages" FOR SELECT USING (("couple_id" IN ( SELECT "date_planner_couples"."id"
   FROM "public"."date_planner_couples"
  WHERE (("date_planner_couples"."owner_user_id" = "auth"."uid"()) OR ("date_planner_couples"."partner_user_id" = "auth"."uid"())))));



CREATE POLICY "soft_messages_update_own" ON "public"."soft_messages" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "본인 memories 삭제" ON "public"."date_memories" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "본인 memories 삽입" ON "public"."date_memories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "본인 memories 수정" ON "public"."date_memories" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "본인 preferences 삽입" ON "public"."user_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "본인 preferences 수정" ON "public"."user_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "본인 preferences 조회" ON "public"."user_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "커플 멤버 memories 조회" ON "public"."date_memories" FOR SELECT USING (("couple_id" IN ( SELECT "date_planner_profiles"."couple_id"
   FROM "public"."date_planner_profiles"
  WHERE ("date_planner_profiles"."user_id" = "auth"."uid"()))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."date_options";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."date_planner_comments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."date_planner_option_preferences";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."date_planner_options";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."date_planner_proposals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."date_proposals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."option_comments";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."couple_partner"("p_couple_id" "text", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."couple_partner"("p_couple_id" "text", "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_couple_member"("target_couple_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_couple_member"("target_couple_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_couple_member"("target_couple_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_card"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_card"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_reaction"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_reaction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."ai_suggestion_requests" TO "anon";
GRANT ALL ON TABLE "public"."ai_suggestion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_suggestion_requests" TO "service_role";



GRANT ALL ON TABLE "public"."bucket_list" TO "anon";
GRANT ALL ON TABLE "public"."bucket_list" TO "authenticated";
GRANT ALL ON TABLE "public"."bucket_list" TO "service_role";



GRANT ALL ON TABLE "public"."bucket_reactions" TO "anon";
GRANT ALL ON TABLE "public"."bucket_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."bucket_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."couples" TO "anon";
GRANT ALL ON TABLE "public"."couples" TO "authenticated";
GRANT ALL ON TABLE "public"."couples" TO "service_role";



GRANT ALL ON TABLE "public"."date_cards" TO "anon";
GRANT ALL ON TABLE "public"."date_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."date_cards" TO "service_role";



GRANT ALL ON TABLE "public"."date_memories" TO "anon";
GRANT ALL ON TABLE "public"."date_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."date_memories" TO "service_role";



GRANT ALL ON TABLE "public"."date_options" TO "anon";
GRANT ALL ON TABLE "public"."date_options" TO "authenticated";
GRANT ALL ON TABLE "public"."date_options" TO "service_role";



GRANT ALL ON TABLE "public"."date_planner_ai_requests" TO "anon";
GRANT ALL ON TABLE "public"."date_planner_ai_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."date_planner_ai_requests" TO "service_role";



GRANT ALL ON TABLE "public"."date_planner_comments" TO "anon";
GRANT ALL ON TABLE "public"."date_planner_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."date_planner_comments" TO "service_role";



GRANT ALL ON TABLE "public"."date_planner_couples" TO "anon";
GRANT ALL ON TABLE "public"."date_planner_couples" TO "authenticated";
GRANT ALL ON TABLE "public"."date_planner_couples" TO "service_role";



GRANT ALL ON TABLE "public"."date_planner_option_preferences" TO "anon";
GRANT ALL ON TABLE "public"."date_planner_option_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."date_planner_option_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."date_planner_options" TO "anon";
GRANT ALL ON TABLE "public"."date_planner_options" TO "authenticated";
GRANT ALL ON TABLE "public"."date_planner_options" TO "service_role";



GRANT ALL ON TABLE "public"."date_planner_profiles" TO "anon";
GRANT ALL ON TABLE "public"."date_planner_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."date_planner_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."date_planner_proposals" TO "anon";
GRANT ALL ON TABLE "public"."date_planner_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."date_planner_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."date_proposals" TO "anon";
GRANT ALL ON TABLE "public"."date_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."date_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."option_comments" TO "anon";
GRANT ALL ON TABLE "public"."option_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."option_comments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reactions" TO "anon";
GRANT ALL ON TABLE "public"."reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."reactions" TO "service_role";



GRANT ALL ON TABLE "public"."soft_messages" TO "anon";
GRANT ALL ON TABLE "public"."soft_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."soft_messages" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";


