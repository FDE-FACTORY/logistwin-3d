import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from './config.js';
import { useStore } from './store.js';

/** 백엔드 WebSocket 연결 — init/state/patch를 스토어에 반영, 명령 전송 채널 주입. */
export function useSocket() {
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket', 'polling'] });
    const { applyInit, applyState, applyPatch, setConnected, setEmit } = useStore.getState();

    setEmit((event, payload) => socket.emit(event, payload));

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('init', applyInit);
    socket.on('state', applyState);
    socket.on('patch', applyPatch); // 명령 결과 즉시 반영(저지연)

    return () => {
      setEmit(null);
      socket.close();
    };
  }, []);
}
