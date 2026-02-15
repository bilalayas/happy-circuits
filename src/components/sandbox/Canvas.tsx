import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { GateNode } from './GateNode';
import { WireLayer } from './WireLayer';
import { SideMenu } from './SideMenu';
import { NODE_WIDTH, GRID_SIZE, snapToGrid, GATE_CONFIGS, CircuitNode, PINBAR_THICKNESS } from '@/types/circuit';
import { Minus, Plus, Undo2, Redo2, Trash2, Play, Pause } from 'lucide-react';

export function Canvas() {
  const { state, dispatch, nodeOutputs, cycleConnectionIds, undo, redo, canUndo, canRedo } = useCircuit();
  const { nodes, connections, selectedTool, selectedModuleId, panOffset, zoom, modules, paused, forceResumed } = state;

  const canvasRef = useRef<HTMLDivElement>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; pinIndex: number; pinType: 'input' | 'output' } | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom,
    };
  }, [panOffset, zoom]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    if (connectingFrom) {
      setConnectingFrom(null);
      setMouseWorldPos(null);
      return;
    }

    if (selectedTool) {
      const world = screenToWorld(e.clientX, e.clientY);
      const toolWidth = selectedTool === 'PINBAR' ? PINBAR_THICKNESS : NODE_WIDTH;
      const x = snapToGrid(world.x - toolWidth / 2);
      const y = snapToGrid(world.y - 30);

      let newNode: CircuitNode;
      if (selectedTool === 'MODULE' && selectedModuleId) {
        const mod = modules.find(m => m.id === selectedModuleId);
        if (!mod) return;
        newNode = { id: crypto.randomUUID(), type: 'MODULE', x, y, label: mod.name, inputCount: mod.inputCount, outputCount: mod.outputCount, moduleId: mod.id };
      } else if (selectedTool === 'PINBAR') {
        newNode = {
          id: crypto.randomUUID(), type: 'PINBAR', x, y,
          label: 'BAR', inputCount: 0, outputCount: 4,
          pinBarMode: 'input', pinBarValues: [false, false, false, false],
        };
      } else {
        const config = GATE_CONFIGS[selectedTool];
        if (!config) return;
        newNode = {
          id: crypto.randomUUID(), type: selectedTool, x, y,
          label: config.label, inputCount: config.inputCount, outputCount: config.outputCount,
          inputValue: selectedTool === 'INPUT' ? false : undefined,
          ledColor: selectedTool === 'LED' ? '#3b82f6' : undefined,
        };
      }
      dispatch({ type: 'ADD_NODE', node: newNode });
      dispatch({ type: 'SET_TOOL', tool: null });
      return;
    }

    panStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
  }, [selectedTool, selectedModuleId, modules, screenToWorld, panOffset, dispatch, connectingFrom]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (panStartRef.current) {
      dispatch({
        type: 'SET_PAN',
        offset: {
          x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
          y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
        },
      });
    }
    if (connectingFrom) {
      setMouseWorldPos(screenToWorld(e.clientX, e.clientY));
    }
  }, [dispatch, connectingFrom, screenToWorld]);

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      dispatch({ type: 'SET_ZOOM', zoom: zoomRef.current + delta });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const handlePinClick = useCallback((nodeId: string, pinIndex: number, pinType: 'input' | 'output') => {
    if (!connectingFrom) {
      setConnectingFrom({ nodeId, pinIndex, pinType });
      return;
    }
    if (connectingFrom.nodeId === nodeId) {
      setConnectingFrom(null);
      setMouseWorldPos(null);
      return;
    }
    if (connectingFrom.pinType === pinType) {
      setConnectingFrom({ nodeId, pinIndex, pinType });
      return;
    }
    const fromData = connectingFrom.pinType === 'output'
      ? { nodeId: connectingFrom.nodeId, pinIndex: connectingFrom.pinIndex }
      : { nodeId, pinIndex };
    const toData = connectingFrom.pinType === 'input'
      ? { nodeId: connectingFrom.nodeId, pinIndex: connectingFrom.pinIndex }
      : { nodeId, pinIndex };

    dispatch({
      type: 'ADD_CONNECTION',
      connection: { id: crypto.randomUUID(), fromNodeId: fromData.nodeId, fromPinIndex: fromData.pinIndex, toNodeId: toData.nodeId, toPinIndex: toData.pinIndex },
    });
    setConnectingFrom(null);
    setMouseWorldPos(null);
  }, [connectingFrom, dispatch]);

  const getInputValues = useCallback((nodeId: string, inputCount: number): boolean[] => {
    return Array.from({ length: inputCount }, (_, i) => {
      const conn = connections.find(c => c.toNodeId === nodeId && c.toPinIndex === i);
      if (conn) return (nodeOutputs[conn.fromNodeId] || [])[conn.fromPinIndex] ?? false;
      return false;
    });
  }, [connections, nodeOutputs]);

  const clearCanvas = () => {
    if (nodes.length === 0 || confirm('Clear all nodes and connections?')) {
      dispatch({ type: 'CLEAR_CANVAS' });
    }
  };

  const togglePause = () => {
    dispatch({ type: 'SET_PAUSED', paused: !paused });
  };

  // Determine if simulation is actually running
  const isRunning = !paused || forceResumed;

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: 'hsl(228 20% 7%)', touchAction: 'none' }}>
      <div
        ref={canvasRef}
        className="w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 }}>
          <div
            style={{
              position: 'absolute', width: 20000, height: 20000, left: -10000, top: -10000,
              backgroundImage: `radial-gradient(circle, hsl(228 15% 18%) 1px, transparent 1px)`,
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
              zIndex: 0,
            }}
          />
          <WireLayer
            nodes={nodes} connections={connections} nodeOutputs={nodeOutputs}
            cycleConnectionIds={cycleConnectionIds}
            connectingFrom={connectingFrom} mouseWorldPos={mouseWorldPos}
            onDeleteConnection={(id) => dispatch({ type: 'REMOVE_CONNECTION', id })}
          />
          {nodes.map(node => (
            <div key={node.id} style={{ position: 'relative', zIndex: 10 }}>
              <GateNode
                node={node} zoom={zoom}
                isConnecting={!!connectingFrom}
                outputs={nodeOutputs[node.id] || []}
                inputValues={getInputValues(node.id, node.inputCount)}
                onPinClick={handlePinClick}
                onMove={(id, x, y) => dispatch({ type: 'MOVE_NODE', id, x, y })}
                onToggle={(id) => dispatch({ type: 'TOGGLE_INPUT', id })}
                onDelete={(id) => dispatch({ type: 'REMOVE_NODE', id })}
                onUpdateNode={(id, updates) => dispatch({ type: 'UPDATE_NODE', id, updates })}
                onTogglePinBarPin={(nodeId, pinIndex) => dispatch({ type: 'TOGGLE_PINBAR_PIN', nodeId, pinIndex })}
              />
            </div>
          ))}
        </div>
      </div>

      <SideMenu />

      {/* Top-right toolbar */}
      <div
        className="fixed top-4 right-4 flex items-center gap-1 rounded-lg px-2 py-1 z-30"
        style={{ backgroundColor: 'hsl(228 18% 12%)', border: '1px solid hsl(228 15% 22%)' }}
      >
        <button className="w-8 h-8 flex items-center justify-center rounded transition-colors disabled:opacity-25" style={{ color: 'hsl(215 10% 55%)' }} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
        <button className="w-8 h-8 flex items-center justify-center rounded transition-colors disabled:opacity-25" style={{ color: 'hsl(215 10% 55%)' }} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)"><Redo2 size={16} /></button>
        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'hsl(228 15% 22%)' }} />
        <button className="w-8 h-8 flex items-center justify-center rounded transition-colors" style={{ color: isRunning ? 'hsl(45 80% 55%)' : 'hsl(152 70% 55%)' }} onClick={togglePause} title={isRunning ? 'Pause' : 'Resume'}>
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="w-8 h-8 flex items-center justify-center rounded transition-colors" style={{ color: 'hsl(0 60% 55%)' }} onClick={clearCanvas} title="Clear canvas"><Trash2 size={16} /></button>
      </div>


      {selectedTool && (
        <div className="fixed top-4 left-20 z-30 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: 'hsl(152 60% 30%)', color: 'hsl(152 60% 95%)', border: '1px solid hsl(152 60% 40%)' }}>
          Click to place: {selectedTool}
          <button className="hover:opacity-70 ml-1" onClick={() => dispatch({ type: 'SET_TOOL', tool: null })}>✕</button>
        </div>
      )}

      {connectingFrom && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'hsl(45 80% 25%)', color: 'hsl(45 80% 85%)', border: '1px solid hsl(45 80% 40%)' }}>
          Click a {connectingFrom.pinType === 'output' ? 'input' : 'output'} pin to connect
        </div>
      )}

      <div className="fixed bottom-4 right-4 flex items-center gap-1 rounded-lg px-2 py-1 z-30" style={{ backgroundColor: 'hsl(228 18% 12%)', border: '1px solid hsl(228 15% 22%)' }}>
        <button className="w-8 h-8 flex items-center justify-center rounded transition-colors" style={{ color: 'hsl(215 10% 55%)' }} onClick={() => dispatch({ type: 'SET_ZOOM', zoom: zoom - 0.1 })}><Minus size={16} /></button>
        <span className="text-xs w-12 text-center" style={{ color: 'hsl(215 10% 55%)' }}>{Math.round(zoom * 100)}%</span>
        <button className="w-8 h-8 flex items-center justify-center rounded transition-colors" style={{ color: 'hsl(215 10% 55%)' }} onClick={() => dispatch({ type: 'SET_ZOOM', zoom: zoom + 0.1 })}><Plus size={16} /></button>
      </div>
    </div>
  );
}
