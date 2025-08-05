import { useState } from 'react';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Camera, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess?: (data: any) => void;
}

export const BarcodeScannerComponent = ({ onScanSuccess }: BarcodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const checkPermissions = async () => {
    const status = await BarcodeScanner.checkPermission({ force: true });
    
    if (status.granted) {
      return true;
    }
    
    if (status.denied) {
      toast({
        title: "Permission Denied",
        description: "Camera permission is required for barcode scanning",
        variant: "destructive"
      });
      return false;
    }
    
    return false;
  };

  const startScan = async () => {
    const hasPermission = await checkPermissions();
    if (!hasPermission) return;

    setIsScanning(true);
    
    try {
      // Hide background elements
      document.body.classList.add('barcode-scanner-active');
      
      // Start scanning
      const result = await BarcodeScanner.startScan();
      
      if (result.hasContent) {
        setIsProcessing(true);
        await processBarcode(result.content);
      }
    } catch (error) {
      console.error('Scanning error:', error);
      toast({
        title: "Scanning Error",
        description: "Failed to scan barcode. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
      setIsProcessing(false);
      document.body.classList.remove('barcode-scanner-active');
      BarcodeScanner.stopScan();
    }
  };

  const processBarcode = async (barcode: string) => {
    try {
      // Call our edge function to look up product information
      const { data, error } = await supabase.functions.invoke('lookup-product', {
        body: { barcode }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast({
          title: "Product Found",
          description: `Found: ${data.productInfo.title || 'Unknown item'}`,
        });
        
        onScanSuccess?.(data.productInfo);
      } else {
        toast({
          title: "Product Not Found",
          description: "Could not find product information for this barcode",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Product lookup error:', error);
      toast({
        title: "Lookup Error",
        description: "Failed to lookup product information",
        variant: "destructive"
      });
    }
  };

  const stopScan = () => {
    setIsScanning(false);
    document.body.classList.remove('barcode-scanner-active');
    BarcodeScanner.stopScan();
  };

  if (isScanning) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
        <div className="text-white text-lg mb-4">
          {isProcessing ? 'Processing barcode...' : 'Point camera at barcode'}
        </div>
        <div className="w-64 h-64 border-2 border-white rounded-lg mb-4"></div>
        <Button 
          onClick={stopScan}
          variant="secondary"
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Cancel'
          )}
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={startScan} className="w-full">
      <Camera className="w-4 h-4 mr-2" />
      Scan Barcode
    </Button>
  );
};