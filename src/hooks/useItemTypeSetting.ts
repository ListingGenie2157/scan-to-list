import { useEffect, useState } from "react";

type ItemType = 'book' | 'magazine';

const KEY = 'defaultItemType';

export function useItemTypeSetting() {
  const [itemType, setItemType] = useState<ItemType>('book');

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as ItemType | null;
      if (v === 'book' || v === 'magazine') setItemType(v);
    } catch (error) {
      // Swallow errors from unavailable storage environments
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, itemType); } catch (error) {
      // Ignore persistence errors
    }
  }, [itemType]);

  return { itemType, setItemType } as const;
}
