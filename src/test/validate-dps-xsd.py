import sys, tempfile, zipfile
from pathlib import Path
from lxml import etree

archive = Path('docs/referencias/esquemas/nfse-esquemas_xsd-v1-01-20260209.zip')
with tempfile.TemporaryDirectory() as folder:
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if name.startswith('Schemas/1.01/') and name.endswith('.xsd'):
                Path(folder, Path(name).name).write_bytes(z.read(name))
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
    schema = etree.XMLSchema(etree.parse(str(Path(folder, 'DPS_v1.01.xsd')), parser))
    known_issue = '--known-series-issue' in sys.argv
    for file in [arg for arg in sys.argv[1:] if not arg.startswith('--')]:
        document = etree.parse(file, parser)
        valid = schema.validate(document)
        if not valid and known_issue:
            errors = list(schema.error_log)
            if not errors or any("}serie'" not in e.message or "^0{0,4}" not in e.message for e in errors):
                raise RuntimeError('\n'.join(e.message for e in errors))
            print(Path(file).name + ': BLOQUEADO pelo padrão oficial de serie; demais campos sem erros XSD')
            continue
        if not valid:
            raise RuntimeError('\n'.join(e.message for e in schema.error_log))
        print(Path(file).name + ': XSD 1.01 válido')