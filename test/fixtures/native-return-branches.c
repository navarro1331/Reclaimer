/* Independently authored analysis input; never executed by these tests. */
volatile unsigned int owned_values[3] = {3, 7, 11};
__attribute__((noinline)) unsigned int owned_mix(unsigned int first, unsigned int second) {
  return first * 5u + second + owned_values[1];
}
__attribute__((noinline)) unsigned int owned_choose(unsigned int selector) {
  if (selector & 1u) return owned_values[0] + selector;
  return owned_values[2] - selector;
}
__attribute__((noinline)) unsigned int owned_entry(unsigned int selector) {
  unsigned int mixed = owned_mix(selector, 19u);
  unsigned int chosen = owned_choose(mixed);
  owned_values[0] = mixed;
  return mixed + chosen;
}
