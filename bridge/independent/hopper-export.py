# Original Hopper public Python API exporter. Run only against an owned copy.
import json
doc = Document.getCurrentDocument()
if doc is None:
    raise RuntimeError('Hopper did not open the owned input copy')
segments = []
functions = []
symbols = []
instructions = []
references = []
for index in range(doc.getSegmentCount()):
    segment = doc.getSegment(index)
    start = segment.getStartingAddress()
    end = start + segment.getLength()
    segments.append({'name': segment.getName(), 'start': hex(start), 'end': hex(end), 'read': None, 'write': None, 'execute': None, 'initialized': True, 'overlay': False, 'address_space': 'ram'})
    for j in range(segment.getProcedureCount()):
        procedure = segment.getProcedure(j)
        address = procedure.getEntryPoint()
        name = segment.getNameAtAddress(address) or ('sub_' + format(address, 'x'))
        symbols.append({'address': hex(address), 'name': name, 'type': 'function', 'source': 'analysis', 'external': False})
        assembly = procedure.getAssembly()
        pseudo = procedure.getPseudoCode()
        functions.append({'address': hex(address), 'name': name, 'external': False, 'thunk': False, 'thunk_target': None, 'ranges': [], 'total_bytes': None, 'signature': None, 'locals': [], 'basic_blocks': [], 'pseudocode': pseudo, 'assembly_text': assembly, 'decompiler_error': None})
model = {'protocol': 'real-native-model-v1', 'provider': 'hopper', 'architecture': 'provider-unspecified', 'image_base': '0x0', 'format': 'hopper-document', 'language_id': 'hopper', 'compiler_spec_id': 'unspecified', 'segments': segments, 'functions': functions, 'symbols': symbols, 'instructions': instructions, 'references': references, 'strings': [], 'limitations': ['Hopper exporter currently collects public function assembly and pseudocode; instruction operands and typed references are not exported.', 'Empty ranges and basic blocks are unavailable, not evidence of empty function bodies.']}
with open(REAL_OUTPUT, 'x', encoding='utf-8') as stream:
    json.dump(model, stream)
