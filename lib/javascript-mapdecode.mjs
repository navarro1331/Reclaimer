import path from 'node:path';
import { LIMITS } from './javascript-model.mjs';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function invalid(message,code='INVALID_SOURCE_MAP'){throw Object.assign(new Error(message),{code});}
const validPosition=p=>p&&Number.isSafeInteger(p.line)&&p.line>=0&&Number.isSafeInteger(p.column)&&p.column>=0;
export const compareMapPositions=(a,b)=>a.line-b.line||a.column-b.column;
function sum(a,b){const n=a+b;if(!Number.isSafeInteger(n)||n<0)invalid('Invalid or overflowing source-map coordinate/index');return n;}
function offsetPosition(p,o){return {line:sum(p.line,o.line),column:p.line===0?sum(p.column,o.column):p.column};}
function fields(segment){
  const result=[];let cursor=0;
  while(cursor<segment.length){
    let unsigned=0,multiplier=1,continued=true;
    while(continued){
      if(cursor===segment.length)invalid('Unterminated source-map VLQ');
      const digit=alphabet.indexOf(segment[cursor++]);if(digit<0)invalid('Invalid source-map VLQ character');
      unsigned+=(digit%32)*multiplier;
      // Source-map VLQs encode signed 32-bit quantities. Reject before JS precision loss.
      if(unsigned>0xffffffff)invalid('Source-map VLQ exceeds 32-bit encoding');
      continued=digit>=32;if(continued){multiplier*=32;if(multiplier>0x100000000)invalid('Source-map VLQ exceeds 32-bit encoding');}
    }
    const negative=unsigned%2===1,magnitude=Math.floor(unsigned/2);
    result.push(negative?(magnitude===0?-2147483648:-magnitude):magnitude);
  }
  if(![1,4,5].includes(result.length))invalid('A source-map segment must have 1, 4 or 5 fields');
  return result;
}

/** Strict v3 decoding. Positions are zero-based UTF-16 units; equal mapping positions retain ambiguity. */
export function decodeSourceMap(map,{maxSources=LIMITS.files,maxSegments=LIMITS.astNodes,maxDepth=32,mapPath=null,mapPaths=null}={}){
  const sources=[],segments=[],sections=[];let visits=0,indexed=false;
  function visit(value,offset={line:0,column:0},sectionPath=[],offsets=[],depth=0,base=mapPath){
    if(depth>maxDepth||++visits>LIMITS.files*2)invalid('Source-map nesting/section budget exceeded','RESOURCE_LIMIT');
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==3)invalid('Expected a version-3 source map');
    base=mapPaths?.get(value)??base;
    if(value.sections!==undefined){
      indexed=true;if(!Array.isArray(value.sections)||value.sources!==undefined||value.mappings!==undefined)invalid('Invalid indexed source-map structure');
      let previous=null,lastMapping=null;
      for(let i=0;i<value.sections.length;i++){
        const section=value.sections[i];if(!validPosition(section?.offset))invalid('Invalid source-map section offset');
        if(previous&&compareMapPositions(previous,section.offset)>=0)invalid('Indexed source-map offsets must be strictly increasing');
        const absolute=offsetPosition(section.offset,offset);
        if(lastMapping&&compareMapPositions(lastMapping,absolute)>0)invalid('Indexed source-map sections overlap mapped generated coordinates');
        if(section.url!==undefined)invalid('External indexed source-map sections are not fetched without an explicit bounded loader','UNSUPPORTED_MAP_REFERENCE');
        const start=segments.length;sections.push({position:absolute,sectionPath:[...sectionPath,i]});
        visit(section.map,absolute,[...sectionPath,i],[...offsets,section.offset],depth+1,base);
        for(let k=start;k<segments.length;k++)if(!lastMapping||compareMapPositions(segments[k].generated,lastMapping)>0)lastMapping=segments[k].generated;
        previous=section.offset;
      }
      return;
    }
    if(!Array.isArray(value.sources)||value.sources.some(s=>s!==null&&typeof s!=='string'))invalid('Invalid source names');
    if(typeof value.mappings!=='string'||value.names!==undefined&&(!Array.isArray(value.names)||value.names.some(n=>typeof n!=='string')))invalid('Invalid mappings/names');
    if(value.sourceRoot!==undefined&&value.sourceRoot!==null&&typeof value.sourceRoot!=='string')invalid('sourceRoot must be a string or null');
    if(value.sourcesContent!==undefined&&(!Array.isArray(value.sourcesContent)||value.sourcesContent.some(c=>c!==null&&typeof c!=='string')))invalid('sourcesContent must contain strings or nulls');
    const ignored=value.ignoreList??value.x_google_ignoreList??[];
    if(!Array.isArray(ignored)||ignored.some(i=>!Number.isSafeInteger(i)||i<0||i>=value.sources.length))invalid('Invalid source-map ignore-list index');
    const sourceStart=sources.length,names=value.names??[],section='root'+sectionPath.map(i=>`.sections[${i}]`).join('');
    if(sourceStart+value.sources.length>maxSources)invalid('Source-map declared source budget exceeded','RESOURCE_LIMIT');
    for(let i=0;i<value.sources.length;i++)sources.push({source:value.sources[i],sourceRoot:value.sourceRoot??null,content:value.sourcesContent?.[i]??null,sourceIndex:i,section,sectionPath,offsets,ignored:ignored.includes(i),mapPath:base});
    let source=0,originalLine=0,originalColumn=0,name=0,line=0;
    for(const encodedLine of value.mappings.split(';')){
      let column=0;
      if(encodedLine!=='')for(const segment of encodedLine.split(',')){
        if(segment==='')invalid('Empty source-map segment');
        const values=fields(segment);column=sum(column,values[0]);
        const generated=offsetPosition({line,column},offset);let original=null,reportedName=null;
        if(values.length>1){
          source=sum(source,values[1]);originalLine=sum(originalLine,values[2]);originalColumn=sum(originalColumn,values[3]);
          if(source>=value.sources.length)invalid('Source-map source index is outside sources');
          original={sourceIndex:sourceStart+source,line:originalLine,column:originalColumn};
          if(values.length===5){name=sum(name,values[4]);if(name>=names.length)invalid('Source-map name index is outside names');reportedName=names[name];}
        }
        if(segments.length>=maxSegments)invalid('Source-map segment budget exceeded','RESOURCE_LIMIT');
        segments.push({generated,original,name:reportedName,sectionPath});
      }
      line++;
    }
  }
  visit(map);segments.sort((a,b)=>compareMapPositions(a.generated,b.generated));
  return {sources,segments,sections,indexed,limitations:indexed?['Indexed overlap validation covers declared mapping points; unmapped generated section extents are not independently established']:[]};
}

/** Load only caller-authorized map references. URLs in sources never reach this loader. */
export async function loadSourceMapSections(map,{mapPath,readMap,maxBytes=LIMITS.bytes,maxDepth=32,signal}={}){
  const captures=[],active=new Set(),mapPaths=new WeakMap();let total=0,visits=0;
  async function visit(value,base,depth){
    signal?.throwIfAborted();if(depth>maxDepth||++visits>LIMITS.files*2)invalid('Source-map reference nesting/section budget exceeded','RESOURCE_LIMIT');
    if(!value||typeof value!=='object'||Array.isArray(value))invalid('Invalid source-map section object');
    if(value.sections===undefined){mapPaths.set(value,base);return value;}
    if(!Array.isArray(value.sections))invalid('Source-map sections must be an array');
    const sections=[];
    for(const section of value.sections){
      if(!section||typeof section!=='object')invalid('Invalid source-map section');
      if(section.url!==undefined){
        if(section.map!==undefined||typeof section.url!=='string'||!section.url)invalid('An external source-map section requires one nonempty URL and no map');
        if(!readMap)invalid('External indexed source-map sections are not fetched without an explicit bounded loader','UNSUPPORTED_MAP_REFERENCE');
        const loaded=await readMap(section.url,base);signal?.throwIfAborted();
        if(!loaded||typeof loaded.path!=='string'||!Buffer.isBuffer(loaded.bytes))invalid('Source-map loader did not return captured bytes');
        if(active.has(loaded.path))invalid('External indexed source-map reference cycle');
        total+=loaded.bytes.length;if(total>maxBytes)invalid('Source-map referenced-byte budget exceeded','RESOURCE_LIMIT');
        let child;try{child=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(loaded.bytes));}catch{invalid('External source map is not valid UTF-8 JSON');}
        captures.push(loaded);active.add(loaded.path);
        sections.push({offset:section.offset,map:await visit(child,loaded.path,depth+1)});active.delete(loaded.path);
      }else sections.push({...section,map:await visit(section.map,base,depth+1)});
    }
    const expanded={...value,sections};mapPaths.set(expanded,base);return expanded;
  }
  if(mapPath)active.add(mapPath);const expanded=await visit(map,mapPath,0);
  return {map:expanded,captures,mapPaths};
}

export function localMapReference(reference,base){
  if(typeof reference!=='string'||/^[a-z][a-z0-9+.-]*:|^\/\//i.test(reference))invalid('Only bounded local source-map references are supported','UNSUPPORTED_MAP_REFERENCE');
  let clean;try{clean=decodeURIComponent(reference.split(/[?#]/)[0]);}catch{invalid('Malformed source-map reference encoding');}
  if(!clean||clean.includes('\0')||clean.includes('\\')||path.posix.isAbsolute(clean)||/^[a-z]:/i.test(clean))invalid('Invalid local source-map reference','UNSUPPORTED_MAP_REFERENCE');
  return path.posix.normalize(path.posix.join(path.posix.dirname(base),clean));
}

export function utf16SourceOffset(text,line,column){
  if(typeof text!=='string'||!validPosition({line,column}))return null;
  const breaks=/\r\n|[\r\n\u2028\u2029]/g;let start=0,current=0,m;
  while(current<line&&(m=breaks.exec(text))){start=m.index+m[0].length;current++;}
  if(current!==line)return null;
  breaks.lastIndex=start;const end=breaks.exec(text)?.index??text.length;
  return column<=end-start?start+column:null;
}
const sourceLines=new WeakMap();
export function verifySourcePosition(source,line,column){
  if(source.content===null)return {offset:null,state:'unavailable'};
  let index=sourceLines.get(source);
  if(!index){index={starts:[0],ends:[],pattern:/\r\n|[\r\n\u2028\u2029]/g,complete:false};sourceLines.set(source,index);}
  while(index.ends.length<=line&&!index.complete&&index.ends.length<LIMITS.astNodes){const match=index.pattern.exec(source.content);if(match){index.ends.push(match.index);index.starts.push(match.index+match[0].length);}else{index.ends.push(source.content.length);index.complete=true;}}
  if(line>=index.ends.length&&!index.complete)return {offset:null,state:'unavailable',reason:'source-line-index-budget'};
  const start=index.starts[line],end=index.ends[line],offset=end!==undefined&&column<=end-start?start+column:null;
  return {offset,state:offset===null?'outside-content':'verified'};
}

/** ECMA-426 greatest-preceding-position lookup; all mappings at that exact position are retained. */
export function originalPositions(decoded,line,column){
  if(!validPosition({line,column}))invalid('Invalid generated source-map lookup position');
  const p={line,column},segments=decoded.segments;let low=0,high=segments.length;
  while(low<high){const mid=Math.floor((low+high)/2);if(compareMapPositions(segments[mid].generated,p)<=0)low=mid+1;else high=mid;}
  if(!low)return {matchedPosition:null,mappings:[]};
  const matchedPosition=segments[low-1].generated;let start=low-1;
  while(start&&compareMapPositions(segments[start-1].generated,matchedPosition)===0)start--;
  return {matchedPosition,mappings:segments.slice(start,low).map(segment=>{
    if(!segment.original)return {...segment,state:'generated-only',source:null,original:null};
    const source=(decoded.allSources??decoded.sources)[segment.original.sourceIndex],position=verifySourcePosition(source,segment.original.line,segment.original.column);
    return {...segment,state:'mapped',source,original:{...segment.original,offset:position.offset,contentPosition:position.state,...(position.reason?{verificationReason:position.reason}:{})}};
  })};
}
