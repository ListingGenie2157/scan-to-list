import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Heavy ML libraries are loaded on-demand when needed

const MAX_IMAGE_DIMENSION = 1024;

interface PhotoOptimizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onOptimizedImage: (blob: Blob) => void;
}

export function PhotoOptimizer({ open, onOpenChange, imageUrl, onOptimizedImage }: PhotoOptimizerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [optimizedImageUrl, setOptimizedImageUrl] = useState<string | null>(null);
  const [useAiRemoval, setUseAiRemoval] = useState(false);
  const { toast } = useToast();
  const supportsWebGPU = typeof navigator !== 'undefined' && (navigator as any).gpu;

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  const brightenImage = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, factor: number = 1.2) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * factor);     // Red
      data[i + 1] = Math.min(255, data[i + 1] * factor); // Green
      data[i + 2] = Math.min(255, data[i + 2] * factor); // Blue
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const cropToContent = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    
    // Find content bounds (non-white pixels)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        
        // If pixel is not close to white
        if (r < 240 || g < 240 || b < 240) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    // Add padding
    const padding = 20;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvas.width, maxX + padding);
    maxY = Math.min(canvas.height, maxY + padding);
    
    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;
    
    if (cropWidth > 0 && cropHeight > 0) {
      const croppedData = ctx.getImageData(minX, minY, cropWidth, cropHeight);
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      ctx.putImageData(croppedData, 0, 0);
    }
  };

  const removeBackground = async (imageElement: HTMLImageElement, preferWebGPU: boolean): Promise<HTMLCanvasElement> => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const device = preferWebGPU ? 'webgpu' : 'wasm';
    const segmenter = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', { device });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Resize if needed
    let width = imageElement.naturalWidth;
    let height = imageElement.naturalHeight;
    
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      if (width > height) {
        height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
        width = MAX_IMAGE_DIMENSION;
      } else {
        width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
        height = MAX_IMAGE_DIMENSION;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(imageElement, 0, 0, width, height);
    
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const result = await segmenter(imageData);
    
    if (!result || !Array.isArray(result) || result.length === 0 || !result[0].mask) {
      throw new Error('Background removal failed');
    }
    
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputCtx = outputCanvas.getContext('2d')!;
    
    outputCtx.drawImage(canvas, 0, 0);
    
    const outputImageData = outputCtx.getImageData(0, 0, width, height);
    const data = outputImageData.data;
    
    // Apply inverted mask to alpha channel
    for (let i = 0; i < result[0].mask.data.length; i++) {
      const alpha = Math.round((1 - result[0].mask.data[i]) * 255);
      data[i * 4 + 3] = alpha;
    }
    
    outputCtx.putImageData(outputImageData, 0, 0);
    return outputCanvas;
  };

  const optimizePhoto = async () => {
    setIsProcessing(true);
    try {
      const img = await loadImage(imageUrl);
      
      // Create canvas for processing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      
      // Step 1: Brighten the image
      brightenImage(canvas, ctx, 1.3);
      
      // Step 2: Crop to content
      cropToContent(canvas, ctx);
      
      // Step 3: Optional AI background removal (lazy-loaded)
      if (useAiRemoval) {
        try {
          const bgRemovedCanvas = await removeBackground(img, !!supportsWebGPU);
          canvas.width = bgRemovedCanvas.width;
          canvas.height = bgRemovedCanvas.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bgRemovedCanvas, 0, 0);
        } catch (bgError) {
          console.log('Background removal failed, using brightened/cropped version:', bgError);
        }
      }
      
      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setOptimizedImageUrl(url);
          
          toast({
            title: "Photo optimized successfully!",
            description: "Your photo has been brightened, cropped, and optimized.",
          });
        }
      }, 'image/jpeg', 0.9);
      
    } catch (error) {
      console.error('Photo optimization failed:', error);
      toast({
        title: "Optimization failed",
        description: "There was an error optimizing your photo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUseOptimized = async () => {
    if (!optimizedImageUrl) return;
    
    try {
      const response = await fetch(optimizedImageUrl);
      const blob = await response.blob();
      onOptimizedImage(blob);
      onOpenChange(false);
      
      toast({
        title: "Optimized photo applied!",
        description: "The optimized photo has been applied to your item.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply optimized photo.",
        variant: "destructive",
      });
    }
  };

  const resetOptimization = () => {
    if (optimizedImageUrl) {
      URL.revokeObjectURL(optimizedImageUrl);
    }
    setOptimizedImageUrl(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Photo Optimizer
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original Photo */}
          <div className="space-y-3">
            <h3 className="font-medium">Original Photo</h3>
            <div className="border rounded-lg overflow-hidden bg-muted">
              <img 
                src={imageUrl} 
                alt="Original" 
                className="w-full h-64 object-contain"
              />
            </div>
          </div>
          
          {/* Optimized Photo */}
          <div className="space-y-3">
            <h3 className="font-medium">Optimized Photo</h3>
            <div className="border rounded-lg overflow-hidden bg-muted">
              {optimizedImageUrl ? (
                <img 
                  src={optimizedImageUrl} 
                  alt="Optimized" 
                  className="w-full h-64 object-contain"
                />
              ) : (
                <div className="w-full h-64 flex items-center justify-center text-muted-foreground">
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span>Optimizing photo...</span>
                    </div>
                  ) : (
                    <span>Click "Optimize Photo" to enhance your image</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 pt-4">
          <div className="flex items-center gap-2">
            <Switch id="ai-removal" checked={useAiRemoval} onCheckedChange={setUseAiRemoval} />
            <Label htmlFor="ai-removal">AI Background Removal (beta){!supportsWebGPU ? ' • slower on this device' : ''}</Label>
          </div>
          <Button 
            onClick={optimizePhoto} 
            disabled={isProcessing}
            className="flex items-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isProcessing ? "Optimizing..." : "Optimize Photo"}
          </Button>
          
          {optimizedImageUrl && (
            <>
              <Button 
                onClick={handleUseOptimized}
                variant="default"
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Use Optimized
              </Button>
              
              <Button 
                onClick={resetOptimization}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </Button>
            </>
          )}
        </div>
        
        <div className="text-sm text-muted-foreground">
          <p>This tool will:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Brighten your photo for better visibility</li>
            <li>Automatically crop to remove excess white space</li>
            <li>Attempt to remove background (if needed)</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}