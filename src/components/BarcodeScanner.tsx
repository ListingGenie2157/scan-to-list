import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Camera } from 'lucide-react';
import WebBarcodeScanner from '@/components/WebBarcodeScanner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface BarcodeScannerProps {
  onScanSuccess?: (data: any) => void;
}

export const BarcodeScannerComponent = ({ onScanSuccess }: BarcodeScannerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWebScanner, setShowWebScanner] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [lastScans, setLastScans] = useState<string[]>([]);
  const recentSet = useRef<Map<string, number>>(new Map());
  const { toast } = useToast();

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

  function normalize(raw: string): { kind: 'ISBN13' | 'ISBN10' | 'UPCA' | 'UNKNOWN'; value: string } {
    // Strip non-digits and any EAN/UPC add-ons (like EAN-5/2 separated by space or plus)
    let digits = (raw || '').replace(/[^0-9]/g, '');
    if (digits.length === 15 && (digits.startsWith('978') || digits.startsWith('979'))) {
      // Some scanners might append 2-digit addon to ISBN-13 (rare); trim to 13
      digits = digits.slice(0, 13);
    }
    if (digits.length === 18 && (digits.startsWith('978') || digits.startsWith('979'))) {
      // ISBN-13 + EAN-5 addon
      digits = digits.slice(0, 13);
    }

    if (digits.length === 13 && (digits.startsWith('978') || digits.startsWith('979'))) {
      return { kind: 'ISBN13', value: digits };
    }
    if (digits.length === 10) {
      return { kind: 'ISBN10', value: digits };
    }
    if (digits.length === 12) {
      return { kind: 'UPCA', value: digits };
    }
    return { kind: 'UNKNOWN', value: digits };
  }

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
      const norm = normalize(barcodeRaw);
      if (norm.kind === 'UPCA') {
        toast({ title: 'Unsupported UPC', description: 'Only books (ISBN) are supported in this mode.' });
        return;
      }
      if (norm.kind === 'UNKNOWN') {
        toast({ title: 'Invalid code', description: 'Could not recognize this barcode.' , variant: 'destructive'});
        return;
      }

      // Convert ISBN-10 -> ISBN-13 if needed
      const normalizedBarcode = norm.kind === 'ISBN10' ? `978${norm.value}` : norm.value;

      // Lookup via edge function
      const { data, error } = await supabase.functions.invoke('lookup-product', {
        body: { barcode: normalizedBarcode }
      });
      if (error) throw error;

      if (!data?.success) {
        toast({ title: 'Product Not Found', description: 'No details found for this code.', variant: 'destructive' });
        return;
      }

      const info = data.productInfo || {};

      // Insert into items
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const authors = info.author ? [String(info.author)] : null;
      const coverUrl: string | undefined = info.cover_url_ext || info.coverUrl || info.cover || undefined;

      const insertPayload: any = {
        user_id: userId,
        title: info.title ?? null,
        authors,
        publisher: info.publisher ?? null,
        year: info.publication_year ? String(info.publication_year) : null,
        isbn13: normalizedBarcode.length === 13 ? normalizedBarcode : null,
        isbn10: norm.kind === 'ISBN10' ? norm.value : null,
        type: info.type || 'book',
        status: 'draft',
        quantity: 1,
        source: 'barcode',
        last_scanned_at: new Date().toISOString(),
        cover_url_ext: coverUrl ?? null,
      };

      const { data: itemInsert, error: itemErr } = await supabase
        .from('items')
        .insert(insertPayload)
        .select('id')
        .maybeSingle();

      if (itemErr) throw itemErr;
      const itemId = itemInsert?.id;

      // If we have an external cover, mirror it to our photos bucket and link
      if (itemId && coverUrl) {
        try {
          await mirrorCoverToPhotos(coverUrl, String(itemId), userId);
        } catch (e) {
          console.warn('Cover mirror failed:', e);
        }
      }

      toast({ title: 'Saved', description: `Saved ${normalizedBarcode} → ${info.title || 'Untitled'}` });
      onScanSuccess?.(info);
    } catch (error) {
      console.error('Barcode processing error:', error);
      toast({ title: 'Error', description: 'Failed to process barcode', variant: 'destructive' });
    }
  };

  async function mirrorCoverToPhotos(url: string, itemId: string, userId: string) {
    const res = await fetch(url, { mode: 'cors' }).catch(() => fetch(url));
    if (!res.ok) throw new Error('Failed to fetch cover');
    const blob = await res.blob();

    // Create thumbnail
    const thumbBlob = await createThumbnail(blob, 320);

    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const basePath = `${userId}/items/${itemId}`;
    const fileName = `cover-${Date.now()}.${ext}`;
    const thumbName = `cover-${Date.now()}-thumb.webp`;

    const { error: upErr } = await supabase.storage.from('photos').upload(`${basePath}/${fileName}`, blob, {
      cacheControl: '3600', upsert: true, contentType: blob.type || `image/${ext}`
    });
    if (upErr) throw upErr;

    const { error: upThumbErr } = await supabase.storage.from('photos').upload(`${basePath}/${thumbName}`, thumbBlob, {
      cacheControl: '3600', upsert: true, contentType: 'image/webp'
    });
    if (upThumbErr) throw upThumbErr;

    const { data: pub1 } = supabase.storage.from('photos').getPublicUrl(`${basePath}/${fileName}`);
    const { data: pub2 } = supabase.storage.from('photos').getPublicUrl(`${basePath}/${thumbName}`);

    // Insert into photos table
    await supabase.from('photos').insert({
      item_id: Number(itemId),
      file_name: fileName,
      storage_path: `${basePath}/${fileName}`,
      public_url: pub1.publicUrl,
      url_public: pub1.publicUrl,
      thumb_url: pub2.publicUrl,
    });
  }

  async function createThumbnail(file: Blob, maxSize: number): Promise<Blob> {
    const img = await blobToImage(file);
    const [w, h] = fitWithin(img.naturalWidth, img.naturalHeight, maxSize);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/webp', 0.86));
    return blob;
  }

  function fitWithin(w: number, h: number, max: number): [number, number] {
    const ratio = Math.min(max / w, max / h, 1);
    return [Math.round(w * ratio), Math.round(h * ratio)];
    }

  function blobToImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Button onClick={startScan} disabled={isProcessing}>
          <Camera className="w-4 h-4 mr-2" />
          {batchMode ? 'Start Batch Scan' : 'Scan Barcode'}
        </Button>
        <div className="flex items-center gap-2">
          <Switch id="batch-scan" checked={batchMode} onCheckedChange={setBatchMode} />
          <Label htmlFor="batch-scan">Batch Scan</Label>
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
    </>
  );
};
