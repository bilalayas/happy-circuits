import { CircuitNode, Connection, ModuleDefinition } from '@/types/circuit';

export function evaluateCircuit(
  nodes: CircuitNode[],
  connections: Connection[],
  modules: ModuleDefinition[],
  previousOutputs?: Record<string, boolean[]>
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

  // Seed cycle nodes with previous outputs so feedback memory is preserved
  const cycleSet = new Set(cycleNodeIds);
  if (previousOutputs) {
    for (const nodeId of cycleNodeIds) {
      if (previousOutputs[nodeId]) {
        outputs[nodeId] = [...previousOutputs[nodeId]];
      }
    }
  }

  // For cycle nodes, read inputs from a frozen snapshot so evaluation order doesn't matter
  const frozenOutputs: Record<string, boolean[]> = { ...outputs };

  const evaluateNode = (nodeId: string, isCyclePass: boolean) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Cycle nodes read from frozen (previous) values; acyclic nodes read live values
    const source = isCyclePass ? frozenOutputs : outputs;

    const inputValues: boolean[] = [];
    for (let i = 0; i < node.inputCount; i++) {
      const conn = connections.find(c => c.toNodeId === nodeId && c.toPinIndex === i);
      if (conn) {
        // If the source node is a cycle node during acyclic pass, still use frozen value
        const readFrom = cycleSet.has(conn.fromNodeId) ? frozenOutputs : source;
        inputValues.push((readFrom[conn.fromNodeId] || [])[conn.fromPinIndex] ?? false);
      } else {
        inputValues.push(false);
      }
    }

    switch (node.type) {
      case 'INPUT':
      case 'BUTTON':
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
          // Build input values: each INPUT node contributes 1 input, each PINBAR in input mode contributes N
          const moduleInputValues: boolean[] = [];
          let inputIdx = 0;
          for (const inId of moduleDef.inputNodeIds) {
            const inNode = moduleDef.nodes.find(n => n.id === inId);
            if (!inNode) continue;
            if (inNode.type === 'INPUT') {
              moduleInputValues.push(inputValues[inputIdx] ?? false);
              inputIdx++;
            } else if (inNode.type === 'PINBAR') {
              const count = inNode.outputCount;
              for (let pi = 0; pi < count; pi++) {
                moduleInputValues.push(inputValues[inputIdx] ?? false);
                inputIdx++;
              }
            }
          }

          const internalNodes = moduleDef.nodes.map(n => {
            if (n.type === 'INPUT') {
              const idx = moduleDef.inputNodeIds.indexOf(n.id);
              if (idx >= 0) {
                // Calculate the actual input index for this INPUT node
                let actualIdx = 0;
                for (let k = 0; k < idx; k++) {
                  const prevNode = moduleDef.nodes.find(nn => nn.id === moduleDef.inputNodeIds[k]);
                  if (prevNode?.type === 'PINBAR') actualIdx += prevNode.outputCount;
                  else actualIdx += 1;
                }
                return { ...n, inputValue: moduleInputValues[actualIdx] ?? false };
              }
            }
            if (n.type === 'PINBAR' && (n.pinBarMode || 'input') === 'input') {
              const idx = moduleDef.inputNodeIds.indexOf(n.id);
              if (idx >= 0) {
                let actualIdx = 0;
                for (let k = 0; k < idx; k++) {
                  const prevNode = moduleDef.nodes.find(nn => nn.id === moduleDef.inputNodeIds[k]);
                  if (prevNode?.type === 'PINBAR') actualIdx += prevNode.outputCount;
                  else actualIdx += 1;
                }
                const vals = Array.from({ length: n.outputCount }, (_, pi) => moduleInputValues[actualIdx + pi] ?? false);
                return { ...n, pinBarValues: vals };
              }
            }
            return { ...n };
          });

          const internalOutputs = evaluateCircuit(internalNodes, moduleDef.connections, modules);

          const result: boolean[] = [];
          for (const outId of moduleDef.outputNodeIds) {
            const outNode = moduleDef.nodes.find(n => n.id === outId);
            if (outNode?.type === 'PINBAR' && outNode.pinBarMode === 'output') {
              for (let pi = 0; pi < outNode.inputCount; pi++) {
                // For output pinbars, get the input values from internal evaluation
                const conn = moduleDef.connections.find(c => c.toNodeId === outId && c.toPinIndex === pi);
                if (conn) {
                  result.push((internalOutputs[conn.fromNodeId] || [])[conn.fromPinIndex] ?? false);
                } else {
                  result.push(false);
                }
              }
            } else {
              result.push((internalOutputs[outId] || [])[0] ?? false);
            }
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

  // Pass 1: evaluate acyclic nodes in topological order (they see live values)
  for (const nodeId of sorted) {
    if (!cycleSet.has(nodeId)) {
      evaluateNode(nodeId, false);
    }
  }

  // Update frozen snapshot with acyclic results so cycle nodes see them
  for (const nodeId of sorted) {
    if (!cycleSet.has(nodeId) && outputs[nodeId]) {
      frozenOutputs[nodeId] = outputs[nodeId];
    }
  }

  // Pass 2: evaluate cycle nodes using frozen snapshot (order-independent)
  for (const nodeId of cycleNodeIds) {
    evaluateNode(nodeId, true);
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
