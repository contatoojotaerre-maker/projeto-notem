-- Fingerprints (SHA-256, never the values) of real identifiers that must never appear in the public documentation.
-- Read-only. Run it and paste the result into src/test/real-data-fingerprints.json ("hashes" by kind) after new real data.
-- Normalization: CNPJ/CPF/keys = uppercase without punctuation; e-mails = lowercase; prefixes as stored.
with v(kind,val) as (
 select 'cnpj', upper(regexp_replace(cnpj,'[^0-9A-Za-z]','','g')) from public.companies
 union select 'cnpj', upper(regexp_replace(cnpj,'[^0-9A-Za-z]','','g')) from public.company_certificates
 union select 'cnpj', upper(regexp_replace(provider_cnpj,'[^0-9A-Za-z]','','g')) from public.nfse_documents
 union select 'documento', upper(regexp_replace(taker_document,'[^0-9A-Za-z]','','g')) from public.nfse_documents where taker_document is not null
 union select 'documento', upper(regexp_replace(intermediary_document,'[^0-9A-Za-z]','','g')) from public.nfse_documents where intermediary_document is not null
 union select 'chave', upper(access_key) from public.invoices where access_key is not null
 union select 'chave', upper(access_key) from public.nfse_documents where access_key is not null
 union select 'chave', upper(access_key) from public.adn_distributions where access_key is not null
 union select 'prefixo', key_prefix from public.integration_keys
 union select 'prefixo', secret_prefix from public.webhook_endpoints where secret_prefix is not null
 union select 'email', lower(email) from public.companies where email is not null
)
select kind, count(*) n, json_agg(encode(sha256(convert_to(val,'UTF8')),'hex') order by val) hashes from v where coalesce(val,'')<>'' group by kind;
