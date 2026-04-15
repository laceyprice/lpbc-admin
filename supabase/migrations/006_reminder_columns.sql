-- Update reminder columns: change from 24h/12h to 12h/1h
-- Drop old 24h column if it exists, add 1h column

-- Rename reminder_24_sent → handled by adding new column
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_1_sent BOOLEAN DEFAULT false;

-- Drop old column if it exists (24h reminders no longer used)
ALTER TABLE appointments DROP COLUMN IF EXISTS reminder_24_sent;

-- Ensure reminder_12_sent exists (it should already)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_12_sent BOOLEAN DEFAULT false;
