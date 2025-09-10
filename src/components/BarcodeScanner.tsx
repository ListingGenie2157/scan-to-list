import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Camera } from 'lucide-react';
import WebBarcodeScanner from '@/components/WebBarcodeScanner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { normalizeScan, lookupIsbn, upsertItem, storeCover } from '@/lib/scanning';
import { useScannerSettings } from '@/hooks/useScannerSettings';
import { useItemTypeSetting } from '@/hooks/useItemTypeSetting';
import { MagazineIssueModal } from '@/components/MagazineIssueModal';

interface BarcodeScannerProps {
  onScanSuccess?: (data: any) => void;
}

export const BarcodeScannerComponent = ({ onScanSuccess }: BarcodeScannerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWebScanner, setShowWebScanner] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [lastScans, setLastScans] = useState<string[]>([]);
  const [showMagazineModal, setShowMagazineModal] = useState(false);
  const [pendingMagazineMeta, setPendingMagazineMeta] = useState<any>(null);
  const recentSet = useRef<Map<string, number>>(new Map());
  const { toast } = useToast();
  const { mirrorCovers, setMirrorCovers } = useScannerSettings();
  const { itemType } = useItemTypeSetting();

  const addLastScan = (line: string) => {
    setLastScans((prev) => [...prev.slice(-2), line]);
  };

  const beep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 880; // A5
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      o.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  const handleWebCode = async (code: string) => {
    const now = Date.now();
    const prevTs = recentSet.current.get(code) || 0;
    if (now - prevTs < 2000) return; // throttle duplicates 2s
    recentSet.current.set(code, now);

    beep();

    if (batchMode) {
      addLastScan(code);
      // Fire and forget (no closing the scanner)
      processBarcode(code).catch(() => {/* already toasting errors */});
    } else {
      setIsProcessing(true);
      try {
        await processBarcode(code);
      } finally {
        setIsProcessing(false);
        setShowWebScanner(false);
      }
    }
  };

  const startScan = () => {
    setShowWebScanner(true);
  };

  const processBarcode = async (barcodeRaw: string) => {
    try {
      const normalized = normalizeScan(barcodeRaw);
      if (!normalized) {
        toast({ title: 'Invalid code', description: 'Unsupported barcode. Please scan a valid ISBN-13 or UPC.', variant: 'destructive' });
        return;
      }

      // Lookup product info using our Supabase edge function. It will handle books, magazines and generic UPCs.
      const meta = await lookupIsbn(normalized);
      if (!meta) {
        toast({ title: 'Not found', description: 'No details found for this code.', variant: 'destructive' });
        return;
      }

      // Check if this is a magazine that needs disambiguation
      if (
        meta.type === 'magazine' && meta.barcode && 
        (
          !meta.title ||
          meta.title.toLowerCase().includes('magazine') ||
          // Trigger disambiguation if an add-on exists or title lacks series markers
          (!!meta.barcode_addon) ||
          !/(issue|vol\.?|volume|no\.?|\b\d{4}\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(meta.title)
        )
      ) {
        // Show magazine issue modal for generic magazine results
        setPendingMagazineMeta(meta);
        setShowMagazineModal(true);
        return;
      }

      await completeSave(meta);
    } catch (error) {
      console.error('Barcode processing error:', error);
      toast({ title: 'Error', description: 'Failed to process barcode', variant: 'destructive' });
    }
  };

  const completeSave = async (meta: any) => {
    try {
      // Determine item type for cover storage based on meta.type or user setting
      const finalItemType: 'book' | 'magazine' | 'bundle' = itemType === 'bundle' ? 'bundle' : (itemType || ((meta.type === 'magazine' || meta.type === 'product') ? 'magazine' : 'book'));
      const upsertItemType: 'book' | 'magazine' = itemType === 'bundle' ? 'book' : (itemType || ((meta.type === 'magazine' || meta.type === 'product') ? 'magazine' : 'book'));

      const itemId = await upsertItem(meta, upsertItemType);
      if (mirrorCovers && meta.coverUrl) {
        try {
          await storeCover(itemId, meta.coverUrl, finalItemType);
        } catch (e) {
          console.warn('Cover mirror failed:', e);
        }
      }

      const displayCode = meta.barcode || meta.isbn13 || 'Unknown';
      toast({ title: 'Saved', description: `Saved ${displayCode} – ${meta.title || 'Untitled'}` });
      onScanSuccess?.(meta);
    } catch (error) {
      console.error('Barcode processing error:', error);
      toast({ title: 'Error', description: 'Failed to process barcode', variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 flex-wrap">
        <Button onClick={startScan} disabled={isProcessing}>
          <Camera className="w-4 h-4 mr-2" />
          {batchMode ? 'Start Batch Scan' : 'Scan Barcode'}
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
