import sys, zipfile
from pathlib import Path
from lxml import etree

# --layout=nt004 (default): XSD of 09/02/2026 (ZIP). --layout=nt009r1: NT 009 release 1 (docs/referencias/rtc/).
layout = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--layout=')), 'nt004')
if layout == 'nt004':
    archive = Path('docs/referencias/esquemas/nfse-esquemas_xsd-v1-01-20260209.zip')
    with zipfile.ZipFile(archive) as z:
        sources = {Path(name).name: z.read(name) for name in z.namelist()
                   if name.startswith('Schemas/1.01/') and name.endswith('.xsd')}
elif layout == 'nt009r1':
    # Official release 1 files, read as they are: the series defect was fixed by the government in this release.
    sources = {f.name: f.read_bytes() for f in Path('docs/referencias/rtc').glob('*.xsd')}
    if b'value="[0-9]{1,4}|[0-8][0-9]{4}"' not in sources['tiposSimples_v1.01.xsd']:
        raise RuntimeError('Padrão de série do release 1 mudou; revisar.')
else:
    raise RuntimeError('Leiaute não suportado: ' + layout)

parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
fixed_key = layout == 'nt009r1' and '--chave-corrigida' in sys.argv
if fixed_key:
    # Official defect (confirmed by the owner with an independent validator): TSChaveNFSe admits letters at
    # positions 7-20, but the CNPJ occupies 10-23 (as TSIdNFSe, TSIdDPS, TSIdPedRegEvt and TSIdEvento state).
    # Approved: correct ONLY this pattern, in memory and only when requested; the files stay intact.
    original = sources['tiposSimples_v1.01.xsd']
    old = b'value="[0-9]{6}([0-9A-Z]{14})[0-9]{30}"'
    if original.count(old) != 1:
        raise RuntimeError('Padrão oficial de TSChaveNFSe mudou; revisar correção isolada da chave.')
    sources['tiposSimples_v1.01.xsd'] = original.replace(old, b'value="[0-9]{9}([0-9A-Z]{14})[0-9]{27}"', 1)
if layout == 'nt004' and '--official' not in sys.argv:
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
# --schema=pedRegEvento validates event requests; the default root is the DPS.
root = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--schema=')), 'DPS') + '_v1.01.xsd'
if root not in ('DPS_v1.01.xsd', 'pedRegEvento_v1.01.xsd'):
    raise RuntimeError('Esquema não suportado: ' + root)
schema = etree.XMLSchema(etree.fromstring(sources[root], parser, base_url='memory:///' + root))
for file in [arg for arg in sys.argv[1:] if not arg.startswith('--')]:
    # Separate parser: the in-memory schema resolver is not used for XML input.
    document = etree.parse(file, etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False))
    schema.assertValid(document)
    if layout == 'nt009r1':
        print(Path(file).name + ': XSD 1.01 válido (NT 009 release 1, ' + ('TSChaveNFSe corrigido somente em memória)' if fixed_key else 'oficial)'))
    else:
        print(Path(file).name + ': XSD 1.01 válido' + (' (original)' if '--official' in sys.argv else ' (série corrigida somente em memória)'))