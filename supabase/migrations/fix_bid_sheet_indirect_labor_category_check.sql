-- Allow custom_ prefix in bid_sheet_indirect_labor.category
-- Run this in the Supabase SQL Editor.

ALTER TABLE bid_sheet_indirect_labor
  DROP CONSTRAINT IF EXISTS bid_sheet_indirect_labor_category_check;

ALTER TABLE bid_sheet_indirect_labor
  ADD CONSTRAINT bid_sheet_indirect_labor_category_check CHECK (
    category = ANY(ARRAY[
      'project_management',
      'document_coordinator',
      'project_controls',
      'travel_living_project',
      'travel_living_fat',
      'additional_indirect'
    ])
    OR (category LIKE 'custom_%' AND length(category) <= 64)
  );
