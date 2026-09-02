-- Multi-recipient signature requests + placed signature fields.
--
--  signers : jsonb array of
--    { id, name, email, token, status('pending'|'signed'|'declined'),
--      signed_at, signature_data, ip_address }
--  fields  : jsonb array of placed fields
--    { id, signer_id, page, x, y, w, h, type('signature'|'initials'|'date') }
--            x/y/w/h are fractions (0..1) of the page box.
--
-- Legacy single-signer columns (signer_name, signer_email, token,
-- signature_data, signed_at) stay in place and mirror the first signer, so
-- existing rows and old links keep working.

alter table signature_requests
  add column if not exists signers jsonb not null default '[]'::jsonb,
  add column if not exists fields  jsonb not null default '[]'::jsonb;
