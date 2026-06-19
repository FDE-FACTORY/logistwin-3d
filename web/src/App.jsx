import { useSocket } from './useSocket.js';
import { useStore } from './store.js';
import Scene from './components/Scene.jsx';
import Plan2D from './components/Plan2D.jsx';
import Hud from './components/Hud.jsx';

export default function App() {
  useSocket();
  const view = useStore((s) => s.view);
  return (
    <div className="relative w-full h-full">
      {view === '3D' ? <Scene /> : <Plan2D />}
      <Hud />
    </div>
  );
}
