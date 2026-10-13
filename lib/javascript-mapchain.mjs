import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LIMITS,sha } from './javascript-model.mjs';
import { decodeSourceMap,originalPositions,loadSourceMapSections,sourceMapDeclaration,inlineSourceMap } from './javascript-sourcemaps.mjs';
import { verifySourcePosition } from './javascript-mapdecode.mjs';

function capacity(message){throw Object.assign(new Error(message),{code:'RESOURCE_LIMIT'});}
const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encode(value){
  if(!Number.isInteger(value)||value< -2147483648||value>2147483647)capacity('Composed source-map delta exceeds 32-bit VLQ range');
  let magnitude=value===-2147483648?1:Math.abs(value)*2+Number(value<0),result='';
  do{const digit=magnitude%32;magnitude=Math.floor(magnitude/32);result+=chars[digit+(magnitude?32:0)];}while(magnitude);return result;
}
function virtualSource(source){
  if(source.source===null)return null;
  const prefix=source.sourceRoot?`${source.sourceRoot.replace(/\/$/,'')}/`:'',name=prefix+source.source,base=source.mapPath??'source.map';
  if(/^[a-z][a-z0-9+.-]*:/i.test(name)&&!(/^[a-z]:[\\/]/i.test(name)))return name;
  return /^[a-z]:[\\/]|^\//i.test(base)?path.resolve(path.dirname(base),name):path.posix.normalize(path.posix.join(path.posix.dirname(base),name));
}

/** Compose only map declarations found in retained intermediate text; no original filenames are opened. */
export async function composeSourceMaps(map,{mapPath,mapPaths=null,rootBytes=null,readMap,signal,maxDepth=32,maxBytes=LIMITS.bytes,maxSegments=LIMITS.astNodes,maxSources=LIMITS.files,initialCaptures=[]}={}){
  const captures=[],diagnostics=[],maps=[],byPath=new Map(),sourceChildren=new Map(),associations=new Map();let capturedBytes=initialCaptures.reduce((n,c)=>n+c.bytes.length,0),segmentsVisited=0,sourcesVisited=0,sourceContentBytes=0;
  const diagnostic=(kind,source,detail)=>{const d={kind,source:source?.source??'source-map',map_path:source?.mapPath??mapPath,detail};if(!diagnostics.some(existing=>JSON.stringify(existing)===JSON.stringify(d)))diagnostics.push(d);};
  function capture(record){capturedBytes+=record.bytes.length;if(capturedBytes>maxBytes)capacity('Chained source-map capture-byte budget exceeded');captures.push(record);}
  function register(record){
    segmentsVisited+=record.decoded.segments.length;sourcesVisited+=record.decoded.sources.length;
    if(segmentsVisited>maxSegments||sourcesVisited>maxSources||maps.length>=LIMITS.files)capacity('Chained source-map graph budget exceeded');
    maps.push(record);
    for(const source of record.decoded.sources){sourceContentBytes+=source.content===null?0:Buffer.byteLength(source.content);if(sourceContentBytes>maxBytes)capacity('Chained source-map original-text budget exceeded');const virtual=virtualSource(source);if(virtual!==null){const entries=associations.get(virtual)??[];entries.push(source);associations.set(virtual,entries);}}
  }
  function conflicting(source){const virtual=virtualSource(source),entries=virtual===null?[]:associations.get(virtual)??[],hashes=new Set(entries.filter(s=>s.content!==null).map(s=>sha(s.content)));return hashes.size>1;}
  async function discover(record,active,depth){
    signal?.throwIfAborted();if(depth>maxDepth)capacity('Chained source-map depth budget exceeded');
    for(const source of record.decoded.sources){
      signal?.throwIfAborted();
      if(source.content===null){diagnostic('missing-intermediate-text',source,'No retained source text is available to discover a downstream declaration');continue;}
      if(!source.content.includes('sourceMappingURL'))continue;
      let declared;
      try{declared=sourceMapDeclaration(source.content,source.source??'anonymous.js').url;}catch(error){diagnostic('unparsed-intermediate',source,error.message);continue;}
      if(!declared)continue;
      if(conflicting(source)){diagnostic('ambiguous-source-association',source,'Different retained bytes share one virtual original location; no downstream association is selected');sourceChildren.set(source,{issue:'ambiguous-source-association'});continue;}
      let captured,inline=null;
      try{
        if(declared.startsWith('data:')){inline=inlineSourceMap(declared);captured={path:`${virtualSource(source)??source.mapPath}#inline-chain:${source.section}:${source.sourceIndex}`,bytes:inline.bytes};}
        else {if(!readMap)throw new Error('No bounded map reader was supplied');if(virtualSource(source)===null)throw new Error('Anonymous original text cannot locate an external map');captured=await readMap(declared,virtualSource(source));}
        signal?.throwIfAborted();
        if(!captured||typeof captured.path!=='string'||!Buffer.isBuffer(captured.bytes))throw new Error('Map reader did not return captured bytes');
        if(captured.bytes.length>LIMITS.fileBytes)capacity('Chained source map exceeds per-file budget');
        const digest=sha(captured.bytes),prior=byPath.get(captured.path);
        if(prior&&prior.digest!==digest){capture(captured);prior.conflicting=true;diagnostic('conflicting-map-association',source,`One downstream map path returned conflicting captured digests ${prior.digest} and ${digest}`);sourceChildren.set(source,{issue:'conflicting-map-association'});continue;}
        if(active.has(captured.path)){diagnostic('map-chain-cycle',source,'A downstream map declaration cycles to an active map');sourceChildren.set(source,{issue:'map-chain-cycle'});continue;}
        if(prior){sourceChildren.set(source,{record:prior});continue;}
        capture(captured);
        const childMap=inline?.map??JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(captured.bytes)),expanded=await loadSourceMapSections(childMap,{mapPath:captured.path,readMap,signal,maxBytes:maxBytes-capturedBytes,maxDepth});
        for(const section of expanded.captures)capture(section);
        const child={path:captured.path,digest,decoded:decodeSourceMap(expanded.map,{mapPath:captured.path,mapPaths:expanded.mapPaths,maxDepth})};byPath.set(child.path,child);register(child);sourceChildren.set(source,{record:child});
        await discover(child,new Set(active).add(child.path),depth+1);
      }catch(error){signal?.throwIfAborted();if(error.code==='RESOURCE_LIMIT')throw error;diagnostic('downstream-map-unavailable',source,error.message);sourceChildren.set(source,{issue:'downstream-map-unavailable'});}
    }
  }
  const root={path:mapPath??'source.map',digest:sha(rootBytes??JSON.stringify(map)),decoded:decodeSourceMap(map,{mapPath,mapPaths,maxDepth})};byPath.set(root.path,root);register(root);await discover(root,new Set([root.path]),0);
  // Discovery precedes composition so a later conflicting association cannot leave an earlier branch silently selected.
  for(const record of maps)for(const source of record.decoded.sources)if(conflicting(source)&&sourceChildren.has(source)){sourceChildren.set(source,{issue:'ambiguous-source-association'});diagnostic('ambiguous-source-association',source,'Different retained bytes share one virtual original location; mapping composition remains unresolved');}
  const terminals=[],terminalByKey=new Map(),composed=[];let composedSteps=0;
  function terminal(source){const key=JSON.stringify([virtualSource(source),source.source,source.sourceRoot,source.content===null?null:sha(source.content)]);if(terminalByKey.has(key))return terminalByKey.get(key);if(terminals.length>=maxSources)capacity('Composed source-map source budget exceeded');terminalByKey.set(key,terminals.length);terminals.push(source);return terminals.length-1;}
  function expand(source,line,column,name,active,depth){
    signal?.throwIfAborted();if(++composedSteps>maxSegments||depth>maxDepth)capacity('Composed source-map traversal budget exceeded');
    const association=sourceChildren.get(source);
    if(source.content!==null){const position=verifySourcePosition(source,line,column);if(position.state!=='verified'){diagnostic(position.state==='outside-content'?'original-position-outside-content':'original-position-unverified',source,position.reason??'The mapped original position is outside retained source text');return [{sourceIndex:terminal(source),line,column,name,complete:false}];}}
    if(!association?.record)return [{sourceIndex:terminal(source),line,column,name,complete:!association?.issue&&source.content!==null}];
    const child=association.record;if(child.conflicting)return [{sourceIndex:terminal(source),line,column,name,complete:false}];if(active.has(child.path)){diagnostic('map-chain-cycle',source,'Mapping traversal cycles to an active map');return [{sourceIndex:terminal(source),line,column,name,complete:false}];}
    const positions=originalPositions(child.decoded,line,column);
    if(!positions.mappings.length){diagnostic('unmapped-intermediate',source,'No downstream mapping precedes this intermediate position');return [{sourceIndex:terminal(source),line,column,name,complete:false}];}
    if(positions.mappings.length>1)diagnostic('ambiguous-intermediate-position',source,'All downstream mappings at the selected generated position are retained');
    return positions.mappings.flatMap(mapping=>mapping.original?expand(mapping.source,mapping.original.line,mapping.original.column,mapping.name??name,new Set(active).add(child.path),depth+1):[{sourceIndex:null,line:null,column:null,name:null,complete:true}]);
  }
  for(const segment of root.decoded.segments){
    const originals=segment.original?expand(root.decoded.sources[segment.original.sourceIndex],segment.original.line,segment.original.column,segment.name,new Set([root.path]),0):[{sourceIndex:null,line:null,column:null,name:null,complete:true}];
    for(const original of originals){if(composed.length>=maxSegments)capacity('Composed source-map output segment budget exceeded');composed.push({generated:segment.generated,...original});}
  }
  const names=[],mappingChunks=[];let previousSource=0,previousLine=0,previousColumn=0,previousName=0,generatedLine=0,generatedColumn=0,lineHasMapping=false,mappingBytes=0;
  for(const segment of composed){const gap=segment.generated.line-generatedLine;if(gap>LIMITS.fileBytes-mappingBytes)capacity('Composed source-map encoded line budget exceeded');const separator=gap>0?';'.repeat(gap):lineHasMapping?',':'';if(gap){generatedColumn=0;lineHasMapping=false;}const values=[segment.generated.column-generatedColumn];
    if(segment.sourceIndex!==null){values.push(segment.sourceIndex-previousSource,segment.line-previousLine,segment.column-previousColumn);previousSource=segment.sourceIndex;previousLine=segment.line;previousColumn=segment.column;if(segment.name!==null){let index=names.indexOf(segment.name);if(index<0){index=names.length;names.push(segment.name);}values.push(index-previousName);previousName=index;}}
    const encoded=values.map(encode).join('');mappingBytes+=separator.length+encoded.length;if(mappingBytes>LIMITS.fileBytes)capacity('Composed source-map encoded-byte budget exceeded');mappingChunks.push(separator,encoded);generatedLine=segment.generated.line;generatedColumn=segment.generated.column;lineHasMapping=true;
  }
  signal?.throwIfAborted();
  const resultMap={version:3,...(typeof map.file==='string'?{file:map.file}:{}),sources:terminals.map(s=>{const virtual=virtualSource(s)??s.source;return typeof virtual==='string'&&/^[a-z]:[\\/]|^\//i.test(virtual)?pathToFileURL(virtual).href:virtual;}),sourcesContent:terminals.map(s=>s.content),names,mappings:mappingChunks.join(''),ignoreList:terminals.map((s,i)=>s.ignored?i:null).filter(i=>i!==null)};
  const serializedMap=JSON.stringify(resultMap);if(Buffer.byteLength(serializedMap)>LIMITS.fileBytes)capacity('Composed source-map file-byte budget exceeded');
  return {map:resultMap,serializedMap,captures,diagnostics,maps,originals:maps.flatMap(record=>record.decoded.sources),composedSegments:composed,complete:diagnostics.length===0&&composed.every(s=>s.complete),chainMapCount:maps.length-1};
}
