/**
 * Tarjan's strongly connected components, iterative to avoid stack overflows on large graphs.
 * Returns only components with more than one node (true cycles), each sorted for determinism.
 */
export function stronglyConnectedComponents(
  nodes: string[],
  edges: Map<string, Set<string>>,
): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  for (const start of nodes) {
    if (indices.has(start)) continue;
    const work: Array<{ node: string; iter: Iterator<string> }> = [];
    indices.set(start, index);
    lowlink.set(start, index);
    index++;
    stack.push(start);
    onStack.add(start);
    work.push({ node: start, iter: (edges.get(start) ?? new Set()).values() });

    while (work.length > 0) {
      const frame = work[work.length - 1] as { node: string; iter: Iterator<string> };
      const next = frame.iter.next();
      if (!next.done) {
        const w = next.value;
        if (!indices.has(w)) {
          indices.set(w, index);
          lowlink.set(w, index);
          index++;
          stack.push(w);
          onStack.add(w);
          work.push({ node: w, iter: (edges.get(w) ?? new Set()).values() });
        } else if (onStack.has(w)) {
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node) ?? 0, indices.get(w) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent)
        lowlink.set(
          parent.node,
          Math.min(lowlink.get(parent.node) ?? 0, lowlink.get(frame.node) ?? 0),
        );
      if (lowlink.get(frame.node) === indices.get(frame.node)) {
        const component: string[] = [];
        let w: string | undefined;
        do {
          w = stack.pop();
          if (w === undefined) break;
          onStack.delete(w);
          component.push(w);
        } while (w !== frame.node);
        if (component.length > 1) result.push(component.sort());
      }
    }
  }
  return result.sort((a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? ""));
}
