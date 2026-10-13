import { LIMITS,parseSource,sha,canonical } from './javascript-model.mjs';
import { decodeSourceMap } from './javascript-mapdecode.mjs';
export { decodeSourceMap,loadSourceMapSections,localMapReference,originalPositions,utf16SourceOffset } from './javascript-mapdecode.mjs';

function invalid(message,code='INVALID_SOURCE_MAP'){throw Object.assign(new Error(message),{code});}
/** Recover embedded originals without treating declared names/URLs as filesystem authority. */
export function embeddedSources(map,{maxSources=LIMITS.files,maxBytes=LIMITS.bytes,maxDepth=32,mapPath=null,mapPaths=null}={}) {
  const decoded=decodeSourceMap(map,{maxDepth,mapPath,mapPaths}),sources=[],warnings=[];let retainedBytes=0,omitted=0;
  for(const original of decoded.sources){
    const bytes=original.content===null?0:Buffer.byteLength(original.content);
    if(sources.length>=maxSources||retainedBytes+bytes>maxBytes){omitted++;continue;}
    retainedBytes+=bytes;sources.push(original);
    if(original.content===null)warnings.push({source:original.source??`anonymous-source-${original.sourceIndex}`,kind:'missing-source',message:'No embedded original bytes are present'});
  }
  if(omitted)warnings.push({source:'source-map',kind:'resource-limit',message:`Omitted ${omitted} originals at recovery limits`});
  return {...decoded,allSources:decoded.sources,sources,warnings,omitted,retainedBytes};
}
export function sourceMapDeclaration(text,filename,parsed=null) {
  const ast=parsed??parseSource(text,filename);
  if(ast.errors.length)invalid('Source-map comment discovery requires a parsed input','INVALID_SOURCE_SYNTAX');
  const comments=ast.comments??[];
  const directive=comments.map(comment=>({comment,match:/^\s*[@#]\s*sourceMappingURL\s*=\s*(\S+)\s*$/.exec(comment.value)})).filter(x=>x.match).at(-1);
  return {url:directive?.match[1]??null,ast};
}
export function inlineSourceMap(url) {
  const match=/^data:application\/json(?:;charset=utf-8)?(;base64)?,(.*)$/i.exec(url);
  if(!match)invalid('Unsupported inline source-map media type or encoding','UNSUPPORTED_MAP_ENCODING');
  let bytes;
  try {if(match[1]){if(!/^[A-Za-z0-9+/]*={0,2}$/.test(match[2])||match[2].length%4===1)invalid('Invalid inline source-map base64');bytes=Buffer.from(match[2],'base64');}else bytes=Buffer.from(decodeURIComponent(match[2]));}
  catch(error){if(error.code)throw error;invalid('Malformed inline source-map data encoding');}
  if(bytes.length>LIMITS.fileBytes)invalid('Inline source map exceeds the per-file budget','RESOURCE_LIMIT');
  let map;try{map=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{invalid('Inline source map is not valid UTF-8 JSON');}
  return {map,bytes};
}
function programValue(value) {
  if(Array.isArray(value))return value.map(programValue);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['loc','start','end','extra','errors','comments','tokens','leadingComments','trailingComments','innerComments'].includes(key)).map(([key,v])=>[key,programValue(v)]));
}
export const syntaxDigest=ast=>sha(programValue(ast.program??ast));
/** Remove selected comments only; preserve line terminators and token-separating whitespace. */
export function rewriteSource(text,filename,level) {
  if(level==='minimal')return {text,strategy:'verbatim-input',changed:false,syntaxDigest:null};
  const ast=parseSource(text,filename);if(ast.errors.length)invalid('Cannot rewrite input with parser-recovered errors','INVALID_SOURCE_SYNTAX');
  const selected=(ast.comments??[]).filter(c=>{
    if(/^\s*[@#]\s*sourceMappingURL\s*=/.test(c.value))return true;
    return level==='aggressive'&&!/^!|@(?:license|preserve|cc_on)|[#@]__(?:PURE|NO_SIDE_EFFECTS)__|sourceURL\s*=|(?:copyright|SPDX-License-Identifier|\blicen[cs](?:e|ed|ing)\b|permission is (?:hereby )?granted|redistribution and use|all rights reserved|eslint|ts-|istanbul|webpack|vite|rollup)/i.test(c.value);
  });
  let transformed=text;
  for(const c of selected.sort((a,b)=>b.start-a.start))transformed=transformed.slice(0,c.start)+text.slice(c.start,c.end).replace(/[^\r\n\u2028\u2029]/g,' ')+transformed.slice(c.end);
  const next=parseSource(transformed,filename),before=syntaxDigest(ast),after=syntaxDigest(next);
  if(next.errors.length||before!==after)invalid('Comment transformation changed the parsed program','REWRITE_MISMATCH');
  return {text:transformed,strategy:level==='standard'?'mapping-comment-removal':'ordinary-comment-removal',changed:transformed!==text,syntaxDigest:before};
}
