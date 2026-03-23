-- ─────────────────────────────────────────────────────────────────────────────
-- Security Fixes
-- 1. Security Definer Views → Security Invoker
-- 2. Function Search Path Mutable → fixed search_path
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix Security Definer Views ────────────────────────────────────────────
-- Views with SECURITY DEFINER bypass RLS and use the view creator's permissions.
-- Setting security_invoker = true enforces the calling user's RLS policies.

ALTER VIEW public.submission_ready    SET (security_invoker = true);
ALTER VIEW public.open_positions      SET (security_invoker = true);
ALTER VIEW public.robustness_status   SET (security_invoker = true);
ALTER VIEW public.current_net_worth   SET (security_invoker = true);

-- ── 2. Fix Function Search Path ───────────────────────────────────────────────
-- Functions without a fixed search_path are vulnerable to search_path injection.
-- Setting search_path = public prevents malicious schemas from hijacking calls.

ALTER FUNCTION public.check_combo_guard(p_combo_id uuid) SET search_path = public;
ALTER FUNCTION public.update_updated_at()                SET search_path = public;
ALTER FUNCTION public.trg_combo_guard_fn()               SET search_path = public;
ALTER FUNCTION public.handle_new_user()                  SET search_path = public;
ALTER FUNCTION public.handle_new_strategy()              SET search_path = public;
