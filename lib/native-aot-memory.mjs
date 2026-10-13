import { hex } from './artifact-binary.mjs';

export const AOT_LIMIT = 16 * 1024 * 1024;
export const inRange = (buffer, offset, size) => Number.isSafeInteger(offset) && Number.isSafeInteger(size) && offset >= 0 && size >= 0 && offset + size <= buffer.length;
export function checkAotSignal(signal) { signal?.throwIfAborted(); }
export function aotBound(value, fallback, maximum, name) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) throw new Error(`NativeAOT ${name} bound is invalid`);
  return selected;
}
export function aotRecoveryBudget(options={}) {
  const limits={bytes:aotBound(options.maxTotalBytes,AOT_LIMIT,AOT_LIMIT,'aggregate byte'),commands:aotBound(options.maxTotalCommands,1000000,1000000,'aggregate command'),types:aotBound(options.maxTotalTypes,10000,10000,'aggregate type'),instances:aotBound(options.maxTotalObjects,10000,10000,'aggregate instance'),fields:aotBound(options.maxTotalFields,100000,100000,'aggregate field'),candidates:aotBound(options.maxTotalCandidates,10000,10000,'aggregate candidate')};
  const used=Object.fromEntries(Object.keys(limits).map(key=>[key,0]));
  const check=(kind,count)=>{if(used[kind]+count>limits[kind])throw Object.assign(new Error(`NativeAOT aggregate ${kind} budget exceeded`),{code:'capacity'});};
  return {limits,used,check,take(kind,count=1){check(kind,count);used[kind]+=count;}};
}
const addressValue = value => typeof value === 'string' && value.length<=19 && /^0x[0-9a-f]+$/i.test(value) && BigInt(value)<=(1n<<64n) ? BigInt(value) : null;

// File mappings and reconstructed memory remain separate. An overlapping mapping
// never gains priority merely because it was added later.
export function aotMemory(bytes, segments = [], derived = null) {
  const maps = segments.flatMap(segment => {
    const start = addressValue(segment.start);
    if (start === null || !Number.isSafeInteger(segment.file_offset) || !Number.isSafeInteger(segment.file_size) || !inRange(bytes, segment.file_offset, segment.file_size)) return [];
    const reportedEnd = addressValue(segment.end), fileEnd = start + BigInt(segment.file_size);
    return [{ ...segment, address: start, fileEnd, memoryEnd: reportedEnd !== null && reportedEnd >= start ? (reportedEnd > fileEnd ? reportedEnd : fileEnd) : fileEnd }];
  });
  const fileMatches = (address, size) => maps.filter(map => address >= map.address && address + BigInt(size) <= map.fileEnd);
  const derivedMatches = (address, size) => derived && address >= derived.address && address + BigInt(size) <= derived.address + BigInt(derived.bytes.length);
  function locate(address, size = 1) {
    if (!Number.isSafeInteger(size) || size < 0) return null;
    address = BigInt(address);
    const matched = fileMatches(address, size), reconstructed = derivedMatches(address, size);
    if (matched.length + Number(!!reconstructed) !== 1) return null;
    if (reconstructed) return { source: 'rehydrated-memory', offset: Number(address - derived.address), buffer: derived.bytes, file_offset: null };
    const map = matched[0], offset = map.file_offset + Number(address - map.address);
    return { source: 'source-file', offset, buffer: bytes, file_offset: offset };
  }
  return {
    maps,
    locate,
    read(address, size) { const found = locate(address, size); return found ? found.buffer.subarray(found.offset, found.offset + size) : null; },
    tail(address) {
      const matches = fileMatches(BigInt(address), 1);
      if (matches.length !== 1 || derivedMatches(BigInt(address), 1)) return null;
      const map = matches[0], offset = map.file_offset + Number(BigInt(address) - map.address);
      return bytes.subarray(offset, Math.min(map.file_offset + map.file_size, offset + AOT_LIMIT));
    },
    executable(address) { return maps.filter(map => address >= map.address && address < map.memoryEnd).length === 1 && maps.some(map => address >= map.address && address < map.memoryEnd && map.execute === true); },
    containsDestination(address, size) {
      const end = address + BigInt(size);
      return maps.filter(map => address >= map.address && end <= map.memoryEnd).length === 1 && !maps.some(map => address < map.fileEnd && end > map.address && map.file_size > 0);
    },
    describe(address, size) {
      const found = locate(address, size);
      return found ? { address: hex(address), size_bytes: size, source: found.source, file_offset: found.file_offset } : null;
    },
  };
}
