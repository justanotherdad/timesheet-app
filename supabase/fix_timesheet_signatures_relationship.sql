-- Fix relationship between weekly_timesheets and timesheet_signatures
-- This ensures Supabase can properly join these tables

-- Step 1: Check if timesheet_signatures table exists and has timesheet_id column
DO $$
BEGIN
  -- Check if the column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'timesheet_signatures' 
    AND column_name = 'timesheet_id'
  ) THEN
    RAISE EXCEPTION 'timesheet_signatures.timesheet_id column does not exist';
  END IF;
END $$;

-- Step 2: Check if foreign key constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'timesheet_signatures'
    AND kcu.column_name = 'timesheet_id'
    AND kcu.table_name = 'timesheet_signatures'
  ) THEN
    -- Create the foreign key constraint if it doesn't exist
    ALTER TABLE timesheet_signatures
    ADD CONSTRAINT timesheet_signatures_timesheet_id_fkey
    FOREIGN KEY (timesheet_id)
    REFERENCES weekly_timesheets(id)
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Created foreign key constraint: timesheet_signatures_timesheet_id_fkey';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists';
  END IF;
END $$;

-- Step 3: Check if signer_id column exists and has foreign key to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'timesheet_signatures' 
    AND column_name = 'signer_id'
  ) THEN
    RAISE EXCEPTION 'timesheet_signatures.signer_id column does not exist';
  END IF;
  
  -- Check if foreign key to user_profiles exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'timesheet_signatures'
    AND kcu.column_name = 'signer_id'
    AND kcu.table_name = 'timesheet_signatures'
  ) THEN
    -- Create the foreign key constraint if it doesn't exist
    ALTER TABLE timesheet_signatures
    ADD CONSTRAINT timesheet_signatures_signer_id_fkey
    FOREIGN KEY (signer_id)
    REFERENCES user_profiles(id)
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Created foreign key constraint: timesheet_signatures_signer_id_fkey';
  ELSE
    RAISE NOTICE 'Foreign key constraint for signer_id already exists';
  END IF;
END $$;

-- Verification: Show all foreign keys for timesheet_signatures
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'timesheet_signatures'
ORDER BY tc.constraint_name;
