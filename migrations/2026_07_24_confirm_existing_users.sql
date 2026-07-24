-- 2026-07-24: Unblock users stuck on "Email not confirmed" at login.
--
-- Background: the old Add User flow fell back to an invite link whenever the
-- password box was left blank, creating the auth user with email_confirm=false.
-- Anyone who never clicked that link stayed unconfirmed, so Supabase rejected
-- their password sign-in with "Email not confirmed". Admins then used
-- "Set Password", which changed the password but did NOT confirm the address,
-- leaving them still locked out. Those users also could not rescue themselves,
-- because Supabase does not send recovery emails to unconfirmed addresses.
--
-- This backfill confirms only ACTIVE profiles. It grants no new access:
-- confirming an address does not create or change a password, so anyone who
-- never had one still cannot sign in. Deactivated users are skipped, and
-- already-confirmed users are untouched.

update auth.users u
set email_confirmed_at = now()
where u.email_confirmed_at is null
  and exists (
    select 1
    from public.user_profiles p
    where p.id = u.id
      and coalesce(p.active, true) = true
  );

-- Verify: should return 0 rows for active profiles.
-- select u.id, u.email
-- from auth.users u
-- join public.user_profiles p on p.id = u.id
-- where u.email_confirmed_at is null
--   and coalesce(p.active, true) = true;
