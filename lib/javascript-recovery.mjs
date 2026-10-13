import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha, LIMITS, parseSource } from './javascript-model.mjs';
import { embeddedSources,sourceMapDeclaration,rewriteSource,inlineSourceMap,loadSourceMapSections,localMapReference } from './javascript-sourcemaps.mjs';
import { discoverBundleModules } from './javascript-bundles.mjs';
import { composeSourceMaps } from './javascript-mapchain.mjs';

async function receipt(file) { const bytes=await fs.readFile(file);return {path:file,sha256:sha(bytes),bytes:bytes.length}; }
function contained(root,name) {
  const result=path.resolve(root,name),relative=path.relative(root,result);
  if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||name.includes('\0'))throw Object.assign(new Error('Recovery output path escapes selected directory'),{code:'UNSAFE_RECOVERY_PATH'});
  return result;
}
async function recover(args,ctx) {
  const input=path.resolve(args.path),out=path.resolve(args.output_directory),stat=await fs.lstat(input);
  if(!stat.isFile()||stat.isSymbolicLink())throw Object.assign(new Error('Recovery input must be a regular source file'),{code:'INVALID_SOURCE'});
  if(out===input || path.relative(input,out).startsWith(path.sep))throw Object.assign(new Error('Invalid output directory'),{code:'INVALID_OUTPUT'});
  const bytes=await ctx.read(input,{maxBytes:LIMITS.fileBytes}),hash=sha(bytes),text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  // Exclusive directory creation prevents overwriting prior evidence or following existing output links.
  await fs.mkdir(out,{recursive:false});
  const warnings=[],modules=[],rawOriginals=[],limitations=['Recovery retains observed bytes and embedded sources; runtime equivalence is unknown','Source-map names are treated as metadata and never used to read arbitrary files'];
  const options={extraction_mode:args.extraction_mode??'structural',rewrite_level:args.rewrite_level??'standard'};
  try {
    await fs.mkdir(contained(out,'original'));await fs.mkdir(contained(out,'sources'));
    const sourceCopy=contained(out,'original/input.bin');await fs.writeFile(sourceCopy,bytes,{flag:'wx'});
    const published=await receipt(sourceCopy),source={path:input,sha256:hash,bytes:bytes.length,snapshot_path:sourceCopy,published_copy:published};
    let map=null,mapBytes=null,mapPath=null;
    let declared=null;
    if(!/\.map$/i.test(input))try {declared=sourceMapDeclaration(text,input).url;}catch(error){warnings.push({filename:path.basename(input),kind:'syntax',is_error:true,message:error.message});}
    if(/\.map$/i.test(input)){map=JSON.parse(text.replace(/^\uFEFF/,''));mapBytes=bytes;mapPath=input;}
    else if(declared?.startsWith('data:')) {
      const inline=inlineSourceMap(declared);mapBytes=inline.bytes;map=inline.map;mapPath=`${input}#inline-source-map`;
    }else if(declared) {
      if(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(declared))warnings.push({filename:path.basename(input),kind:'external-map',is_error:false,message:'Remote source maps are not fetched'});
      else {
        const candidate=contained(path.dirname(input),decodeURIComponent(declared.split(/[?#]/)[0]));
        const real=await fs.realpath(candidate);if(path.relative(path.dirname(input),real).startsWith('..'))throw new Error('Source map symlink escapes input directory');
        mapBytes=await ctx.read(real,{maxBytes:LIMITS.fileBytes});map=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(mapBytes));mapPath=real;
      }
    }
    let sourceMapReceipt=null,expandedMapReceipt=null,collected=null,composition=null,composedMapReceipt=null;const sectionMapReceipts=[],chainMapReceipts=[];
    if(map){
      const rootDirectory=path.dirname(input),readMap=async(reference,base)=>{
        const localBase=base.startsWith('file:')?fileURLToPath(base):base,logicalBase=localBase==='inline'?path.basename(input):path.relative(rootDirectory,localBase).replaceAll('\\','/'),logical=localMapReference(reference,logicalBase),candidate=contained(rootDirectory,logical),real=await fs.realpath(candidate),relative=path.relative(rootDirectory,real);
        if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Source map symlink escapes input directory');
        return {path:real,bytes:await ctx.read(real,{maxBytes:LIMITS.fileBytes})};
      },expanded=await loadSourceMapSections(map,{mapPath,signal:ctx.signal,readMap});
      collected=embeddedSources(expanded.map,{mapPath,mapPaths:expanded.mapPaths});
      const outputMap=contained(out,'original/source.map');await fs.writeFile(outputMap,mapBytes,{flag:'wx'});sourceMapReceipt=await receipt(outputMap);limitations.push(...collected.limitations);
      for(const capture of expanded.captures){const output=contained(out,`original/section-${String(sectionMapReceipts.length).padStart(4,'0')}.map`);await fs.writeFile(output,capture.bytes,{flag:'wx'});sectionMapReceipts.push({reported_path:capture.path,artifact:await receipt(output)});}
      if(expanded.captures.length){const output=contained(out,'original/expanded-source.map');await fs.writeFile(output,JSON.stringify(expanded.map),{flag:'wx'});expandedMapReceipt=await receipt(output);limitations.push('External section maps were captured from the input directory and separately retained; expanded-source.map embeds their captured maps without changing the raw map receipts');}
      composition=await composeSourceMaps(expanded.map,{mapPath,mapPaths:expanded.mapPaths,rootBytes:mapBytes,readMap,signal:ctx.signal,initialCaptures:expanded.captures});
      for(const capture of composition.captures){const output=contained(out,`original/chain-${String(chainMapReceipts.length).padStart(4,'0')}.map`);await fs.writeFile(output,capture.bytes,{flag:'wx'});chainMapReceipts.push({reported_path:capture.path,artifact:await receipt(output)});}
      if(composition.chainMapCount){const output=contained(out,'original/composed-source.map');await fs.writeFile(output,composition.serializedMap,{flag:'wx'});composedMapReceipt=await receipt(output);}
      for(const d of composition.diagnostics)warnings.push({filename:d.source,kind:`chain-${d.kind}`,is_error:false,message:d.detail});
      if(composition.chainMapCount||composition.diagnostics.length)limitations.push('Chained maps compose declared coordinates through retained intermediate text; missing/ambiguous associations and generated-only positions remain explicit, and mapping composition does not establish execution equivalence');
    }
    async function add(name,content,extraction,range,reportedInput=mapPath??input,contextRanges=[],originalContent=content) {
      ctx.signal?.throwIfAborted();
      let rewrite={text:content,strategy:'verbatim-input',changed:false,syntaxDigest:null};
      try {rewrite=rewriteSource(content,name,options.rewrite_level);}catch(error){warnings.push({filename:name,kind:'rewrite-unavailable',is_error:true,message:error.message});}
      // Preserve each pre-transform original independently, including sourcesContent originals.
      const rawPath=contained(out,`original/${String(modules.length).padStart(4,'0')}-source.bin`);await fs.writeFile(rawPath,Buffer.from(originalContent),{flag:'wx'});rawOriginals.push(await receipt(rawPath));
      const safeBase=path.basename(name.replaceAll('\\','/')).replace(/[^A-Za-z0-9._-]/g,'_')||'source.js',target=contained(out,`sources/${String(modules.length).padStart(4,'0')}-${safeBase}`),buffer=Buffer.from(content);
      await fs.writeFile(target,Buffer.from(rewrite.text),{flag:'wx'});
      const provenance={reported_input:reportedInput,original_path:name,original_sha256:sha(Buffer.from(originalContent)),extraction:`${extraction};rewrite=${rewrite.strategy};raw=${rawPath}${rewrite.syntaxDigest?`;syntax_sha256=${rewrite.syntaxDigest}`:''}`,byte_ranges:range?[range]:[],context_byte_ranges:contextRanges,range_semantics:'half-open-utf8-bytes'};
      modules.push({reported_filename:name,reported_status:rewrite.changed?'recovered-transformed':'recovered-retained',artifact:await receipt(target),source_map:extraction==='verbatim-input'&&!rewrite.changed?sourceMapReceipt:null,provenance});
    }
    if(collected) {
      warnings.push(...collected.warnings.map(w=>({filename:w.source,kind:w.kind,is_error:false,message:w.message})));
      for(const original of collected.sources)if(original.content!==null)await add(original.source??`anonymous-source-${original.sourceIndex}.js`,original.content,'source-map-sourcesContent',null,`${mapPath}#${original.section}.sources[${original.sourceIndex}]`);
      const seenOriginals=new Set(collected.sources.map(s=>JSON.stringify([s.mapPath,s.section,s.sourceIndex])));
      for(const original of composition?.originals??[]){const key=JSON.stringify([original.mapPath,original.section,original.sourceIndex]);if(!seenOriginals.has(key)&&original.content!==null){seenOriginals.add(key);await add(original.source??`anonymous-source-${original.sourceIndex}.js`,original.content,'chained-source-map-sourcesContent',null,`${original.mapPath}#${original.section}.sources[${original.sourceIndex}]`);}}
    }
    const bundleCandidates=[];
    if(!/\.map$/i.test(input)) {
      try {const ast=parseSource(text,input);if(ast.errors.length)warnings.push({filename:path.basename(input),kind:'syntax',is_error:true,message:`Parser recovered ${ast.errors.length} error(s)`});}
      catch(error){warnings.push({filename:path.basename(input),kind:'syntax',is_error:true,message:error.message});}
      await add(path.basename(input),text,'verbatim-input',{start:0,end:bytes.length});
      if(options.extraction_mode!=='structural')try{
        const byteRange=(start,end)=>({start:Buffer.byteLength(text.slice(0,start)),end:Buffer.byteLength(text.slice(0,end))});
        for(const candidate of discoverBundleModules(text,input,options.extraction_mode)){
          const original=text.slice(candidate.start,candidate.end),name=`bundle-module-${candidate.key.replace(/[^A-Za-z0-9._-]/g,'_')}.js`,before=modules.length;
          await add(name,`(${original});\n`,`${candidate.discovery};parenthesized-wrapper-candidate`,byteRange(candidate.start,candidate.end),input,[byteRange(candidate.contextStart,candidate.contextEnd)],original);
          bundleCandidates.push({...candidate,artifact:modules[before].artifact,byte_range:byteRange(candidate.start,candidate.end),context_byte_range:byteRange(candidate.contextStart,candidate.contextEnd)});
        }
      }catch(error){ctx.signal?.throwIfAborted();warnings.push({filename:path.basename(input),kind:'bundle-discovery',is_error:true,message:error.message});}
    }
    limitations.push('Rewrites remove selected parsed comments, preserve original copies and require unchanged parsed-program digests; debugger/source-text reflection and tool annotations may still differ');
    limitations.push('The source revision identifies own files as read; loaded-module revision is not independently attested');
    if(options.extraction_mode!=='structural')limitations.push('Literal wrapper candidates are preserved as parenthesized functions with byte-range/context provenance; wrapper parameters, loader behavior, module identities and execution equivalence remain unverified');
    const provenanceFile=contained(out,'provenance.json'),manifestFile=contained(out,'manifest.json'),reportFile=contained(out,'report.json');
    await fs.writeFile(provenanceFile,JSON.stringify(modules.map(m=>m.provenance),null,2),{flag:'wx'});
    await fs.writeFile(manifestFile,JSON.stringify({schema:'IndependentJavaScriptRecovery',input_sha256:hash,options,captured_source_map:sourceMapReceipt,captured_section_maps:sectionMapReceipts,captured_chain_maps:chainMapReceipts,expanded_source_map:expandedMapReceipt,source_map_composition:composition?{artifact:composedMapReceipt,status:composition.complete?'complete-within-retained-maps':'partial',chain_map_count:composition.chainMapCount,composed_segment_count:composition.composedSegments.length,diagnostics:composition.diagnostics}:null,raw_originals:rawOriginals,bundle_candidates:bundleCandidates,modules},null,2),{flag:'wx'});
    await fs.writeFile(reportFile,JSON.stringify({modules:modules.length,warnings,limitations},null,2),{flag:'wx'});
    const sourceUnits=await Promise.all(['./javascript-recovery.mjs','./javascript-sourcemaps.mjs','./javascript-mapdecode.mjs','./javascript-mapchain.mjs','./javascript-bundles.mjs','./javascript-model.mjs'].map(relative=>receipt(fileURLToPath(new URL(relative,import.meta.url))))),revision=sha(sourceUnits.map(unit=>({file:path.basename(unit.path),sha256:unit.sha256}))),executable=await receipt(process.execPath);
    const result={source,engine:{id:'real-independent-source-recovery',version:'1.1.0',executable,audited_source_revision:revision,executed_source_revision:null},options,status:warnings.length||options.extraction_mode!=='structural'?'partial':'complete',detected_formats:[map?collected.indexed?'source-map-v3-indexed':'source-map-v3':'javascript'],reported_safety:'Original bytes retained; parsed-program digests checked for transformed outputs; no recovered code executed',reported_strategy:`embedded-original-and-input-recovery;rewrite=${options.rewrite_level}`,reported_format:map?collected.indexed?'source-map-v3-indexed':'source-map-v3':'javascript',total:modules.length,failed:warnings.filter(w=>w.is_error).length,modules,warnings,report:await receipt(reportFile),provenance:await receipt(provenanceFile),manifest:await receipt(manifestFile),analysis_input:modules.length?{input_path:contained(out,'sources'),format:'directory'}:null,runtime_equivalence:'unknown',limitations};
    return ctx.evidence('recover_javascript_sources',args,result,{confidence:'derived',authority:'shipped-artifact',limitations});
  } catch(error) {
    // Leave the exclusive output and raw snapshot available for diagnosis; never erase previously emitted evidence.
    error.details={...(error.details??{}),partial_output_directory:out};throw error;
  }
}
export const recoveryHandlers={recover_javascript_sources:recover};
