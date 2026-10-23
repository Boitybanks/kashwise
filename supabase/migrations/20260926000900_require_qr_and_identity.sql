-- Cutover, applied once the app that sends codes and identity details is deployed:
-- remove the old entry points so a job can't start or finish without the customer's QR code,
-- and nobody can sign up without an ID number, gender and home address.
drop function if exists public.start_gig(uuid);
drop function if exists public.mark_gig_done(uuid);
drop function if exists public.create_account(text, text, text, text, text);
