import { useSocket } from './useSocket.js';
import Scene from './components/Scene.jsx';
import Hud from './components/Hud.jsx';

export default function App() {
  useSocket();
  return (
    <div className="relative w-full h-full">
      <Scene />
      <Hud />
    </div>
  );
}
