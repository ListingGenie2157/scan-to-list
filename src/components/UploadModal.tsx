import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Camera, X, FileImage, CheckCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BatchSettingsModal } from "./BatchSettingsModal";
import WebBarcodeScanner from "@/components/WebBarcodeScanner";


interface BatchSettings {
  defaultCategory: string;
  defaultCondition: string;
  autoGenerateTitle: boolean;
  autoGeneratePrice: boolean;
}

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
  autoOpenScanner?: boolean;
}

export const UploadModal = ({ open, onOpenChange, onUploadSuccess, autoOpenScanner }: UploadModalProps) => {
  const [dragActive, setDragActive] = useState(false);
  const filesRef = useRef<File[]>([]);
  const [fileInfos, setFileInfos] = useState<{ name: string; size: number }[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBatchSettings, setShowBatchSettings] = useState(false);
  const [batchSettings, setBatchSettings] = useState<BatchSettings>({
    defaultCategory: "auto",
    defaultCondition: "auto", 
    autoGenerateTitle: true,
    autoGeneratePrice: true
  });
  const [barcode, setBarcode] = useState('');
  const [showScan, setShowScan] = useState(false);
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

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    
    if (files.length > 0) {
      filesRef.current.push(...files);
      setFileInfos(prev => [...prev, ...files.map(f => ({ name: f.name, size: f.size }))]);
      toast({
        title: "Files added",
        description: `${files.length} images added for processing`,
      });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      filesRef.current.push(...files);
      setFileInfos(prev => [...prev, ...files.map(f => ({ name: f.name, size: f.size }))]);
      toast({
        title: "Files selected",
        description: `${files.length} images selected for processing`,
      });
    }
  };

  const removeFile = (index: number) => {
    filesRef.current.splice(index, 1);
    setFileInfos(prev => prev.filter((_, i) => i !== index));
  };

  const startScan = useCallback(() => {
    setShowScan(true);
  }, []);

  const handleScannedCode = useCallback(async (code: string) => {
    setBarcode(code);
    setShowScan(false);

    try {
      const { data: meta, error } = await supabase.functions.invoke('lookup-product', {
        body: { barcode: code }
      });
      if (error) throw error;

      if (!meta || meta.type !== 'book') {
        toast({ title: 'Not a book or not found', description: 'No details found for this barcode', variant: 'destructive' });
        return;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const authUser = userRes?.user;
      if (!authUser) {
        toast({ title: 'Not signed in', description: 'Please sign in to save scans', variant: 'destructive' });
        return;
      }

      const isbn = meta.isbn13;
      let itemId: number | undefined;

      const { data: existing, error: exErr } = await supabase
        .from('items')
        .select('id, quantity')
        .eq('user_id', authUser.id)
        .eq('isbn13', isbn)
        .maybeSingle();
      if (exErr && exErr.code !== 'PGRST116') throw exErr; // ignore no rows

      if (existing) {
        const { error: updErr } = await supabase
          .from('items')
          .update({
            quantity: (existing.quantity ?? 1) + 1,
            title: meta.title,
            publisher: meta.publisher,
            authors: meta.authors ?? null,
            year: meta.year ?? null,
            description: meta.description ?? null,
            categories: meta.categories ?? null,
            cover_url_ext: meta.coverUrl ?? null,
            last_scanned_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (updErr) throw updErr;
        itemId = existing.id as unknown as number;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('items')
          .insert({
            user_id: authUser.id,
            type: 'book',
            isbn13: isbn,
            title: meta.title ?? null,
            publisher: meta.publisher ?? null,
            authors: meta.authors ?? null,
            year: meta.year ?? null,
            description: meta.description ?? null,
            categories: meta.categories ?? null,
            cover_url_ext: meta.coverUrl ?? null,
            quantity: 1,
            status: 'draft',
            source: 'scan',
            last_scanned_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (insErr) throw insErr;
        itemId = inserted!.id as number;
      }

      toast({ title: 'Scan saved', description: `${isbn} → ${meta.title || 'Untitled'}` });
      onUploadSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.warn('lookup-product error', err);
      toast({ title: 'Lookup Error', description: 'Failed to lookup or save product', variant: 'destructive' });
    }
  }, [onUploadSuccess, onOpenChange, toast]);

  useEffect(() => {
    if (open && autoOpenScanner) {
      startScan();
    }
  }, [open, autoOpenScanner, startScan]);

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

    if (filesRef.current.length === 0 || !user) {
      console.log('Cannot start processing: no files or no user', { files: filesRef.current.length, user: !!user });
      return;
    }
    
    console.log('Starting processing for', filesRef.current.length, 'files');
    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      const totalFiles = filesRef.current.length;
      
      for (let i = 0; i < totalFiles; i++) {
        const file = filesRef.current[i];
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
              console.log('OCR request payload:', { 
                photoId: photoData.id, 
                imageUrl: publicUrl,
                batchSettings: batchSettings
              });
              
              const { data: ocrData, error: ocrError } = await supabase.functions.invoke('process-book-cover', {
                body: { 
                  photoId: photoData.id, 
                  imageUrl: publicUrl,
                  batchSettings: batchSettings
                }
              });

            console.log('OCR response data:', ocrData);
            console.log('OCR response error:', ocrError);

            if (ocrError) {
              console.error('OCR processing error:', ocrError);
              toast({
                title: "OCR Processing Failed",
                description: `OCR failed: ${ocrError.message}. Check console for details.`,
                variant: "destructive"
              });
            } else if (ocrData?.success) {
              console.log('OCR processing successful:', ocrData);
              toast({
                title: "OCR Processing Complete",
                description: `Extracted: ${ocrData.extractedInfo?.title || 'Title not found'}`,
              });
            } else {
              console.warn('OCR processing returned no success flag:', ocrData);
              toast({
                title: "OCR Processing Warning", 
                description: "OCR completed but may not have extracted all details.",
                variant: "destructive"
              });
            }
          } catch (ocrError) {
            console.error('OCR processing exception:', ocrError);
            toast({
              title: "OCR Exception",
              description: `OCR failed with exception: ${ocrError.message}`,
              variant: "destructive"
            });
          }
        }
      }

      setProcessingProgress(100);
      setIsProcessing(false);
      
      toast({
        title: "Processing complete!",
        description: `${fileInfos.length} items added to inventory`,
      });
      
      filesRef.current = [];
      setFileInfos([]);
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              <div>
                <DialogTitle>Upload Book & Magazine Photos</DialogTitle>
                <DialogDescription>
                  Upload multiple photos for AI processing. Supported formats: JPG, PNG, HEIC
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBatchSettings(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
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
              onClick={startScan}
              variant="outline"
              className="w-full"
              disabled={isProcessing}
            >
              <Camera className="w-4 h-4 mr-2" />
              Scan Barcode
            </Button>
            
            {/* Show error if any */}
            
            {/* Show scanned barcode if any */}
            {barcode && (
              <div className="mt-2 p-2 bg-muted rounded text-sm">
                <strong>Scanned:</strong> {barcode}
              </div>
            )}
          </div>

            {showScan && (
              <WebBarcodeScanner
                onCode={handleScannedCode}
                onClose={() => setShowScan(false)}
              />
            )}


          {/* Uploaded Files */}
          {fileInfos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Selected Files ({fileInfos.length})</h3>
                <Badge variant="outline">{fileInfos.length} images</Badge>
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-2">
                {fileInfos.map((file, index) => (
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
        <div className="sticky bottom-0 border-t pt-4 mt-4 bg-background z-50">
          <div className="flex gap-3">
            <Button
              onClick={startProcessing}
              disabled={fileInfos.length === 0 || isProcessing}
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
                  Process {fileInfos.length} Images
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
      
      <BatchSettingsModal
        isOpen={showBatchSettings}
        onClose={() => setShowBatchSettings(false)}
        onSettingsChange={setBatchSettings}
        currentSettings={batchSettings}
      />
    </Dialog>
  );
};