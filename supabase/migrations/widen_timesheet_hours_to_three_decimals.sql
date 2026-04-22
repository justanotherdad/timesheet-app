-- Migration: Widen timesheet hour columns from NUMERIC(10,2) to NUMERIC(10,3)
-- Run this in the Supabase SQL Editor.
--
-- Problem:
--   The day-hour columns (mon_hours..sun_hours) and total_hours on
--   timesheet_entries and timesheet_unbillable are NUMERIC(10,2). When an
--   employee enters 3-decimal hours (e.g. 6.789) and saves or submits, Postgres
--   silently rounds to 2 decimals (6.79), even though the client-side code
--   (normalizeTimesheetHours, step="0.001" inputs, formatHoursDigits) fully
--   supports 3 decimals. This migration widens the scale to 3 so the extra
--   precision is preserved end-to-end.
--
-- Safety:
--   Existing rows are preserved exactly. A value stored as 6.78 simply becomes
--   6.780 under the new scale — no rounding, no data loss. Budget/report code
--   that reads these columns continues to work unchanged (formatHoursAmount /
--   formatHoursDigits auto-switch between 2 and 3 decimals based on the
--   thousandths digit).
--
-- Implementation notes:
--   * total_hours is a STORED GENERATED column whose expression references the
--     day-hour columns, so Postgres blocks ALTER TYPE on the day columns while
--     the generated column exists. We therefore:
--       1. DROP total_hours (remembering whether it existed and its expression).
--       2. Widen every day-hour column to NUMERIC(10,3).
--       3. Re-add total_hours as NUMERIC(10,3) GENERATED ALWAYS AS (sum) STORED.
--   * If a future schema changes total_hours to a plain (non-generated) column
--     or removes it entirely, the DO block handles those cases too.

BEGIN;

DO $$
DECLARE
  tbl          TEXT;
  col          TEXT;
  had_total    BOOLEAN;
  is_generated CHAR;
  sum_expr CONSTANT TEXT :=
    'mon_hours + tue_hours + wed_hours + thu_hours + fri_hours + sat_hours + sun_hours';
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['timesheet_entries', 'timesheet_unbillable'])
  LOOP
    -- 1. Drop total_hours first (if it exists) so the day columns can be altered.
    SELECT TRUE, a.attgenerated
      INTO had_total, is_generated
      FROM pg_attribute a
      JOIN pg_class     c ON c.oid = a.attrelid
     WHERE c.relname  = tbl
       AND a.attname  = 'total_hours'
       AND a.attnum   > 0
       AND NOT a.attisdropped;

    IF had_total THEN
      EXECUTE format('ALTER TABLE %I DROP COLUMN total_hours', tbl);
    END IF;

    -- 2. Widen each day-hour column to NUMERIC(10,3) (plain columns, safe to alter).
    FOR col IN SELECT unnest(ARRAY[
      'mon_hours','tue_hours','wed_hours','thu_hours','fri_hours','sat_hours','sun_hours'
    ])
    LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = tbl AND column_name = col
      ) THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC(10,3)', tbl, col);
      END IF;
    END LOOP;

    -- 3. Re-add total_hours with the new scale. Preserve GENERATED if it was generated;
    --    otherwise re-add as a plain NUMERIC column (no backfill needed — table empty
    --    of unseen data is not a concern since day columns still hold the source values).
    IF had_total THEN
      IF is_generated = 's' THEN
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN total_hours NUMERIC(10,3) GENERATED ALWAYS AS (%s) STORED',
          tbl, sum_expr
        );
      ELSE
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN total_hours NUMERIC(10,3)',
          tbl
        );
        -- Backfill for non-generated case.
        EXECUTE format('UPDATE %I SET total_hours = %s', tbl, sum_expr);
      END IF;
    END IF;

    -- Reset loop-local flags for the next table.
    had_total    := FALSE;
    is_generated := NULL;
  END LOOP;
END$$;

COMMIT;

-- Verification query (run after the migration to confirm scale = 3 on all 16 columns):
--
-- SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
--   FROM information_schema.columns
--  WHERE table_name IN ('timesheet_entries','timesheet_unbillable')
--    AND column_name LIKE '%_hours'
--  ORDER BY table_name, column_name;
