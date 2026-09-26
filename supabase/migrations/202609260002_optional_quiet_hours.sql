-- Quiet hours are an optional organization preference, not a default sending block.
alter table organizations
add column quiet_hours_enabled boolean not null default false;

