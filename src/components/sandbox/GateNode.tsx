import React, { useCallback, useRef, useState, useEffect } from 'react';
import { CircuitNode, getNodeDimensions, snapToGrid, GATE_STYLES, LedShape } from '@/types/circuit';
import { X, Settings } from 'lucide-react';

interface GateNodeProps {
  node: CircuitNode;
  outputs: boolean[];
  inputValues: boolean[];
  zoom: number;
  isConnecting?: boolean;
  onPinClick: (nodeId: string, pinIndex: number, pinType: 'input' | 'output') => void;
  onMove: (id: string, x: number, y: number) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateNode: (id: string, updates: Partial<CircuitNode>) => void;
  onTogglePinBarPin: (nodeId: string, pinIndex: number) => void;
}

const LED_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#ffffff'];
const LED_SHAPES: { value: LedShape; label: string }[] = [
  { value: 'circle', label: '●' },
  { value: 'square', label: '■' },
  { value: 'triangle', label: '▲' },
  { value: 'segment', label: '━' },
];

export function GateNode({ node, outputs, inputValues, zoom, isConnecting, onPinClick, onMove, onToggle, onDelete, onUpdateNode, onTogglePinBarPin }: GateNodeProps) {
  const { width, height } = getNodeDimensions(node);
  const style = GATE_STYLES[node.type] || GATE_STYLES.AND;
  const dragRef = useRef<{ startX: number; startY: number; nodeX: number; nodeY: number; moved: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const pinSize = isConnecting ? 16 : 10;

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node) &&
          nodeRef.current && !nodeRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [showSettings]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, nodeX: node.x, nodeY: node.y, moved: false };
  }, [node.x, node.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startX) / zoom;
    const dy = (e.clientY - dragRef.current.startY) / zoom;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      onMove(node.id, snapToGrid(dragRef.current.nodeX + dx), snapToGrid(dragRef.current.nodeY + dy));
    }
  }, [zoom, node.id, onMove]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current && !dragRef.current.moved && node.type === 'INPUT') {
      onToggle(node.id);
    }
    dragRef.current = null;
  }, [node.id, node.type, onToggle]);

  const rot = node.rotation || 0;
  const isVerticalPinBar = node.type === 'PINBAR' && (rot === 0 || rot === 180);
  const isHorizontalPinBar = node.type === 'PINBAR' && (rot === 90 || rot === 270);

  const renderPins = (type: 'input' | 'output') => {
    const count = type === 'input' ? node.inputCount : node.outputCount;
    const names = node.pinNames || {};
    const showNames = node.showPinNames ?? false;

    return Array.from({ length: count }, (_, i) => {
      const isHigh = type === 'output' ? (outputs[i] ?? false) : (inputValues[i] ?? false);
      const size = type === 'output' ? pinSize : pinSize * 0.7;
      const offset = size / 2;
      const nameKey = `${type}-${i}`;
      const pinName = names[nameKey];

      let left: number, top: number;
      let namePosStyle: React.CSSProperties = {};

      if (node.type === 'PINBAR') {
        if (rot === 0) {
          left = width - offset;
          top = (i + 1) * height / (count + 1) - offset;
          namePosStyle = { left: -4, top: top + offset - 5, right: undefined, transform: 'translateX(-100%)', fontSize: 8, whiteSpace: 'nowrap' as const };
        } else if (rot === 90) {
          left = (i + 1) * width / (count + 1) - offset;
          top = height - offset;
          namePosStyle = { left: left + offset, top: -12, transform: 'translateX(-50%)', fontSize: 8, whiteSpace: 'nowrap' as const };
        } else if (rot === 180) {
          left = -offset;
          top = (i + 1) * height / (count + 1) - offset;
          namePosStyle = { left: width + 4, top: top + offset - 5, fontSize: 8, whiteSpace: 'nowrap' as const };
        } else {
          left = (i + 1) * width / (count + 1) - offset;
          top = -offset;
          namePosStyle = { left: left + offset, top: height + 2, transform: 'translateX(-50%)', fontSize: 8, whiteSpace: 'nowrap' as const };
        }
      } else if (node.type === 'MODULE' && rot !== 0) {
        if (rot === 90) {
          left = (i + 1) * width / (count + 1) - offset;
          top = type === 'input' ? -offset : height - offset;
          namePosStyle = type === 'input'
            ? { left: left + offset, top: -12, transform: 'translateX(-50%)', fontSize: 8, whiteSpace: 'nowrap' as const }
            : { left: left + offset, top: height + 4, transform: 'translateX(-50%)', fontSize: 8, whiteSpace: 'nowrap' as const };
        } else if (rot === 180) {
          left = type === 'input' ? width - offset : -offset;
          top = (i + 1) * height / (count + 1) - offset;
          namePosStyle = type === 'input'
            ? { left: width + 4, top: top + offset - 5, fontSize: 8, whiteSpace: 'nowrap' as const }
            : { right: width + 4, top: top + offset - 5, fontSize: 8, whiteSpace: 'nowrap' as const, transform: 'translateX(-100%)' };
        } else if (rot === 270) {
          left = (i + 1) * width / (count + 1) - offset;
          top = type === 'input' ? height - offset : -offset;
          namePosStyle = type === 'input'
            ? { left: left + offset, top: height + 4, transform: 'translateX(-50%)', fontSize: 8, whiteSpace: 'nowrap' as const }
            : { left: left + offset, top: -12, transform: 'translateX(-50%)', fontSize: 8, whiteSpace: 'nowrap' as const };
        }
      } else {
        left = type === 'input' ? -offset : width - offset;
        top = (i + 1) * height / (count + 1) - offset;
        namePosStyle = type === 'input'
          ? { right: width + 4, top: top + offset - 5, fontSize: 8, whiteSpace: 'nowrap' as const, position: 'absolute' as const, transform: 'translateX(-100%)' }
          : { left: width + 4, top: top + offset - 5, fontSize: 8, whiteSpace: 'nowrap' as const };
      }

      return (
        <React.Fragment key={`${type}-${i}`}>
          <div
            className="absolute rounded-full cursor-crosshair"
            style={{
              width: size, height: size, left, top,
              backgroundColor: isHigh ? 'hsl(152 80% 55%)' : 'hsl(228 10% 40%)',
              zIndex: 10,
              transition: 'all 0.15s',
            }}
            onPointerDown={(e) => { e.stopPropagation(); onPinClick(node.id, i, type); }}
          />
          {showNames && pinName && (
            <span className="absolute pointer-events-none" style={{ ...namePosStyle, color: 'hsl(210 15% 70%)' }}>
              {pinName}
            </span>
          )}
        </React.Fragment>
      );
    });
  };

  const renderSettingsPanel = () => {
    const names = node.pinNames || {};
    const setPinName = (key: string, value: string) => {
      onUpdateNode(node.id, { pinNames: { ...names, [key]: value } });
    };

    return (
      <div
        ref={settingsRef}
        className="absolute rounded-lg p-3 space-y-3"
        style={{
          top: height + 8, left: -20, width: 220,
          backgroundColor: 'hsl(228 18% 14%)', border: '1px solid hsl(228 15% 24%)',
          zIndex: 9999,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={node.showPinNames ?? false}
            onChange={(e) => onUpdateNode(node.id, { showPinNames: e.target.checked })}
            className="accent-emerald-500"
          />
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'hsl(215 10% 50%)' }}>Pin isimlerini göster</span>
        </label>

        {(node.type === 'PINBAR' || node.type === 'MODULE') && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Döndürme: {rot}°</label>
            <div className="flex gap-1">
              {[0, 90, 180, 270].map(r => (
                <button
                  key={r} className="px-2 py-1 rounded text-[10px] font-mono"
                  style={{
                    backgroundColor: rot === r ? 'hsl(228 15% 25%)' : 'transparent',
                    color: 'hsl(210 15% 80%)',
                    border: rot === r ? '1px solid hsl(228 15% 35%)' : '1px solid transparent',
                  }}
                  onClick={() => onUpdateNode(node.id, { rotation: r })}
                >
                  {r}°
                </button>
              ))}
            </div>
          </div>
        )}

        {node.type === 'PINBAR' && (
          <>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Mod</label>
              <div className="flex gap-1">
                {(['input', 'output'] as const).map(mode => (
                  <button
                    key={mode} className="px-3 py-1 rounded text-[10px] font-semibold uppercase"
                    style={{
                      backgroundColor: (node.pinBarMode || 'input') === mode ? 'hsl(228 15% 25%)' : 'transparent',
                      color: 'hsl(210 15% 80%)',
                      border: (node.pinBarMode || 'input') === mode ? '1px solid hsl(228 15% 35%)' : '1px solid transparent',
                    }}
                    onClick={() => {
                      const count = Math.max(node.inputCount, node.outputCount);
                      if (mode === 'input') {
                        onUpdateNode(node.id, { pinBarMode: 'input', inputCount: 0, outputCount: count, pinBarValues: Array(count).fill(false) });
                      } else {
                        onUpdateNode(node.id, { pinBarMode: 'output', inputCount: count, outputCount: 0, pinBarValues: undefined });
                      }
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>
                Pin sayısı: {Math.max(node.inputCount, node.outputCount)}
              </label>
              <input
                type="range" min={1} max={16} value={Math.max(node.inputCount, node.outputCount)}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: 'hsl(152 60% 45%)' }}
                onChange={(e) => {
                  const count = Number(e.target.value);
                  const mode = node.pinBarMode || 'input';
                  if (mode === 'input') {
                    onUpdateNode(node.id, { outputCount: count, inputCount: 0, pinBarValues: Array(count).fill(false) });
                  } else {
                    onUpdateNode(node.id, { inputCount: count, outputCount: 0 });
                  }
                }}
              />
            </div>
          </>
        )}

        {node.type === 'LED' && (
          <>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Renk</label>
              <div className="flex gap-1 flex-wrap">
                {LED_COLORS.map(color => (
                  <button key={color} className="w-6 h-6 rounded-full border-2"
                    style={{ backgroundColor: color, borderColor: (node.ledColor || '#3b82f6') === color ? 'white' : 'transparent' }}
                    onClick={() => onUpdateNode(node.id, { ledColor: color })}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Şekil</label>
              <div className="flex gap-1">
                {LED_SHAPES.map(s => (
                  <button key={s.value} className="w-8 h-8 rounded flex items-center justify-center text-sm"
                    style={{
                      backgroundColor: (node.ledShape || 'circle') === s.value ? 'hsl(228 15% 25%)' : 'transparent',
                      color: 'hsl(210 15% 80%)',
                      border: (node.ledShape || 'circle') === s.value ? '1px solid hsl(228 15% 35%)' : '1px solid transparent',
                    }}
                    onClick={() => onUpdateNode(node.id, { ledShape: s.value })}
                  >{s.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Boyut: {node.ledSize || 18}px</label>
              <input type="range" min={8} max={40} value={node.ledSize || 18} className="w-full h-1 rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'hsl(152 60% 45%)' }}
                onChange={(e) => onUpdateNode(node.id, { ledSize: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Döndürme: {node.ledRotation || 0}°</label>
              <input type="range" min={0} max={360} step={15} value={node.ledRotation || 0} className="w-full h-1 rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'hsl(152 60% 45%)' }}
                onChange={(e) => onUpdateNode(node.id, { ledRotation: Number(e.target.value) })} />
            </div>
          </>
        )}

        {node.inputCount > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Giriş pinleri</label>
            <div className="space-y-1">
              {Array.from({ length: node.inputCount }, (_, i) => (
                <input
                  key={`in-${i}`}
                  type="text" placeholder={`Input ${i}`} value={names[`input-${i}`] || ''}
                  className="w-full px-2 py-1 rounded text-xs outline-none"
                  style={{ backgroundColor: 'hsl(228 15% 18%)', border: '1px solid hsl(228 15% 25%)', color: 'hsl(210 15% 82%)' }}
                  onChange={(e) => setPinName(`input-${i}`, e.target.value)}
                />
              ))}
            </div>
          </div>
        )}

        {node.outputCount > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'hsl(215 10% 50%)' }}>Çıkış pinleri</label>
            <div className="space-y-1">
              {Array.from({ length: node.outputCount }, (_, i) => (
                <input
                  key={`out-${i}`}
                  type="text" placeholder={`Output ${i}`} value={names[`output-${i}`] || ''}
                  className="w-full px-2 py-1 rounded text-xs outline-none"
                  style={{ backgroundColor: 'hsl(228 15% 18%)', border: '1px solid hsl(228 15% 25%)', color: 'hsl(210 15% 82%)' }}
                  onChange={(e) => setPinName(`output-${i}`, e.target.value)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const displayValue = node.type === 'INPUT'
    ? (node.inputValue ? '1' : '0')
    : node.type === 'OUTPUT'
    ? ((inputValues[0] ?? false) ? '1' : '0')
    : null;

  const isLedOn = node.type === 'LED' && (inputValues[0] ?? false);
  const ledColor = node.ledColor || '#3b82f6';
  const ledShape = node.ledShape || 'circle';
  const ledSize = node.ledSize || 18;
  const ledRotation = node.ledRotation || 0;

  const renderLedShape = () => {
    const baseStyle: React.CSSProperties = {
      width: ledSize,
      height: ledShape === 'segment' ? Math.max(4, ledSize / 4) : ledSize,
      backgroundColor: isLedOn ? ledColor : 'hsl(228 10% 25%)',
      boxShadow: isLedOn ? `0 0 12px ${ledColor}, 0 0 4px ${ledColor}` : 'none',
      transition: 'background-color 0.05s, box-shadow 0.05s',
      transform: `rotate(${ledRotation}deg)`,
    };
    switch (ledShape) {
      case 'circle': return <div style={{ ...baseStyle, borderRadius: '50%' }} />;
      case 'square': return <div style={{ ...baseStyle, borderRadius: 2 }} />;
      case 'triangle':
        return <div style={{
          width: 0, height: 0,
          borderLeft: `${ledSize / 2}px solid transparent`, borderRight: `${ledSize / 2}px solid transparent`,
          borderBottom: `${ledSize}px solid ${isLedOn ? ledColor : 'hsl(228 10% 25%)'}`,
          filter: isLedOn ? `drop-shadow(0 0 6px ${ledColor})` : 'none',
          transform: `rotate(${ledRotation}deg)`, transition: 'filter 0.05s',
        }} />;
      case 'segment': return <div style={{ ...baseStyle, borderRadius: 2 }} />;
      default: return <div style={{ ...baseStyle, borderRadius: '50%' }} />;
    }
  };

  // ===== PINBAR RENDERING =====
  if (node.type === 'PINBAR') {
    const mode = node.pinBarMode || 'input';
    const pinCount = Math.max(node.inputCount, node.outputCount);
    const vals = node.pinBarValues || Array(pinCount).fill(false);

    return (
      <div
        ref={nodeRef}
        className="absolute select-none cursor-grab active:cursor-grabbing group"
        style={{ left: node.x, top: node.y, width, height, zIndex: showSettings ? 9999 : undefined }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {isVerticalPinBar ? (
          <div className="absolute" style={{
            left: rot === 0 ? width - 4 : 0, top: 0,
            width: 4, height: '100%',
            backgroundColor: 'hsl(220 25% 35%)', borderRadius: 2,
          }} />
        ) : (
          <div className="absolute" style={{
            left: 0, top: rot === 90 ? height - 4 : 0,
            width: '100%', height: 4,
            backgroundColor: 'hsl(220 25% 35%)', borderRadius: 2,
          }} />
        )}

        {mode === 'input' && Array.from({ length: pinCount }, (_, i) => {
          const isOn = vals[i] ?? false;
          let tLeft: number, tTop: number;
          if (rot === 0) {
            tLeft = 0; tTop = (i + 1) * height / (pinCount + 1) - 9;
          } else if (rot === 90) {
            tLeft = (i + 1) * width / (pinCount + 1) - 9; tTop = 0;
          } else if (rot === 180) {
            tLeft = width - 18; tTop = (i + 1) * height / (pinCount + 1) - 9;
          } else {
            tLeft = (i + 1) * width / (pinCount + 1) - 9; tTop = height - 18;
          }
          return (
            <div
              key={`toggle-${i}`}
              className="absolute rounded cursor-pointer"
              style={{
                left: tLeft, top: tTop, width: 18, height: 18,
                backgroundColor: isOn ? 'hsl(45 90% 55%)' : 'hsl(228 10% 22%)',
                border: `2px solid ${isOn ? 'hsl(45 90% 70%)' : 'hsl(228 10% 35%)'}`,
                zIndex: 11, transition: 'all 0.1s',
              }}
              onPointerDown={(e) => { e.stopPropagation(); onTogglePinBarPin(node.id, i); }}
            />
          );
        })}

        {mode === 'output' && Array.from({ length: pinCount }, (_, i) => {
          const isOn = inputValues[i] ?? false;
          let tLeft: number, tTop: number;
          if (rot === 0) {
            tLeft = width - 26; tTop = (i + 1) * height / (pinCount + 1) - 9;
          } else if (rot === 90) {
            tLeft = (i + 1) * width / (pinCount + 1) - 9; tTop = height - 26;
          } else if (rot === 180) {
            tLeft = 8; tTop = (i + 1) * height / (pinCount + 1) - 9;
          } else {
            tLeft = (i + 1) * width / (pinCount + 1) - 9; tTop = 8;
          }
          return (
            <div
              key={`val-${i}`}
              className="absolute rounded"
              style={{
                left: tLeft, top: tTop, width: 18, height: 18,
                backgroundColor: isOn ? 'hsl(152 80% 45%)' : 'hsl(228 10% 22%)',
                border: `2px solid ${isOn ? 'hsl(152 80% 60%)' : 'hsl(228 10% 35%)'}`,
                zIndex: 11, transition: 'all 0.1s',
              }}
            />
          );
        })}

        {renderPins(mode === 'input' ? 'output' : 'input')}

        <button
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          style={{ backgroundColor: 'hsl(0 70% 50%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
          onPointerDown={(e) => { e.stopPropagation(); onDelete(node.id); }}
        >
          <X size={12} />
        </button>

        <button
          className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          style={{ backgroundColor: 'hsl(228 30% 35%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
          onPointerDown={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
        >
          <Settings size={10} />
        </button>

        {showSettings && renderSettingsPanel()}
      </div>
    );
  }

  // ===== LED RENDERING =====
  if (node.type === 'LED') {
    return (
      <div
        ref={nodeRef}
        className="absolute select-none cursor-grab active:cursor-grabbing group"
        style={{ left: node.x, top: node.y, width, height, zIndex: showSettings ? 9999 : undefined }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="w-full h-full flex items-center justify-center">
          {renderLedShape()}
        </div>
        {renderPins('input')}
        <button className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          style={{ backgroundColor: 'hsl(0 70% 50%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
          onPointerDown={(e) => { e.stopPropagation(); onDelete(node.id); }}>
          <X size={12} />
        </button>
        <button className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          style={{ backgroundColor: 'hsl(228 30% 35%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
          onPointerDown={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}>
          <Settings size={10} />
        </button>
        {showSettings && renderSettingsPanel()}
      </div>
    );
  }

  // ===== INPUT / OUTPUT as pinbar-style =====
  if (node.type === 'INPUT' || node.type === 'OUTPUT') {
    const isInput = node.type === 'INPUT';
    const isOn = isInput ? (node.inputValue ?? false) : (inputValues[0] ?? false);
    const barColor = isInput ? 'hsl(45 70% 30%)' : 'hsl(185 55% 25%)';
    const activeColor = isInput ? 'hsl(45 90% 55%)' : 'hsl(152 80% 45%)';
    const activeBorder = isInput ? 'hsl(45 90% 70%)' : 'hsl(152 80% 60%)';

    return (
      <div
        ref={nodeRef}
        className="absolute select-none cursor-grab active:cursor-grabbing group"
        style={{ left: node.x, top: node.y, width, height, zIndex: showSettings ? 9999 : undefined }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Vertical bar */}
        <div className="absolute" style={{
          left: isInput ? width - 4 : 0, top: 0,
          width: 4, height: '100%',
          backgroundColor: barColor, borderRadius: 2,
        }} />

        {/* Toggle / indicator square */}
        <div
          className="absolute rounded"
          style={{
            left: isInput ? 4 : width - 22,
            top: height / 2 - 9,
            width: 18, height: 18,
            backgroundColor: isOn ? activeColor : 'hsl(228 10% 22%)',
            border: `2px solid ${isOn ? activeBorder : 'hsl(228 10% 35%)'}`,
            cursor: isInput ? 'pointer' : 'default',
            zIndex: 11, transition: 'all 0.1s',
          }}
          onPointerDown={(e) => {
            if (isInput) { e.stopPropagation(); onToggle(node.id); }
          }}
        />

        {/* Label */}
        <span className="absolute text-[8px] font-bold tracking-wide pointer-events-none whitespace-nowrap" style={{
          color: 'hsl(210 15% 60%)',
          left: isInput ? 0 : 'auto',
          right: isInput ? 'auto' : 0,
          top: -14,
        }}>
          {(node.pinNames?.['output-0'] || node.pinNames?.['input-0']) || (isInput ? 'Input' : 'Output')}
        </span>

        {renderPins(isInput ? 'output' : 'input')}

        <button className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          style={{ backgroundColor: 'hsl(0 70% 50%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
          onPointerDown={(e) => { e.stopPropagation(); onDelete(node.id); }}>
          <X size={12} />
        </button>

        <button className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          style={{ backgroundColor: 'hsl(228 30% 35%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
          onPointerDown={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}>
          <Settings size={10} />
        </button>

        {showSettings && renderSettingsPanel()}
      </div>
    );
  }

  // ===== DEFAULT GATE / MODULE RENDERING =====
  return (
    <div
      ref={nodeRef}
      className="absolute select-none cursor-grab active:cursor-grabbing group"
      style={{ left: node.x, top: node.y, width, height, zIndex: showSettings ? 9999 : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="w-full h-full rounded-lg flex flex-col items-center justify-center relative"
        style={{ backgroundColor: style.bg, border: `2px solid ${style.border}` }}
      >
        <span className="text-xs font-bold tracking-wide truncate max-w-[100px]" style={{ color: 'hsl(210 15% 88%)' }}>
          {node.label}
        </span>
      </div>
      {renderPins('input')}
      {renderPins('output')}

      <button className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
        style={{ backgroundColor: 'hsl(0 70% 50%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
        onPointerDown={(e) => { e.stopPropagation(); onDelete(node.id); }}>
        <X size={12} />
      </button>

      {(node.type === 'MODULE' || node.inputCount > 0 || node.outputCount > 0) && (
        <button className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          style={{ backgroundColor: 'hsl(228 30% 35%)', color: 'white', zIndex: 20, transition: 'opacity 0.15s' }}
          onPointerDown={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}>
          <Settings size={10} />
        </button>
      )}

      {showSettings && renderSettingsPanel()}
    </div>
  );
}
