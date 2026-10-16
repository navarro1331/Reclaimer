# Independent exporter using Hopper's documented public Python scripting API.
# Run against an owned document copy. Unknown reference semantics stay explicit.
import itertools
import json

limits = []
text_bytes = 0
model_bytes = 0
work = 0

def limitation(message):
    if message not in limits and len(limits) < 128:
        limits.append(message)
    elif len(limits) == 128:
        limits.append('Additional bounded export limitations omitted')

def charge():
    global work
    work += 1
    if work > 2000000:
        raise RuntimeError('Hopper export exceeds two million traversal records')

def text(value):
    global text_bytes
    if value is None:
        return None
    if not isinstance(value, str):
        raise RuntimeError('Hopper returned non-text metadata')
    text_bytes += len(value.encode('utf-8'))
    if text_bytes > 16 * 1024 * 1024:
        raise RuntimeError('Hopper text export exceeds sixteen MiB')
    return value

def retain(collection, row):
    global model_bytes
    model_bytes += len(json.dumps(row).encode('utf-8'))
    if model_bytes > 64 * 1024 * 1024:
        raise RuntimeError('Hopper export exceeds sixty-four MiB')
    collection.append(row)

def count(value, maximum, label):
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise RuntimeError('Invalid Hopper ' + label + ' count')
    if value > maximum:
        limitation(label + ' inventory truncated at ' + str(maximum))
    return min(value, maximum)

def address(value):
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 0xffffffffffffffff:
        raise RuntimeError('Invalid Hopper address')
    return hex(value)

def optional(obj, method, default=None):
    function = getattr(obj, method, None)
    return function() if callable(function) else default

doc = Document.getCurrentDocument()
if doc is None:
    raise RuntimeError('Hopper did not open the owned input copy')
segments, functions, symbols, instructions, references, strings = [], [], [], [], [], []
reference_keys, instruction_keys = set(), set()
architecture = None
all_starts = []

def reference(source, target, kind='unclassified', call=False):
    charge()
    key = (source, target, kind)
    if key in reference_keys:
        return
    if len(references) >= 1000000:
        raise RuntimeError('Hopper reference export exceeds one million records')
    reference_keys.add(key)
    retain(references, {'source': address(source), 'target': address(target), 'type': kind,
                       'call': call, 'flow': call, 'jump': False, 'data': False, 'read': False,
                       'write': False, 'indirect': False, 'computed': False, 'conditional': False,
                       'terminal': False, 'primary': False, 'operand_index': -1, 'external': False})

for index in range(count(doc.getSegmentCount(), 4096, 'segment')):
    charge()
    segment = doc.getSegment(index)
    start, length = segment.getStartingAddress(), segment.getLength()
    address(start)
    if not isinstance(length, int) or isinstance(length, bool) or length < 0:
        raise RuntimeError('Invalid Hopper segment extent')
    end = start + length
    all_starts.append(start)
    retain(segments, {'name': text(segment.getName()), 'start': address(start), 'end': address(end),
                     'read': None, 'write': None, 'execute': None, 'initialized': True,
                     'overlay': False, 'address_space': 'ram'})
    for j in range(count(segment.getProcedureCount(), 10000 - len(functions), 'function')):
        charge()
        procedure = segment.getProcedureAtIndex(j)
        entry = procedure.getEntryPoint()
        name = text(segment.getNameAtAddress(entry)) or ('sub_' + format(entry, 'x'))
        retain(symbols, {'address': address(entry), 'name': name, 'type': 'function', 'source': 'analysis', 'external': False})
        blocks, ranges, assembly, locals_ = [], [], [], []
        block_count = optional(procedure, 'getBasicBlockCount')
        complete_blocks = isinstance(block_count, int) and 0 <= block_count <= 4096
        if block_count is not None:
            for k in range(count(block_count, 4096, 'basic-block')):
                charge()
                block = procedure.getBasicBlock(k)
                low, high = block.getStartingAddress(), block.getEndingAddress()
                if not start <= low < high <= end:
                    raise RuntimeError('Hopper basic block is outside its segment')
                successors = []
                for successor in range(count(block.getSuccessorCount(), 4096, 'successor')):
                    charge()
                    successors.append(address(block.getSuccessorAddressAtIndex(successor)))
                retain(blocks, {'start': address(low), 'end': address(high), 'successors': successors})
                ranges.append((low, high))
                current = low
                while current < high:
                    charge()
                    instruction = segment.getInstructionAtAddress(current)
                    if instruction is None:
                        limitation('Instruction unavailable at ' + address(current))
                        break
                    size = instruction.getInstructionLength()
                    if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= 64 or current + size > high:
                        raise RuntimeError('Invalid Hopper instruction extent')
                    key = (entry, current)
                    if key not in instruction_keys:
                        if len(instructions) >= 1000000:
                            raise RuntimeError('Hopper instruction export exceeds one million records')
                        instruction_keys.add(key)
                        line = text(instruction.getInstructionString())
                        assembly.append(address(current) + ' ' + line)
                        operands = []
                        for operand in range(count(instruction.getArgumentCount(), 64, 'operand')):
                            charge()
                            operands.append({'index': operand, 'raw': text(instruction.getRawArgument(operand)),
                                             'provider_type': None, 'components': [], 'memory_addressing': 'unavailable'})
                        raw = segment.readBytes(current, size)
                        if isinstance(raw, str):
                            raw = raw.encode('latin1')
                        if not isinstance(raw, bytes) or len(raw) != size:
                            raise RuntimeError('Hopper instruction bytes are unavailable or short')
                        jump = bool(instruction.isAConditionalJump() or instruction.isAnInconditionalJump())
                        retain(instructions, {'address': address(current), 'procedure': address(entry), 'bytes': raw.hex(),
                                              'length': size, 'mnemonic': line.split(None, 1)[0] if line else '', 'text': line,
                                              'operands': operands, 'flow': {'kind': 'jump' if jump else 'unknown',
                                              'conditional': bool(instruction.isAConditionalJump()), 'computed': False, 'direct_destinations': []}})
                        if architecture is None:
                            architecture = text(instruction.stringForArchitecture(instruction.getArchitecture()))
                        if callable(getattr(segment, 'getReferencesFromAddress', None)):
                            for ref_index, target in enumerate(itertools.islice(segment.getReferencesFromAddress(current) or [], 4097)):
                                if ref_index == 4096:
                                    limitation('Per-instruction reference inventory truncated at 4096')
                                    break
                                reference(current, target)
                    current += size
        else:
            limitation('Basic-block metadata unavailable for ' + address(entry))
        merged = []
        for low, high in sorted(ranges):
            if merged and low <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], high)
            else:
                merged.append([low, high])
        for variable in itertools.islice(optional(procedure, 'getLocalVariableList', []) or [], 4097):
            charge()
            if len(locals_) >= 4096:
                limitation('Local-variable inventory truncated at 4096')
                break
            variable_name, displacement = text(variable.name()), variable.displacement()
            locals_.append({'description': variable_name, 'provenance': 'hopper-local-variable', 'name': variable_name,
                            'stack_displacement': str(displacement) if isinstance(displacement, int) else None})
        for ref_index, ref in enumerate(itertools.islice(optional(procedure, 'getAllCallees', []) or [], 1000001)):
            if ref_index == 1000000:
                raise RuntimeError('Hopper call-reference traversal exceeds one million records')
            reference(ref.fromAddress(), ref.toAddress(), 'hopper-call:' + str(ref.type()), True)
        pseudo = text(optional(procedure, 'decompile'))
        retain(functions, {'address': address(entry), 'name': name, 'classification_available': False, 'external': None, 'thunk': None, 'thunk_target': None,
                           'ranges': [{'start': address(a), 'end': address(b)} for a, b in merged] if complete_blocks else [],
                           'total_bytes': sum(b - a for a, b in merged) if complete_blocks else None,
                           'signature': text(optional(procedure, 'signatureString')), 'locals': locals_, 'basic_blocks': blocks,
                           'pseudocode': pseudo, 'assembly_text': '\n'.join(assembly), 'decompiler_error': None if pseudo is not None else 'Public decompiler returned no result'})
    if callable(getattr(segment, 'getStringCount', None)):
        for j in range(count(segment.getStringCount(), 100000 - len(strings), 'string')):
            charge()
            value = text(segment.getStringAtIndex(j))
            retain(strings, {'address': address(segment.getStringAddressAtIndex(j)), 'value': value,
                             'length': len(value.encode('utf-8')), 'encoding': 'provider-string'})

for message in ['Unclassified Hopper reference addresses do not establish read/write/indirectness or SSA edges.',
                'Hopper signatures, strings and pseudocode are provider analysis, not original source or live runtime values.',
                'Image base, segment permissions, complete type layouts, loaded-image identity and pre-provider source identity remain unavailable.']:
    limitation(message)
model = {'protocol': 'real-native-model-v1', 'provider': 'hopper', 'architecture': architecture or 'provider-unspecified',
         'image_base': None, 'format': 'hopper-document', 'language_id': 'hopper',
         'compiler_spec_id': 'unspecified', 'segments': segments, 'functions': functions, 'symbols': symbols,
         'instructions': instructions, 'references': references, 'strings': strings, 'limitations': list(dict.fromkeys(limits))}
encoded = json.dumps(model)
if len(encoded.encode('utf-8')) > 64 * 1024 * 1024:
    raise RuntimeError('Hopper model export exceeds sixty-four MiB')
with open(REAL_OUTPUT, 'x', encoding='utf-8') as stream:
    stream.write(encoded)
