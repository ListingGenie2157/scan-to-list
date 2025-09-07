import { useEffect, useState } from "react";

type Marketplace = 'ebay' | 'amazon';

const KEY = 'defaultMarketplace';

export function useMarketplaceSetting() {
  const [marketplace, setMarketplace] = useState<Marketplace>('ebay');

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as Marketplace | null;
      if (v === 'ebay' || v === 'amazon') setMarketplace(v);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, marketplace); } catch {}
  }, [marketplace]);

  return { marketplace, setMarketplace } as const;
}