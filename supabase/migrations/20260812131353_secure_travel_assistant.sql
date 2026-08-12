revoke all on table public.assistant_threads from anon;
revoke all on table public.assistant_messages from anon;
revoke all on table public.assistant_proposals from anon;
revoke all on table public.assistant_graph_checkpoints from anon;
revoke all on table public.assistant_graph_writes from anon;

revoke all on function public.touch_assistant_thread() from public, anon, authenticated;
revoke all on function public.bump_day_revision() from public, anon, authenticated;
revoke all on function public.bump_day_own_revision() from public, anon, authenticated;

create index assistant_threads_owner_idx on public.assistant_threads (owner_id);
create index assistant_proposals_itinerary_idx on public.assistant_proposals (itinerary_id);
