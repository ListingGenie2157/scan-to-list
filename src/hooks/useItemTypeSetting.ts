import { useEffect, useState } from "react";

type ItemType = 'book' | 'magazine' | 'bundle';

const KEY = 'defaultItemType';

export function useItemTypeSetting() {
  const [itemType, setItemType] = useState<ItemType>('book');

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as ItemType | null;
      if (v === 'book' || v === 'magazine' || v === 'bundle') setItemType(v);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, itemType); } catch {}
  }, [itemType]);

  return { itemType, setItemType } as const;
}
