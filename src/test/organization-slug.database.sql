-- Run against the database; always rolls back. Expects: RAISE 'OK'.
DO $$ DECLARE u uuid; a text; b text; c text; BEGIN
SELECT id INTO u FROM public.profiles LIMIT 1;
INSERT INTO public.organizations(name,type,created_by) VALUES('Grupo  Jotá & Cia. Serviços Profissionais Integrados','company',u) RETURNING slug INTO a;
INSERT INTO public.organizations(name,type,created_by) VALUES('Grupo  Jotá & Cia. Serviços Profissionais Integrados','company',u) RETURNING slug INTO b;
INSERT INTO public.organizations(name,slug,type,created_by) VALUES('OneDesp','escolhido','partner',u) RETURNING slug INTO c;
IF a !~ '^grupo-jota-cia-servicos-profis-[a-hj-km-np-z2-9]{6}$' THEN RAISE EXCEPTION 'FAIL base/suffix %',a; END IF;
IF a = b THEN RAISE EXCEPTION 'FAIL duplicate names must get distinct slugs'; END IF;
IF c !~ '^onedesp-[a-hj-km-np-z2-9]{6}$' THEN RAISE EXCEPTION 'FAIL client slug must be ignored %',c; END IF;
RAISE EXCEPTION 'OK';
END $$;
