-- ═══════════════════════════════════════════════════════════════
-- "Uncollectible" invoices (bad debt / write-offs).
-- Adds the status, plus when/why it was written off and what status to restore to.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════
alter table invoices add column if not exists written_off_at timestamptz;
alter table invoices add column if not exists write_off_reason text;
alter table invoices add column if not exists status_before_write_off text;

-- Allow the new status. NOT VALID = checked for new/changed rows only, so an odd old row can't block this.
alter table invoices drop constraint if exists invoices_invoice_status_check;
alter table invoices add constraint invoices_invoice_status_check
  check (invoice_status in ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'approved', 'void', 'uncollectible')) not valid;
