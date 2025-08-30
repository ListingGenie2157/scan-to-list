import { useEffect, useState } from "react";

const KEY = 'mirrorExternalCovers';

export function useScannerSettings() {
  const [mirrorCovers, setMirrorCovers] = useState<boolean>(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === null) {
        setMirrorCovers(true); // default ON
      } else {
        setMirrorCovers(v === '1');
      }
    } catch {
      setMirrorCovers(true);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, mirrorCovers ? '1' : '0');
    } catch {}
  }, [mirrorCovers]);

  return { mirrorCovers, setMirrorCovers } as const;
}
