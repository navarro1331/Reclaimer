import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// Public protocol shapes are interface facts, observed without implementation
// source or authored prose. They are not executable analysis algorithms.
export const api = JSON.parse(readFileSync(new URL("./api-contracts.json", import.meta.url), "utf8"));
export const tools = new Map(api.tools.map((tool) => [tool.name, tool]));
const validators = new Map();
const inputAjv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true, addUsedSchema: false });
const outputAjv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true, addUsedSchema: false });
addFormats(inputAjv);addFormats(outputAjv);
const branches = new WeakMap();
function defaults(schema, value, root) {
  if(value===undefined&&Object.hasOwn(schema,'default'))return structuredClone(schema.default);
  schema=resolveSchema(schema,root);
  if(value===undefined)return Object.hasOwn(schema,'default')?structuredClone(schema.default):undefined;
  if(schema.oneOf||schema.anyOf) {
    for(const branch of schema.oneOf??schema.anyOf){
      const candidate=defaults(branch,structuredClone(value),root);
      let test=branches.get(branch);
      if(!test){test=inputAjv.compile({...branch,$defs:root.$defs??{},$schema:root.$schema});branches.set(branch,test);}
      if(test(candidate))return candidate;
    }
    return value;
  }
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    for(const [key,property]of Object.entries(schema.properties??{})){
      if(value[key]===undefined&&schema.dependentRequired?.[key]?.some(k=>value[k]===undefined))continue;
      const candidate=defaults(property,value[key],root);
      if(candidate!==undefined)value[key]=candidate;
    }
  }else if(Array.isArray(value)&&schema.items)value=value.map(item=>defaults(schema.items,item,root));
  return value;
}
export function resolveSchema(node, root) {
  const seen = new Set();
  while (node?.$ref?.startsWith("#/")) {
    if (seen.has(node.$ref)) throw new Error("Circular root reference");
    seen.add(node.$ref);
    node = node.$ref.slice(2).split("/").reduce((value, part) => value?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], root);
  }
  return node;
}
export function outputSchema(operation, field = "normalized_result") {
  const root = tools.get(operation)?.outputSchema;
  if (!root) throw new Error("Unknown operation " + operation);
  const node = resolveSchema(root.properties?.[field] ?? root.properties?.result ?? root, root);
  return { ...node, $defs: root.$defs ?? {}, $schema: root.$schema };
}
export function validate(operation, side, value) {
  const key = operation + ":" + side;
  let validator = validators.get(key);
  if (!validator) {
    const schema = tools.get(operation)?.[side === "input" ? "inputSchema" : "outputSchema"];
    if (!schema) throw new Error("No public contract for " + operation);
    validator = (side === 'input' ? inputAjv : outputAjv).compile(schema);
    validators.set(key, validator);
  }
  if(side==='input'&&value&&typeof value==='object'&&!Array.isArray(value)){
    const candidate=defaults(tools.get(operation).inputSchema,structuredClone(value),tools.get(operation).inputSchema);
    Object.assign(value,candidate);
  }
  return { valid: validator(value), errors: structuredClone(validator.errors ?? []) };
}
export const resolve = resolveSchema;
