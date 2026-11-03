CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.normalize_municipality_name(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = '' AS $$ SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, value)) $$;
REVOKE ALL ON FUNCTION public.normalize_municipality_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_municipality_name(text) TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS municipalities_name_unaccent_trgm_idx ON public.municipalities USING gin (public.normalize_municipality_name(name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS municipalities_ibge_prefix_idx ON public.municipalities (ibge_code text_pattern_ops);
CREATE OR REPLACE FUNCTION public.search_municipality_catalog(search_term text) RETURNS SETOF public.municipalities LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT m.* FROM public.municipalities m
 WHERE char_length(btrim(search_term)) >= 2 AND CASE WHEN btrim(search_term) ~ '^[0-9]+$' THEN m.ibge_code LIKE btrim(search_term) || '%' ELSE public.normalize_municipality_name(m.name) LIKE '%' || replace(replace(replace(public.normalize_municipality_name(btrim(search_term)), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' END
 ORDER BY m.name, m.ibge_code LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.search_municipality_catalog(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_municipality_catalog(text) TO authenticated, service_role;