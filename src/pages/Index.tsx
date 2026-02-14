import { CircuitProvider } from '@/context/CircuitContext';
import { Canvas } from '@/components/sandbox/Canvas';

const Index = () => {
  return (
    <CircuitProvider>
      <Canvas />
    </CircuitProvider>
  );
};

export default Index;
