import { createHash } from "node:crypto";
import { readFile, lstat, realpath, open } from "node:fs/promises";
import { execFile } from "node:child_process";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { channel } from "node:diagnostics_channel";
import { tools, outputSchema, validate, resolveSchema } from "./contracts.mjs";

export const VERSION = "0.2.0";
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Value has no JSON representation");
  return encoded;
}
export const digest = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : canonical(value)).digest("hex");
export const identifier = (prefix, value) => prefix + "_" + digest(value);
export class InvestigationError extends Error {
  constructor(code, operation, message, details = {}) {
    super(message);
    this.name = "InvestigationError";
    this.code = code;
    this.operation = operation;
    this.details = details;
  }
}
export function errorResult(cause, operation) {
  const missing=cause.code==='ENOENT'||cause.code==='ENOTDIR';
  const invalid=cause.code==='input'||missing&&operation!=='open_binary';
  const unsupported=cause.code==='unavailable';
  const code=invalid?'invalid_request':missing?'target_unavailable':unsupported?'capability_unavailable':cause.code==='capacity'?'resource_constraint':cause.name==='AbortError'||cause.code==='cancelled'?'operation_cancelled':'operation_failed';
  const category=invalid?'invalid_input':missing?'unavailable':unsupported?'unsupported_provider':cause.code==='capacity'?'resource_constraint':'operation_failure';
  const details={operation,...(cause.details??{}),...(cause.path?{path:cause.path}:{})};
  if(invalid&&details.validation_errors)details.issues=details.validation_errors.map(e=>({path:[...e.instancePath.split('/').filter(Boolean),...(e.params?.missingProperty?[e.params.missingProperty]:[])],reason:e.keyword,message:e.message??'Invalid argument'}));
  return {error:{code,category,message:cause.message||String(cause),retryable:invalid,remediation:{action:cause.details?.remediation??(invalid?'Correct the listed arguments and retry.':missing?'Select a readable existing source path.':unsupported?'Configure the documented prerequisites.':'Inspect the reported operation failure before retrying.')},details}};
}
const execute = promisify(execFile);
export class Context {
  constructor({ config = {}, signal } = {}) {
    this.config = config;
    this.signal = signal;
    this.target = null;
    this.ledger = new Map();
    this.unknowns = new Map();
    this.handlers = {};
    this.client = null;
    this.protocolVersion = null;
    this.startedAt = new Date().toISOString();
    this.history = [];
  }
  schema(operation, field) { return outputSchema(operation, field); }
  resolve(node, root) { return resolveSchema(node, root); }
  hash(value) { return digest(value); }
  id(prefix, value) { return identifier(prefix, value); }
  unavailable(operation, reason, remediation) {
    throw new InvestigationError("unavailable", operation, reason, { reason: "prerequisite_unavailable", remediation: remediation ?? null });
  }
  async read(path, { maxBytes = 256 * 1024 * 1024 } = {}) {
    const absolute = resolve(path);
    const info = await lstat(absolute);
    if (!info.isFile()) throw new InvestigationError("input", "read", "Input must be a regular file", { input_path: absolute });
    if (info.size > maxBytes) throw new InvestigationError("capacity", "read", "Input exceeds the selected memory budget", { input_path: absolute, bytes: info.size, max_bytes: maxBytes });
    const handle=await open(absolute,'r');
    try{
      const chunks=[];let size=0;
      while(true){
        this.signal?.throwIfAborted();
        const buffer=Buffer.alloc(Math.min(1024*1024,maxBytes+1-size));
        const {bytesRead}=await handle.read(buffer,0,buffer.length,null);
        if(!bytesRead)break;
        size+=bytesRead;
        if(size>maxBytes)throw new InvestigationError("capacity","read","Input grew beyond the selected memory budget");
        chunks.push(buffer.subarray(0,bytesRead));
      }
      return Buffer.concat(chunks,size);
    }finally{await handle.close();}
  }
  async run(argv, { cwd, timeout = 60_000, env, maxBytes = 16 * 1024 * 1024, stdin } = {}) {
    if (!Array.isArray(argv) || !argv.length || argv.some((part) => typeof part !== "string" || part.includes("\0"))) throw new InvestigationError("input", "process", "Process argv must contain strings");
    if (stdin !== undefined && (typeof stdin !== "string" && !Buffer.isBuffer(stdin))) throw new InvestigationError("input", "process", "Process input must be captured text or bytes");
    if (stdin !== undefined && Buffer.byteLength(stdin) > 1024 * 1024 + 1) throw new InvestigationError("capacity", "process", "Process input exceeds the one MiB data-pipe bound");
    const running = execute(argv[0], argv.slice(1), {
      cwd, timeout, maxBuffer: maxBytes, shell: false, windowsHide: true,
      signal: this.signal,
      env: env ?? { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", TEMP: process.env.TEMP ?? "", TMP: process.env.TMP ?? "" },
      encoding: "utf8",
    });
    let delivery = Promise.resolve(null);
    if (stdin !== undefined) {
      // execFile's promisified result retains the owned ChildProcess. Input is
      // pipe data, never argv, shell text, a response file or an open-ended stream.
      running.child.stdin.on("error", () => {});
      delivery = new Promise(resolve => running.child.stdin.end(stdin, cause => resolve(cause ?? null)));
    }
    const result = await running;
    const inputFailure = await delivery;
    if (inputFailure) throw Object.assign(inputFailure, { stdout: result.stdout, stderr: result.stderr });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  }
  direct(operation, result) { return { result }; }
  async evidence(operation, parameters, normalizedResult, options = {}) {
    this.signal?.throwIfAborted();
    const path = parameters.input_path ?? parameters.path ?? this.target?.path;
    let subject = options.subject ?? null;
    if (!Object.hasOwn(options, "subject") && !subject && path) {
      try {
        const file = await realpath(path);
        const info = await lstat(file);
        if (info.isFile()) subject = { name: basename(file), digest: { sha256: digest(await this.read(file)) }, format: this.target?.format ?? "file", architecture: this.target?.architecture ?? null, local_path: file };
      } catch (cause) {
        if (cause.code === "capacity" || cause.name === "AbortError" || this.signal?.aborted) throw cause;
      }
    }
    const provider = options.provider ?? { id: "real-independent", name: "Reclaimer independent implementation", version: VERSION };
    const evidence = {
      evidence_id: "",
      subject,
      provider,
      analysis_profile: null,
      predicate_type: options.predicateType ?? operation.replaceAll("_", "-"),
      operation,
      parameters: structuredClone(parameters),
      raw_result: options.raw ?? null,
      normalized_result: normalizedResult,
      confidence: options.confidence ?? "derived",
      authority: options.authority ?? "shipped-artifact",
      environment: options.environment ?? { id: "local-node", platform: process.platform, architecture: process.arch, isolation: "process" },
      limitations: options.limitations ?? [],
      locations: options.locations ?? [],
      evidence_links: options.links ?? [],
    };
    evidence.evidence_id = identifier("ev", { protocol: 1, ...evidence, evidence_id: undefined });
    if(tools.has(operation)){
      const check=validate(operation,"output",evidence);
      if(!check.valid)throw new InvestigationError("contract",operation,"Evidence does not satisfy the public output contract",{validation_errors:check.errors});
    }
    this.signal?.throwIfAborted();
    if (options.publish !== false) this.ledger.set(evidence.evidence_id, structuredClone(evidence));
    return evidence;
  }
  async call(operation, args = {}) {
    if (this.signal?.aborted) throw new InvestigationError("cancelled", operation, "Request cancelled");
    const supplied = structuredClone(args);
    const input = validate(operation, "input", supplied);
    if (!input.valid) throw new InvestigationError("input", operation, "Request does not satisfy the public input contract", { validation_errors: input.errors });
    const handler = this.handlers[operation];
    if (!handler) this.unavailable(operation, "This operation has no completed implementation", "Consult the parity report");
    const result = await handler(supplied, this);
    if (this.signal?.aborted) throw new InvestigationError("cancelled", operation, "Request cancelled");
    const output = validate(operation, "output", result);
    if (!output.valid) throw new InvestigationError("contract", operation, "Implementation output does not satisfy the public contract", { validation_errors: output.errors });
    this.history.push({ operation, evidence_id: result.evidence_id ?? null, at: new Date().toISOString() });
    channel("real.validated-operation").publish({operation});
    return result;
  }
}
