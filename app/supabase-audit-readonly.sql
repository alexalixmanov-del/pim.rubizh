-- Только чтение. Запускать в SQL Editor своего проекта.
-- Это проверка конфигурации, не заменяет проверку под anon/личными токенами.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where (schemaname='public' and tablename in ('pim_kv','pim_admins','site_catalog','site_products'))
 or (schemaname='storage' and tablename='objects');
select n.nspname, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('pim_kv','pim_admins','site_catalog','site_products');
select id, public from storage.buckets where id='pim-docs';
select count(*) as allowed_employee_count from public.pim_admins;
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='pim_kv';
select trigger_name, event_manipulation, action_statement from information_schema.triggers where event_object_schema='public' and event_object_table='pim_kv';
