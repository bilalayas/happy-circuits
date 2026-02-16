import { CircuitNode, Connection, ModuleDefinition } from '@/types/circuit';

export function evaluateCircuit(
  nodes: CircuitNode[],
  connections: Connection[],
  modules: ModuleDefinition[]
): Record<string, boolean[]> {
  const outputs: Record<string, boolean[]> = {};

  // Build adjacency
  const outEdges: Record<string, Set<string>> = {};
  const inEdges: Record<string, Set<string>> = {};
  for (const node of nodes) {
    outEdges[node.id] = new Set();
    inEdges[node.id] = new Set();
  }
  for (const conn of connections) {
    if (outEdges[conn.fromNodeId] && inEdges[conn.toNodeId]) {
      outEdges[conn.fromNodeId].add(conn.toNodeId);
      inEdges[conn.toNodeId].add(conn.fromNodeId);
    }
  }

  // Topological sort
  const inDegree: Record<string, number> = {};
  for (const node of nodes) inDegree[node.id] = inEdges[node.id]?.size || 0;
  const queue: string[] = [];
  for (const node of nodes) {
    if (inDegree[node.id] === 0) queue.push(node.id);
  }
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of outEdges[id] || []) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  // Collect cycle nodes
  const cycleNodeIds: string[] = [];
  for (const node of nodes) {
    if (!sorted.includes(node.id)) {
      cycleNodeIds.push(node.id);
      sorted.push(node.id);
    }
  }

  const evaluateNode = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const inputValues: boolean[] = [];
    for (let i = 0; i < node.inputCount; i++) {
      const conn = connections.find(c => c.toNodeId === nodeId && c.toPinIndex === i);
      if (conn) {
        inputValues.push((outputs[conn.fromNodeId] || [])[conn.fromPinIndex] ?? false);
      } else {
        inputValues.push(false);
      }
    }

    switch (node.type) {
      case 'INPUT':
        outputs[nodeId] = [node.inputValue ?? false];
        break;
      case 'AND':
        outputs[nodeId] = [inputValues.length >= 2 && inputValues[0] && inputValues[1]];
        break;
      case 'OR':
        outputs[nodeId] = [inputValues.length >= 2 && (inputValues[0] || inputValues[1])];
        break;
      case 'NOT':
        outputs[nodeId] = [!inputValues[0]];
        break;
      case 'OUTPUT':
      case 'LED':
        outputs[nodeId] = [inputValues[0] ?? false];
        break;
      case 'PINBAR': {
        const mode = node.pinBarMode || 'input';
        if (mode === 'input') {
          const vals = node.pinBarValues || [];
          const result: boolean[] = [];
          for (let i = 0; i < node.outputCount; i++) {
            result.push(vals[i] ?? false);
          }
          outputs[nodeId] = result;
        } else {
          outputs[nodeId] = inputValues.slice(0, node.inputCount);
        }
        break;
      }
      case 'MODULE': {
        const moduleDef = modules.find(m => m.id === node.moduleId);
        if (moduleDef) {
          const internalNodes = moduleDef.nodes.map(n => {
            if (n.type === 'INPUT') {
              const idx = moduleDef.inputNodeIds.indexOf(n.id);
              if (idx >= 0 && idx < inputValues.length) {
                return { ...n, inputValue: inputValues[idx] };
              }
            }
            return { ...n };
          });
          const internalOutputs = evaluateCircuit(internalNodes, moduleDef.connections, modules);
          const result: boolean[] = [];
          for (const outId of moduleDef.outputNodeIds) {
            result.push((internalOutputs[outId] || [])[0] ?? false);
          }
          outputs[nodeId] = result;
        } else {
          outputs[nodeId] = Array(node.outputCount).fill(false);
        }
        break;
      }
      default:
        outputs[nodeId] = [false];
    }
  };

  // First pass: evaluate in topological order
  for (const nodeId of sorted) {
    evaluateNode(nodeId);
  }

  // Iterative settling for feedback loops (up to 10 iterations)
  if (cycleNodeIds.length > 0) {
    for (let iter = 0; iter < 10; iter++) {
      const prevSnapshot = JSON.stringify(outputs);
      for (const nodeId of sorted) {
        evaluateNode(nodeId);
      }
      if (JSON.stringify(outputs) === prevSnapshot) break;
    }
  }

  return outputs;
}

export function detectCycleConnections(
  nodes: CircuitNode[],
  connections: Connection[]
): string[] {
  const inDegree: Record<string, number> = {};
  const adj: Record<string, Set<string>> = {};

  for (const node of nodes) {
    inDegree[node.id] = 0;
    adj[node.id] = new Set();
  }
  for (const conn of connections) {
    if (adj[conn.fromNodeId] && inDegree[conn.toNodeId] !== undefined) {
      adj[conn.fromNodeId].add(conn.toNodeId);
      inDegree[conn.toNodeId]++;
    }
  }

  const queue: string[] = [];
  for (const id in inDegree) {
    if (inDegree[id] === 0) queue.push(id);
  }

  const processed = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    processed.add(id);
    for (const next of adj[id]) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  const cycleNodes = new Set(nodes.filter(n => !processed.has(n.id)).map(n => n.id));
  return connections
    .filter(c => cycleNodes.has(c.fromNodeId) && cycleNodes.has(c.toNodeId))
    .map(c => c.id);
}

export function wouldCreateCycle(
  connections: Connection[],
  fromNodeId: string,
  toNodeId: string
): boolean {
  if (fromNodeId === toNodeId) return true;
  const adj: Record<string, string[]> = {};
  for (const conn of connections) {
    if (!adj[conn.fromNodeId]) adj[conn.fromNodeId] = [];
    adj[conn.fromNodeId].push(conn.toNodeId);
  }
  const visited = new Set<string>();
  const q = [toNodeId];
  while (q.length > 0) {
    const current = q.shift()!;
    if (current === fromNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adj[current] || []) q.push(next);
  }
  return false;
}
