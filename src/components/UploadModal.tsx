import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Camera, X, FileImage, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BarcodeScanner } from "@capacitor-community/barcode-scanner";
import { Capacitor } from "@capacitor/core";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

export const UploadModal = ({ open, onOpenChange, onUploadSuccess }: UploadModalProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files]);
      toast({
        title: "Files added",
        description: `${files.length} images added for processing`,
      });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setUploadedFiles(prev => [...prev, ...files]);
      toast({
        title: "Files selected",
        description: `${files.length} images selected for processing`,
      });
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleBarcodeScan = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: "Not Available",
        description: "Barcode scanning is only available on mobile devices",
        variant: "destructive"
      });
      return;
    }

    try {
      // Check permissions
      const status = await BarcodeScanner.checkPermission({ force: true });
      
      if (!status.granted) {
        toast({
          title: "Permission Denied",
          description: "Camera permission is required for barcode scanning",
          variant: "destructive"
        });
        return;
      }

      setIsProcessing(true);
      
      // Hide background elements
      document.body.classList.add('barcode-scanner-active');
      
      // Start scanning
      const result = await BarcodeScanner.startScan();
      
      if (result.hasContent) {
        toast({
          title: "Barcode Scanned",
          description: "Looking up product information...",
        });

        // Call our edge function to look up product information
        const { data, error } = await supabase.functions.invoke('lookup-product', {
          body: { barcode: result.content }
        });

        if (error) {
          throw error;
        }

        if (data.success) {
          toast({
            title: "Product Added",
            description: `Added: ${data.productInfo.title || 'Product'}`,
          });
          
          onUploadSuccess?.();
          onOpenChange(false);
        } else {
          toast({
            title: "Product Not Found",
            description: "Could not find product information for this barcode",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Barcode scanning error:', error);
      toast({
        title: "Scanning Error",
        description: "Failed to scan barcode. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
      document.body.classList.remove('barcode-scanner-active');
      BarcodeScanner.stopScan();
    }
  };

  const startProcessing = async () => {
    // Debug: Check authentication state
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('Authentication debug:', { 
      session: session, 
      user: session?.user, 
      userId: session?.user?.id,
      authHookUser: user,
      authHookUserId: user?.id,
      error: sessionError 
    });

    if (uploadedFiles.length === 0 || !user) {
      console.log('Cannot start processing: no files or no user', { files: uploadedFiles.length, user: !!user });
      return;
    }
    
    console.log('Starting processing for', uploadedFiles.length, 'files');
    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      const totalFiles = uploadedFiles.length;
      
      for (let i = 0; i < totalFiles; i++) {
        const file = uploadedFiles[i];
        console.log(`Processing file ${i + 1}/${totalFiles}:`, file.name);
        
        // Update progress
        setProcessingProgress(Math.round((i / totalFiles) * 90));
        
        // Upload to storage
        const fileName = `${user.id}/${Date.now()}-${file.name}`;
        console.log('Uploading to storage:', fileName);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}: ${uploadError.message}`,
            variant: "destructive"
          });
          continue;
        }

        console.log('Upload successful:', uploadData);

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('photos')
          .getPublicUrl(fileName);

        console.log('Public URL generated:', publicUrl);

        // Create photo record
        console.log('Creating photo record...');
        const { data: photoData, error: photoError } = await supabase
          .from('photos')
          .insert({
            user_id: user.id,
            file_name: file.name,
            storage_path: uploadData.path,
            public_url: publicUrl,
            file_size: file.size
          })
          .select()
          .single();

        if (photoError) {
          console.error('Photo record error:', photoError);
          toast({
            title: "Database error",
            description: `Failed to save photo record: ${photoError.message}`,
            variant: "destructive"
          });
          continue;
        }

        console.log('Photo record created:', photoData);

        // Create inventory item
        console.log('Creating inventory item...');
        const { error: inventoryError } = await supabase
          .from('inventory_items')
          .insert({
            user_id: user.id,
            photo_id: photoData.id,
            status: 'photographed'
          });

        if (inventoryError) {
          console.error('Inventory error:', inventoryError);
          toast({
            title: "Inventory error",
            description: `Failed to create inventory item: ${inventoryError.message}`,
            variant: "destructive"
          });
        } else {
          console.log('Inventory item created successfully');
          
          // Process the book cover with OCR
          try {
            console.log('Starting OCR processing for:', photoData.id);
            const { data: ocrData, error: ocrError } = await supabase.functions.invoke('process-book-cover', {
              body: { 
                photoId: photoData.id, 
                imageUrl: publicUrl 
              }
            });

            if (ocrError) {
              console.error('OCR processing error:', ocrError);
              toast({
                title: "OCR Warning",
                description: `Image uploaded but OCR failed: ${ocrError.message}`,
                variant: "destructive"
              });
            } else {
              console.log('OCR processing successful:', ocrData);
            }
          } catch (ocrError) {
            console.error('OCR processing exception:', ocrError);
          }
        }
      }

      setProcessingProgress(100);
      setIsProcessing(false);
      
      toast({
        title: "Processing complete!",
        description: `${uploadedFiles.length} items added to inventory`,
      });
      
      setUploadedFiles([]);
      onOpenChange(false);
      
      // Call the success callback to refresh inventory and switch tabs
      onUploadSuccess?.();
      
    } catch (error) {
      console.error('Processing error:', error);
      setIsProcessing(false);
      toast({
        title: "Error",
        description: "Failed to process images. Please try again.",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Book & Magazine Photos
          </DialogTitle>
          <DialogDescription>
            Upload multiple photos for AI processing. Supported formats: JPG, PNG, HEIC
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Upload Area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
              </div>
              
              <div>
                <p className="text-lg font-medium">Drop photos here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You can upload up to 100 photos at once
                </p>
              </div>
              
              <Button variant="outline" type="button">
                Choose Files
              </Button>
            </div>
          </div>

          {/* Barcode Scanner */}
          <div className="text-center pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-3">Or scan a barcode</p>
            <Button
              onClick={handleBarcodeScan}
              variant="outline"
              className="w-full"
              disabled={isProcessing}
            >
              <Camera className="w-4 h-4 mr-2" />
              {Capacitor.isNativePlatform() ? 'Scan Barcode (Books & Magazines)' : 'Scan Barcode (Mobile Only)'}
            </Button>
          </div>

          {/* Uploaded Files */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Selected Files ({uploadedFiles.length})</h3>
                <Badge variant="outline">{uploadedFiles.length} images</Badge>
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <FileImage className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={isProcessing}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processing Progress */}
          {isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Processing images...</span>
                <span className="text-sm text-muted-foreground">{processingProgress}%</span>
              </div>
              <Progress value={processingProgress} className="w-full" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                Extracting text and analyzing content
              </div>
            </div>
          )}

        </div>

        {/* Action Buttons - Always visible at bottom */}
        <div className="border-t pt-4 mt-4 bg-background">
          <div className="flex gap-3 pt-4">
            <Button
              onClick={startProcessing}
              disabled={uploadedFiles.length === 0 || isProcessing}
              className="flex-1"
              variant="gradient"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Process {uploadedFiles.length} Images
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};