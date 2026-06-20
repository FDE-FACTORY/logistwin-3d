import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

/**
 * 타일링 PBR 텍스처 로더 (diff + rough). drei useTexture가 URL 단위로 캐시하므로
 * 여러 컴포넌트에서 같은 텍스처를 불러도 1회만 로드됩니다.
 */
export function useTiled(diffUrl, roughUrl, rx = 1, ry = 1) {
  const [map, roughnessMap] = useTexture([diffUrl, roughUrl]);
  useMemo(() => {
    [map, roughnessMap].forEach((t) => {
      if (!t) return;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 4;
    });
  }, [map, roughnessMap, rx, ry]);
  return { map, roughnessMap };
}
