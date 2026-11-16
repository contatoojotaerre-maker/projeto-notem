-- note_amount was used only by the old org_notes_summary (amount column removed); no function, view, index,
-- policy, trigger, default, constraint or scheduled job depends on it.
DROP FUNCTION IF EXISTS public.note_amount(text);