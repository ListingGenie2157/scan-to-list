import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Camera } from 'lucide-react';
import WebBarcodeScanner from '@/components/WebBarcodeScanner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { normalizeScan, lookupIsbn, upsertItem, storeCover, type LookupMeta } from '@/lib/scanning';
import { useScannerSettings } from '@/hooks/useScannerSettings';
import { useItemTypeSetting } from '@/hooks/useItemTypeSetting';
import { MagazineIssueModal } from '@/components/MagazineIssueModal';
import { ScanMeta, ItemType } from '@/types/scan';

interface BarcodeScannerProps {
  onScanSuccess?: (data: ScanMeta) => void;
}

const DUPLICATE_WINDOW_MS = 2000;
const RECENT_SET_MAX = 500;

// Beep settings
const BEEP_FREQ = 880; // A5
const BEEP_ATTACK = 0.01;
const BEEP_DECAY = 0.12;
const BEEP_PEAK_GAIN = 0.2;
const BEEP_FLOOR_GAIN = 0.0001;

export const BarcodeScannerComponent = ({ onScanSuccess }: BarcodeScannerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWebScanner, setShowWebScanner] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [lastScans, setLastScans] = useState<string[]>([]);
  const [showMagazineModal, setShowMagazineModal] = useState(false);
  const [pendingMagazineMeta, setPendingMagazineMeta] = useState<LookupMeta | null>(null);

  const recentSet = useRef<Map<string, number>>(new Map<string, number>());
  const { toast } = useToast();
  const { mirrorCovers, setMirrorCovers } = useScannerSettings();
  const { itemType } = useItemTypeSetting();

  const audioCtxRef = useRef<AudioContext | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (error: unknown) {
          console.warn('Failed to close audio context', error);
        }
        audioCtxRef.current = null;
      }
    };
  }, []);

  const addLastScan = useCallback((line: string) => {
    setLastScans(prev => [...prev.slice(-2), line]);
  }, []);

  const beep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        // @ts-expect-error - webkitAudioContext for Safari
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current!;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = BEEP_FREQ;
      g.gain.setValueAtTime(BEEP_FLOOR_GAIN, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(BEEP_PEAK_GAIN, ctx.currentTime + BEEP_ATTACK);
      o.start();
      g.gain.exponentialRampToValueAtTime(BEEP_FLOOR_GAIN, ctx.currentTime + BEEP_DECAY);
      o.stop(ctx.currentTime + BEEP_DECAY);
    } catch {
      // ignore audio errors
    }
  }, []);

  const shouldThrottle = useCallback((code: string) => {
    const now = Date.now();
    const prevTs = recentSet.current.get(code) || 0;
    if (now - prevTs < DUPLICATE_WINDOW_MS) return true;

    recentSet.current.set(code, now);
    if (recentSet.current.size > RECENT_SET_MAX) {
      const entries = [...recentSet.current.entries()].sort((a, b) => a[1] - b[1]);
      const removeCount = Math.floor(RECENT_SET_MAX * 0.1) || 1;
      for (let i = 0; i < removeCount && i < entries.length; i++) {
        recentSet.current.delete(entries[i][0]);
      }
    }
    return false;
  }, []);

  const resolveTypes = useCallback(
    (meta: LookupMeta): { finalItemType: ItemType; upsertItemType: Exclude<ItemType, 'bundle'> } => {
      // If UI is "bundle", persist as "book" but store cover under "bundle".
      // This mirrors existing behavior. Adjust if you add real bundle records.
      const finalItemType: ItemType =
        itemType === 'bundle'
          ? 'bundle'
          : (itemType || ((meta.type === 'magazine' || meta.type === 'product') ? 'magazine' : 'book'));

      const upsertItemType: 'book' | 'magazine' =
        itemType === 'bundle'
          ? 'book'
          : (itemType || ((meta.type === 'magazine' || meta.type === 'product') ? 'magazine' : 'book'));

      return { finalItemType, upsertItemType };
    },
    [itemType]
  );

  const completeSave = useCallback(
    async (meta: LookupMeta) => {
      try {
        const { finalItemType, upsertItemType } = resolveTypes(meta);
        const itemId = await upsertItem(meta as NonNullable<LookupMeta>, upsertItemType);

        if (mirrorCovers && meta.coverUrl) {
          try {
            await storeCover(itemId, meta.coverUrl, finalItemType);
          } catch (e: unknown) {
            console.warn('Cover mirror failed:', e);
          }
        }

        const displayCode = meta.barcode || meta.isbn13 || 'Unknown';
        if (isMounted.current) {
          toast({ title: 'Saved', description: `Saved ${displayCode} – ${meta.title || 'Untitled'}` });
          onScanSuccess?.(meta as ScanMeta);
        }
      } catch (error: unknown) {
        console.error('Save error:', error);
        if (isMounted.current) {
          toast({ title: 'Error', description: 'Failed to save item', variant: 'destructive' });
        }
      }
    },
    [mirrorCovers, onScanSuccess, resolveTypes, toast]
  );

  const processBarcode = useCallback(
    async (barcodeRaw: string) => {
      try {
        const normalized = normalizeScan(barcodeRaw);
        if (!normalized) {
          if (isMounted.current) {
            toast({
              title: 'Invalid code',
              description: 'Unsupported barcode. Please scan a valid ISBN-13 or UPC.',
              variant: 'destructive'
            });
          }
          return;
        }

        const meta = await lookupIsbn(normalized);
        if (!meta) {
          if (isMounted.current) {
            toast({ title: 'Not found', description: 'No details found for this code.', variant: 'destructive' });
          }
          return;
        }

        // Magazine disambiguation
        if (
          meta.type === 'magazine' &&
          meta.barcode &&
          (
            !meta.title ||
            meta.title.toLowerCase().includes('magazine') ||
            !!meta.barcode_addon ||
            !/(issue|vol\.?|volume|no\.?|\b\d{4}\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(meta.title)
          )
        ) {
          setPendingMagazineMeta(meta);
          setShowMagazineModal(true);
          return;
        }

        await completeSave(meta);
      } catch (error: unknown) {
        console.error('Barcode processing error:', error);
        if (isMounted.current) {
          toast({ title: 'Error', description: 'Failed to process barcode', variant: 'destructive' });
        }
      }
    },
    [completeSave, toast]
  );

  const handleWebCode = useCallback(
    async (code: string) => {
      if (shouldThrottle(code)) return;

      beep();

      if (batchMode) {
        addLastScan(code);
          // Fire and forget to keep scanning fluid
          processBarcode(code).catch(() => {
            /* errors are toasted */
          });
        return;
      }

      setIsProcessing(true);
      try {
        await processBarcode(code);
      } finally {
        if (isMounted.current) {
          setIsProcessing(false);
          setShowWebScanner(false);
        }
      }
    },
    [addLastScan, batchMode, beep, processBarcode, shouldThrottle]
  );

  const startScan = useCallback(() => {
    setShowWebScanner(true);
  }, []);

  const scanButtonLabel = useMemo(
    () => (batchMode ? 'Start Batch Scan' : 'Scan Barcode'),
    [batchMode]
  );

  return (
    <>
      <div className="flex items-center gap-4 flex-wrap">
        <Button onClick={startScan} disabled={isProcessing || showWebScanner}>
          <Camera className="w-4 h-4 mr-2" />
          {scanButtonLabel}
        </Button>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex items-center space-x-2">
            <Switch id="batch-scan" checked={batchMode} onCheckedChange={setBatchMode} />
            <Label htmlFor="batch-scan">Batch Scan (keep scanner open)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="mirror-covers" checked={mirrorCovers} onCheckedChange={setMirrorCovers} />
            <Label htmlFor="mirror-covers">Auto-populate book covers</Label>
          </div>
        </div>
      </div>

      {showWebScanner && (
        <WebBarcodeScanner
          onCode={handleWebCode}
          onClose={() => setShowWebScanner(false)}
          continuous={batchMode}
          overlayLines={lastScans}
        />
      )}

      {showMagazineModal && pendingMagazineMeta && (
        <MagazineIssueModal
          open={showMagazineModal}
          onOpenChange={setShowMagazineModal}
          meta={pendingMagazineMeta}
          onConfirm={completeSave}
        />
      )}
    </>
  );
};
