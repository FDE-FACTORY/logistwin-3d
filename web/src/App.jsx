import { useSocket } from './useSocket.js';
import { useStore } from './store.js';
import Scene from './components/Scene.jsx';
import Plan2D from './components/Plan2D.jsx';
import MapView from './components/MapView.jsx';
import Hud from './components/Hud.jsx';

export default function App() {
  useSocket();
  const view = useStore((s) => s.view);
  return (
    <div className="relative h-full w-full">
      {view === '3D' && <Scene />}
      {view === '2D' && <Plan2D />}
      {view === 'MAP' && <MapView />}
      <Hud />
    </div>
  );
}
