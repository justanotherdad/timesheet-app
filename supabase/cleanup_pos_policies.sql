-- Cleanup script: Drop all existing policies on pos table
-- Run this FIRST if you're getting type mismatch errors
-- This will remove any broken policies from previous attempts

-- Drop all policies on pos table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'pos' 
        AND schemaname = 'public'
    ) LOOP
        BEGIN
            EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.pos';
            RAISE NOTICE 'Dropped policy: %', r.policyname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping policy %: %', r.policyname, SQLERRM;
        END;
    END LOOP;
END $$;

-- Verify all policies are dropped
SELECT 
    'Policies remaining on pos table:' as status,
    COUNT(*) as count
FROM pg_policies 
WHERE tablename = 'pos' 
AND schemaname = 'public';
