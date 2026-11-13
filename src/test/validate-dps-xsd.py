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
    for file in sys.argv[1:]:
        document = etree.parse(file, parser)
        schema.assertValid(document)
        print(Path(file).name + ': XSD 1.01 válido')