import React, { createContext, useContext, useReducer, useMemo, useEffect, useCallback, useRef } from 'react';
import { CircuitNode, Connection, ModuleDefinition, GateType } from '@/types/circuit';
import { evaluateCircuit, detectCycleConnections } from '@/engine/evaluate';

interface CircuitState {
  nodes: CircuitNode[];
  connections: Connection[];
  modules: ModuleDefinition[];
  selectedTool: GateType | null;
  selectedModuleId: string | null;
  panOffset: { x: number; y: number };
  zoom: number;
  paused: boolean;
  forceResumed: boolean; // NEW: tracks if user force-resumed despite cycles
}

type Action =
  | { type: 'ADD_NODE'; node: CircuitNode }
  | { type: 'MOVE_NODE'; id: string; x: number; y: number }
  | { type: 'REMOVE_NODE'; id: string }
  | { type: 'ADD_CONNECTION'; connection: Connection }
  | { type: 'REMOVE_CONNECTION'; id: string }
  | { type: 'TOGGLE_INPUT'; id: string }
  | { type: 'SET_TOOL'; tool: GateType | null; moduleId?: string | null }
  | { type: 'SET_PAN'; offset: { x: number; y: number } }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'CREATE_MODULE'; module: ModuleDefinition }
  | { type: 'DELETE_MODULE'; id: string }
  | { type: 'LOAD_MODULES'; modules: ModuleDefinition[] }
  | { type: 'CLEAR_CANVAS' }
  | { type: 'UPDATE_NODE'; id: string; updates: Partial<CircuitNode> }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'FORCE_RESUME' }
  | { type: 'TOGGLE_PINBAR_PIN'; nodeId: string; pinIndex: number };

const UNDOABLE_ACTIONS = new Set([
  'ADD_NODE', 'MOVE_NODE', 'REMOVE_NODE',
  'ADD_CONNECTION', 'REMOVE_CONNECTION',
  'TOGGLE_INPUT', 'CREATE_MODULE', 'DELETE_MODULE',
  'CLEAR_CANVAS', 'UPDATE_NODE', 'TOGGLE_PINBAR_PIN',
]);

function reducer(state: CircuitState, action: Action): CircuitState {
  switch (action.type) {
    case 'ADD_NODE':
      return { ...state, nodes: [...state.nodes, action.node] };
    case 'MOVE_NODE':
      return { ...state, nodes: state.nodes.map(n => n.id === action.id ? { ...n, x: action.x, y: action.y } : n) };
    case 'REMOVE_NODE':
      return {
        ...state,
        nodes: state.nodes.filter(n => n.id !== action.id),
        connections: state.connections.filter(c => c.fromNodeId !== action.id && c.toNodeId !== action.id),
      };
    case 'ADD_CONNECTION': {
      const exists = state.connections.find(
        c => c.toNodeId === action.connection.toNodeId && c.toPinIndex === action.connection.toPinIndex
      );
      if (exists) return state;
      // Reset forceResumed when connections change (new cycle state)
      return { ...state, connections: [...state.connections, action.connection], forceResumed: false };
    }
    case 'REMOVE_CONNECTION':
      // Reset forceResumed when connections change
      return { ...state, connections: state.connections.filter(c => c.id !== action.id), forceResumed: false };
    case 'TOGGLE_INPUT':
      return { ...state, nodes: state.nodes.map(n => n.id === action.id ? { ...n, inputValue: !n.inputValue } : n) };
    case 'SET_TOOL':
      return { ...state, selectedTool: action.tool, selectedModuleId: action.moduleId ?? null };
    case 'SET_PAN':
      return { ...state, panOffset: action.offset };
    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.25, Math.min(2, action.zoom)) };
    case 'CREATE_MODULE':
      return { ...state, modules: [...state.modules, action.module] };
    case 'DELETE_MODULE':
      return { ...state, modules: state.modules.filter(m => m.id !== action.id) };
    case 'LOAD_MODULES':
      return { ...state, modules: action.modules };
    case 'CLEAR_CANVAS':
      return { ...state, nodes: [], connections: [], paused: false, forceResumed: false };
    case 'UPDATE_NODE': {
      const existing = state.nodes.find(n => n.id === action.id);
      if (!existing) return state;
      const updated = { ...existing, ...action.updates };
      let conns = state.connections;
      if (action.updates.inputCount !== undefined && action.updates.inputCount < existing.inputCount) {
        conns = conns.filter(c => !(c.toNodeId === action.id && c.toPinIndex >= action.updates.inputCount!));
      }
      if (action.updates.outputCount !== undefined && action.updates.outputCount < existing.outputCount) {
        conns = conns.filter(c => !(c.fromNodeId === action.id && c.fromPinIndex >= action.updates.outputCount!));
      }
      return { ...state, nodes: state.nodes.map(n => n.id === action.id ? updated : n), connections: conns };
    }
    case 'SET_PAUSED':
      return { ...state, paused: action.paused, forceResumed: false };
    case 'FORCE_RESUME':
      // Force resume: unpause AND set forceResumed flag to prevent auto-pause
      return { ...state, paused: false, forceResumed: true };
    case 'TOGGLE_PINBAR_PIN': {
      return {
        ...state,
        nodes: state.nodes.map(n => {
          if (n.id !== action.nodeId) return n;
          const vals = [...(n.pinBarValues || Array(n.outputCount).fill(false))];
          vals[action.pinIndex] = !vals[action.pinIndex];
          return { ...n, pinBarValues: vals };
        }),
      };
    }
    default:
      return state;
  }
}

type Snapshot = { nodes: CircuitNode[]; connections: Connection[]; modules: ModuleDefinition[] };

function takeSnapshot(state: CircuitState): Snapshot {
  return {
    nodes: state.nodes.map(n => ({ ...n })),
    connections: state.connections.map(c => ({ ...c })),
    modules: state.modules.map(m => ({ ...m, nodes: m.nodes.map(n => ({ ...n })), connections: m.connections.map(c => ({ ...c })) })),
  };
}

interface CircuitContextType {
  state: CircuitState;
  dispatch: React.Dispatch<Action>;
  nodeOutputs: Record<string, boolean[]>;
  cycleConnectionIds: string[];
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CircuitContext = createContext<CircuitContextType | null>(null);

const MAX_HISTORY = 50;

export function CircuitProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, {
    nodes: [],
    connections: [],
    modules: [],
    selectedTool: null,
    selectedModuleId: null,
    panOffset: { x: 0, y: 0 },
    zoom: 1,
    paused: false,
    forceResumed: false,
  });

  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const [historyVersion, setHistoryVersion] = React.useState(0);
  const lastOutputsRef = useRef<Record<string, boolean[]>>({});

  const dispatch = useCallback((action: Action) => {
    if (UNDOABLE_ACTIONS.has(action.type)) {
      undoStack.current.push(takeSnapshot(state));
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setHistoryVersion(v => v + 1);
    }
    rawDispatch(action);
  }, [state]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(takeSnapshot(state));
    rawDispatch({ type: 'CLEAR_CANVAS' });
    prev.nodes.forEach(n => rawDispatch({ type: 'ADD_NODE', node: n }));
    prev.connections.forEach(c => rawDispatch({ type: 'ADD_CONNECTION', connection: c }));
    rawDispatch({ type: 'LOAD_MODULES', modules: prev.modules });
    setHistoryVersion(v => v + 1);
  }, [state]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(takeSnapshot(state));
    rawDispatch({ type: 'CLEAR_CANVAS' });
    next.nodes.forEach(n => rawDispatch({ type: 'ADD_NODE', node: n }));
    next.connections.forEach(c => rawDispatch({ type: 'ADD_CONNECTION', connection: c }));
    rawDispatch({ type: 'LOAD_MODULES', modules: next.modules });
    setHistoryVersion(v => v + 1);
  }, [state]);

  const cycleConnectionIds = useMemo(
    () => detectCycleConnections(state.nodes, state.connections),
    [state.nodes, state.connections]
  );

  // FIX: Only auto-pause if NOT force-resumed
  useEffect(() => {
    if (cycleConnectionIds.length > 0 && !state.paused && !state.forceResumed) {
      rawDispatch({ type: 'SET_PAUSED', paused: true });
    }
    // When cycles are resolved, reset forceResumed
    if (cycleConnectionIds.length === 0 && state.forceResumed) {
      rawDispatch({ type: 'SET_PAUSED', paused: false });
    }
  }, [cycleConnectionIds, state.paused, state.forceResumed]);

  // FIX: When force-resumed, still evaluate the circuit (don't freeze on last outputs)
  const nodeOutputs = useMemo(() => {
    if (state.paused && !state.forceResumed) return lastOutputsRef.current;
    const result = evaluateCircuit(state.nodes, state.connections, state.modules);
    lastOutputsRef.current = result;
    return result;
  }, [state.nodes, state.connections, state.modules, state.paused, state.forceResumed]);

  useEffect(() => {
    const saved = localStorage.getItem('logic-sandbox-modules');
    if (saved) {
      try { rawDispatch({ type: 'LOAD_MODULES', modules: JSON.parse(saved) }); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('logic-sandbox-modules', JSON.stringify(state.modules));
  }, [state.modules]);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  return (
    <CircuitContext.Provider value={{ state, dispatch, nodeOutputs, cycleConnectionIds, undo, redo, canUndo, canRedo }}>
      {children}
    </CircuitContext.Provider>
  );
}

export function useCircuit() {
  const ctx = useContext(CircuitContext);
  if (!ctx) throw new Error('useCircuit must be used within CircuitProvider');
  return ctx;
}
