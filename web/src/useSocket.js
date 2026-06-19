import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from './config.js';
import { useStore } from './store.js';

/** 백엔드 WebSocket 연결 — init/state를 스토어에 반영. */
export function useSocket() {
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket', 'polling'] });
    const { applyInit, applyState, setConnected } = useStore.getState();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('init', applyInit);
    socket.on('state', applyState);

    return () => socket.close();
  }, []);
}
