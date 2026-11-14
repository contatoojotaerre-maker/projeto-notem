import sys, zipfile
from pathlib import Path
from lxml import etree

archive = Path('docs/referencias/esquemas/nfse-esquemas_xsd-v1-01-20260209.zip')
with zipfile.ZipFile(archive) as z:
    sources = {Path(name).name: z.read(name) for name in z.namelist()
               if name.startswith('Schemas/1.01/') and name.endswith('.xsd')}

parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
if '--official' not in sys.argv:
    # Official defect: ^/$ are literals in XSD regex, not anchors. The owner
    # approved correcting ONLY TSSerieDPS in memory. Never edit the official ZIP
    # or suppress validation errors; all documents must fully validate.
    original = sources['tiposSimples_v1.01.xsd']
    tree = etree.fromstring(original, parser)
    patterns = tree.xpath("//xs:simpleType[@name='TSSerieDPS']/xs:restriction/xs:pattern",
                          namespaces={'xs': 'http://www.w3.org/2001/XMLSchema'})
    if len(patterns) != 1 or patterns[0].get('value') != r'^0{0,4}\d{1,5}$':
        raise RuntimeError('Padrão oficial mudou; revisar correção isolada da série.')
    old = b'value="^0{0,4}\\d{1,5}$"'
    if original.count(old) != 1:
        raise RuntimeError('Correção deve afetar exatamente um padrão.')
    sources['tiposSimples_v1.01.xsd'] = original.replace(old, b'value="0{0,4}\\d{1,5}"', 1)

class MemorySchemas(etree.Resolver):
    def resolve(self, url, public_id, context):
        name = url.rsplit('/', 1)[-1]
        if name not in sources:
            raise RuntimeError('Referência XSD não reconhecida: ' + name)
        return self.resolve_string(sources[name], context, base_url='memory:///' + name)

parser.resolvers.add(MemorySchemas())
schema = etree.XMLSchema(etree.fromstring(sources['DPS_v1.01.xsd'], parser,
                                         base_url='memory:///DPS_v1.01.xsd'))
for file in [arg for arg in sys.argv[1:] if not arg.startswith('--')]:
    # Separate parser: the in-memory schema resolver is not used for XML input.
    document = etree.parse(file, etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False))
    schema.assertValid(document)
    print(Path(file).name + ': XSD 1.01 válido' + (' (original)' if '--official' in sys.argv else ' (série corrigida somente em memória)'))