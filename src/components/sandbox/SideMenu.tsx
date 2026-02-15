import { useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { GateType, ModuleDefinition } from '@/types/circuit';
import { Menu, Plus, Trash2, Zap, ToggleLeft, Lightbulb, Box, ChevronDown, ChevronRight, Search, Cable } from 'lucide-react';

const ALL_ITEMS: { type: GateType; label: string; icon: React.ReactNode }[] = [
  { type: 'AND', label: 'VE Kapısı', icon: <Zap size={16} /> },
  { type: 'OR', label: 'VEYA Kapısı', icon: <Zap size={16} /> },
  { type: 'NOT', label: 'DEĞİL Kapısı', icon: <Zap size={16} /> },
  { type: 'INPUT', label: 'Giriş', icon: <ToggleLeft size={16} /> },
  { type: 'OUTPUT', label: 'Çıkış', icon: <Box size={16} /> },
  { type: 'LED', label: 'LED', icon: <Lightbulb size={16} /> },
  { type: 'PINBAR', label: 'Pin Bar', icon: <Cable size={16} /> },
];

export function SideMenu() {
  const { state, dispatch } = useCircuit();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectTool = (tool: GateType, moduleId?: string) => {
    dispatch({ type: 'SET_TOOL', tool, moduleId: moduleId || null });
    setOpen(false);
  };

  const createModule = () => {
    const { nodes, connections } = state;
    const inputNodes = nodes.filter(n => n.type === 'INPUT');
    const outputNodes = nodes.filter(n => n.type === 'OUTPUT');
    if (inputNodes.length === 0 || outputNodes.length === 0) {
      alert('Modül oluşturmak için en az bir GİRİŞ ve bir ÇIKIŞ düğümü gereklidir.');
      return;
    }
    const name = prompt('Modül adı:');
    if (!name?.trim()) return;
    const module: ModuleDefinition = {
      id: crypto.randomUUID(), name: name.trim(),
      nodes: nodes.map(n => ({ ...n })), connections: connections.map(c => ({ ...c })),
      inputNodeIds: inputNodes.map(n => n.id), outputNodeIds: outputNodes.map(n => n.id),
      inputCount: inputNodes.length, outputCount: outputNodes.length,
    };
    dispatch({ type: 'CREATE_MODULE', module });
    alert(`"${name}" modülü oluşturuldu!`);
  };

  const deleteModule = (id: string, name: string) => {
    if (confirm(`"${name}" modülünü silmek istediğinize emin misiniz?`)) {
      dispatch({ type: 'DELETE_MODULE', id });
    }
  };

  const q = search.toLowerCase();
  const filteredItems = ALL_ITEMS.filter(i => i.label.toLowerCase().includes(q));
  const filteredModules = state.modules.filter(m => m.name.toLowerCase().includes(q));

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 w-12 h-12 rounded-lg flex items-center justify-center transition-colors"
        style={{ backgroundColor: 'hsl(228 18% 12%)', border: '1px solid hsl(228 15% 22%)', color: 'hsl(210 15% 88%)' }}
      >
        <Menu size={22} />
      </button>

      <div
        className="fixed top-0 left-0 h-full z-40 overflow-y-auto transition-transform duration-200"
        style={{ width: 260, backgroundColor: 'hsl(228 18% 10%)', borderRight: '1px solid hsl(228 15% 20%)', transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="pt-20 px-4 pb-6 space-y-2">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'hsl(215 10% 40%)' }} />
            <input
              type="text" placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-md text-sm outline-none"
              style={{ backgroundColor: 'hsl(228 15% 14%)', border: '1px solid hsl(228 15% 22%)', color: 'hsl(210 15% 82%)' }}
            />
          </div>

          {filteredItems.length > 0 && (
            <CollapsibleSection title="Ana Bileşenler" defaultOpen>
              {filteredItems.map(item => (
                <ToolButton key={item.type} label={item.label} icon={item.icon} onClick={() => selectTool(item.type)} />
              ))}
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Modüllerim" defaultOpen>
            {filteredModules.length === 0 && <p className="text-xs" style={{ color: 'hsl(215 10% 45%)' }}>{q ? 'Eşleşme yok' : 'Henüz modül yok'}</p>}
            {filteredModules.map(m => (
              <div key={m.id} className="flex items-center gap-1 group/mod">
                <ToolButton label={`${m.name} (${m.inputCount}→${m.outputCount})`} icon={<Box size={16} />} onClick={() => selectTool('MODULE', m.id)} className="flex-1 min-w-0" />
                <button className="p-1 rounded opacity-0 group-hover/mod:opacity-100 transition-opacity shrink-0" style={{ color: 'hsl(0 70% 55%)' }} onClick={() => deleteModule(m.id, m.name)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className="w-full mt-2 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-colors" style={{ backgroundColor: 'hsl(152 60% 25%)', color: 'hsl(152 60% 90%)', border: '1px solid hsl(152 60% 35%)' }} onClick={createModule}>
              <Plus size={14} /> Modül Oluştur
            </button>
          </CollapsibleSection>
        </div>
      </div>
    </>
  );
}

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div>
      <button className="w-full flex items-center gap-1 py-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'hsl(215 10% 50%)' }} onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {isOpen && <div className="space-y-1 pb-2">{children}</div>}
    </div>
  );
}

function ToolButton({ label, icon, onClick, className = '' }: { label: string; icon: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      className={`w-full py-2 px-3 rounded-md text-sm text-left flex items-center gap-2 transition-colors ${className}`}
      style={{ color: 'hsl(210 15% 82%)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(228 15% 16%)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      onClick={onClick}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
