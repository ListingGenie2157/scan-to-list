import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Camera } from 'lucide-react';
import WebBarcodeScanner from '@/components/WebBarcodeScanner';



interface BarcodeScannerProps {
  onScanSuccess?: (data: any) => void;
}

export const BarcodeScannerComponent = ({ onScanSuccess }: BarcodeScannerProps) => {
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWebScanner, setShowWebScanner] = useState(false);
  const { toast } = useToast();


  const handleWebCode = async (code: string) => {
    setIsProcessing(true);
    try {
      await processBarcode(code);
    } finally {
      setIsProcessing(false);
      setShowWebScanner(false);
    }
  };

  const startScan = async () => {
    setShowWebScanner(true);
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



  return (
    <>
      <Button onClick={startScan} className="w-full" disabled={isProcessing}>
        <Camera className="w-4 h-4 mr-2" />
        Scan Barcode
      </Button>
      {showWebScanner && (
        <WebBarcodeScanner
          onCode={handleWebCode}
          onClose={() => setShowWebScanner(false)}
        />
      )}
    </>
  );
};