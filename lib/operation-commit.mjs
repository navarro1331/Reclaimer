// Request-local commit metadata never enters a CLI/MCP response.
const pending = new WeakMap();
export function stagedResult(result, owner, operation, signal, commit, rollback) {
  pending.set(result, {owner, operation, signal, commit, rollback});
  return result;
}
export function takeResultCommit(result, owner, operation) {
  const prepared = result && typeof result === 'object' ? pending.get(result) : null;
  if (!prepared) return null;
  pending.delete(result);
  if (prepared.owner !== owner || prepared.operation !== operation) throw new Error('Prepared operation belongs to another call');
  return prepared;
}
