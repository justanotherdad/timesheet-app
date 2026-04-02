-- Optional description per system on a bid sheet (for scope notes, etc.)
ALTER TABLE bid_sheet_systems
  ADD COLUMN IF NOT EXISTS description TEXT;
