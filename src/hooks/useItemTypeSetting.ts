import { useEffect, useState } from "react";

type ItemType = 'book' | 'magazine' | 'bundle';

const KEY = 'defaultItemType';

export function useItemTypeSetting() {
  const [itemType, setItemType] = useState<ItemType>('book');

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as ItemType | null;
      if (v === 'book' || v === 'magazine' || v === 'bundle') setItemType(v);
    } catch (err) {
      console.warn('Failed to load item type from storage', err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, itemType);
    } catch (err) {
      console.warn('Failed to save item type to storage', err);
    }
  }, [itemType]);

  return { itemType, setItemType } as const;
}
