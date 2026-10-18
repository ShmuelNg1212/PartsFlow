-- Private storage for original documents (plan T1.5). Rules: R-DOC-1, R-DATA-5.
-- Object path: {shop_id}/{document_id}/{file name}. Members read and upload. Nobody changes or deletes from a client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Returns the document id when the path is {shop}/{document}/{file}, the document is in that shop,
-- and the caller is a member. Malformed paths return null instead of raising a cast error.
create function public.document_file_access(p_name text, p_require_draft boolean default false)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if auth.uid() is null or array_length(v_parts, 1) <> 3 or coalesce(v_parts[3], '') = ''
     or v_parts[1] !~ v_uuid or v_parts[2] !~ v_uuid then
    return false;
  end if;
  return exists (
    select 1 from public.documents d
    where d.id = v_parts[2]::uuid and d.shop_id = v_parts[1]::uuid
      and (not p_require_draft or d.status = 'draft')
      and public.is_member(d.shop_id)
  );
end $$;

revoke execute on function public.document_file_access(text, boolean) from public, anon;
grant execute on function public.document_file_access(text, boolean) to authenticated;

create policy documents_files_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.document_file_access(name));

create policy documents_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.document_file_access(name, true));
