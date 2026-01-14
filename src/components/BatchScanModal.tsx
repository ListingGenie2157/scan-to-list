import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Camera, X } from 'lucide-react';
import WebBarcodeScanner from '@/components/WebBarcodeScanner';
import { normalizeScan, lookupIsbn, upsertItem, storeCover, type LookupMeta } from '@/lib/scanning';
import { useScannerSettings } from '@/hooks/useScannerSettings';
import { useItemTypeSetting } from '@/hooks/useItemTypeSetting';
import { ItemTypeToggle } from '@/components/ItemTypeToggle';
import { ScanMeta } from '@/types/scan';

  interface BatchScanModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (data: ScanMeta) => void;
  }

export function BatchScanModal({ open, onOpenChange, onSuccess }: BatchScanModalProps) {
  const [showWebScanner, setShowWebScanner] = useState(false);
  const [lastScans, setLastScans] = useState<string[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const recentSet = useRef<Map<string, number>>(new Map());
  const { toast } = useToast();
  const { mirrorCovers, setMirrorCovers } = useScannerSettings();
  const { itemType, setItemType } = useItemTypeSetting();

  const addLastScan = (line: string) => {
    setLastScans((prev) => [...prev.slice(-5), line]); // Keep last 5 scans
  };

    const beep = () => {
      try {
        interface WindowWithWebkitAudio extends Window {
          webkitAudioContext: typeof AudioContext;
        }
        const AudioCtx = window.AudioContext || (window as unknown as WindowWithWebkitAudio).webkitAudioContext;
        const ctx = new AudioCtx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        o.stop(ctx.currentTime + 0.12);
      } catch (error: unknown) {
        console.warn('Beep failed:', error);
      }
    };

  const handleWebCode = async (code: string) => {
    const now = Date.now();
    const prevTs = recentSet.current.get(code) || 0;
    if (now - prevTs < 2000) return; // throttle duplicates 2s
    recentSet.current.set(code, now);

    beep();
    addLastScan(code);
    
      // Process in background without stopping scanner
      processBarcode(code).catch((err: unknown) => {
        console.error('Background process error:', err);
      });
  };

  const processBarcode = async (barcodeRaw: string) => {
    try {
      const normalized = normalizeScan(barcodeRaw);
      let codeToUse: string | null = normalized;
      
      if (!normalized) {
        const rawDigits = String(barcodeRaw).replace(/\D/g, '');
        if (rawDigits.length === 12) {
          codeToUse = rawDigits;
        }
      }
      
      if (!codeToUse) {
        toast({ 
          title: 'Invalid code', 
          description: `Skipped invalid barcode: ${barcodeRaw}`, 
          variant: 'destructive' 
        });
        return;
      }

        const meta = await lookupIsbn(codeToUse);
      if (!meta) {
        toast({ 
          title: 'Not found', 
          description: `No details found for: ${codeToUse}`, 
          variant: 'destructive' 
        });
        return;
      }

      const finalItemType: 'book' | 'magazine' | 'bundle' = itemType === 'bundle' ? 'bundle' : (itemType || ((meta.type === 'magazine' || meta.type === 'product') ? 'magazine' : 'book'));
      const upsertItemType: 'book' | 'magazine' = itemType === 'bundle' ? 'book' : (itemType || ((meta.type === 'magazine' || meta.type === 'product') ? 'magazine' : 'book'));

      const itemId = await upsertItem(meta as NonNullable<LookupMeta>, upsertItemType);
      
      if (mirrorCovers && meta.coverUrl) {
        try {
          await storeCover(itemId, meta.coverUrl, finalItemType);
          } catch (e: unknown) {
            console.warn('Cover mirror failed:', e);
          }
      }

      setProcessedCount(prev => prev + 1);
      const displayCode = meta.barcode || meta.isbn13 || 'Unknown';
      toast({ 
        title: 'Added to inventory', 
        description: `${displayCode} – ${meta.title || 'Untitled'}` 
      });
      
      onSuccess?.(meta as ScanMeta);
      } catch (error: unknown) {
        console.error('Batch scan error:', error);
      toast({ 
        title: 'Processing error', 
        description: `Failed to process: ${barcodeRaw}`,
        variant: 'destructive' 
      });
    }
  };

  const startScanner = () => {
    setShowWebScanner(true);
    setProcessedCount(0);
    setLastScans([]);
  };

  const stopScanner = () => {
    setShowWebScanner(false);
  };

  const handleClose = () => {
    setShowWebScanner(false);
    onOpenChange(false);
    setProcessedCount(0);
    setLastScans([]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Batch Barcode Scanner</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Item Type Toggle - Prominent */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">What are you scanning?</Label>
              <ItemTypeToggle value={itemType} onChange={setItemType} className="w-full justify-center" />
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Scanner Status</span>
                <Badge variant={showWebScanner ? "default" : "outline"}>
                  {showWebScanner ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <div className="text-2xl font-bold text-center mb-2">
                {processedCount}
              </div>
              <div className="text-sm text-muted-foreground text-center">
                Items processed this session
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="mirror-covers" 
                  checked={mirrorCovers} 
                  onCheckedChange={setMirrorCovers} 
                />
                <Label htmlFor="mirror-covers" className="text-sm">
                  Auto-populate book covers
                </Label>
              </div>
            </div>

            {lastScans.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Recent Scans:</span>
                <div className="space-y-1">
                  {lastScans.slice(-3).map((scan, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {scan}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!showWebScanner ? (
                <Button onClick={startScanner} className="flex-1">
                  <Camera className="w-4 h-4 mr-2" />
                  Start Batch Scan
                </Button>
              ) : (
                <Button onClick={stopScanner} variant="outline" className="flex-1">
                  <X className="w-4 h-4 mr-2" />
                  Stop Scanner
                </Button>
              )}
              
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>• Scanner will stay open until you stop it</p>
              <p>• Duplicate scans within 2 seconds are ignored</p>
              <p>• Items are automatically added to your inventory</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showWebScanner && (
        <WebBarcodeScanner
          onCode={handleWebCode}
          onClose={stopScanner}
          continuous={true}
          overlayLines={lastScans}
        />
      )}
    </>
  );
}