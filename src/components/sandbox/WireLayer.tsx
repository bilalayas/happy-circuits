import { CircuitNode, Connection, getPinPosition } from '@/types/circuit';

interface WireLayerProps {
  nodes: CircuitNode[];
  connections: Connection[];
  nodeOutputs: Record<string, boolean[]>;
  cycleConnectionIds: string[];
  connectingFrom: { nodeId: string; pinIndex: number; pinType: 'input' | 'output' } | null;
  mouseWorldPos: { x: number; y: number } | null;
  onDeleteConnection: (id: string) => void;
}

export function WireLayer({ nodes, connections, nodeOutputs, cycleConnectionIds, connectingFrom, mouseWorldPos, onDeleteConnection }: WireLayerProps) {
  return (
    <svg
      style={{
        position: 'absolute',
        left: -10000,
        top: -10000,
        width: 30000,
        height: 30000,
        zIndex: 5,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {connections.map(conn => {
        const fromNode = nodes.find(n => n.id === conn.fromNodeId);
        const toNode = nodes.find(n => n.id === conn.toNodeId);
        if (!fromNode || !toNode) return null;
        const from = getPinPosition(fromNode, 'output', conn.fromPinIndex);
        const to = getPinPosition(toNode, 'input', conn.toPinIndex);
        const isHigh = ((nodeOutputs[conn.fromNodeId] || [])[conn.fromPinIndex] ?? false);
        const dx = Math.max(Math.abs(to.x - from.x) * 0.45, 40);
        const d = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
        const strokeColor = isHigh ? 'hsl(152 80% 55%)' : 'hsl(228 10% 32%)';
        return (
          <g key={conn.id}>
            <path d={d} stroke="transparent" strokeWidth={14} fill="none"
              style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
              onDoubleClick={(e) => { e.stopPropagation(); onDeleteConnection(conn.id); }}
            />
            <path d={d}
              stroke={strokeColor}
              strokeWidth={2.5} fill="none" pointerEvents="none"
            />
          </g>
        );
      })}
      {connectingFrom && mouseWorldPos && (() => {
        const node = nodes.find(n => n.id === connectingFrom.nodeId);
        if (!node) return null;
        const pin = getPinPosition(node, connectingFrom.pinType, connectingFrom.pinIndex);
        const other = mouseWorldPos;
        const dx = Math.max(Math.abs(other.x - pin.x) * 0.45, 40);
        const d = connectingFrom.pinType === 'output'
          ? `M ${pin.x} ${pin.y} C ${pin.x + dx} ${pin.y}, ${other.x - dx} ${other.y}, ${other.x} ${other.y}`
          : `M ${other.x} ${other.y} C ${other.x + dx} ${other.y}, ${pin.x - dx} ${pin.y}, ${pin.x} ${pin.y}`;
        return <path d={d} stroke="hsl(45 80% 55%)" strokeWidth={2} strokeDasharray="6,4" fill="none" pointerEvents="none" />;
      })()}
    </svg>
  );
}
