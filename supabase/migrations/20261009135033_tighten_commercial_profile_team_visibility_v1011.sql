-- Migration applied to production by Supabase on 2026-10-09.
-- Migration version: 20261009135033
-- Security: previously any signed-in user could read every commercial_profiles row.
-- Retain necessary access for self, central admin, team managers and existing
-- special access to the central profile via the other established policies.
DROP POLICY IF EXISTS nv72_commercial_profiles_select ON public.commercial_profiles;

CREATE POLICY nv1011_commercial_profiles_team_select
ON public.commercial_profiles
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND public.nv800_can_view_user(user_id)
);
