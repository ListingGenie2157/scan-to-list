import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Camera, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PhotoOptimizer } from "./PhotoOptimizer";
import type { InventoryItem } from "@/types/inventory";

interface ItemEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  onSave: (updatedItem: InventoryItem) => void;
}

interface FormData {
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  series_title: string;
  issue_number: string;
  issue_date: string;
  suggested_price: string;
  condition_assessment: string;
  genre: string;
  description: string;
  suggested_category: string;
}

export function ItemEditModal({ open, onOpenChange, item, onSave }: ItemEditModalProps) {
  const [formData, setFormData] = useState<FormData>({
    title: '',
    author: '',
    publisher: '',
    isbn: '',
    series_title: '',
    issue_number: '',
    issue_date: '',
    suggested_price: '',
    condition_assessment: 'good',
    genre: '',
    description: '',
    suggested_category: 'book'
  });
  const [showPhotoOptimizer, setShowPhotoOptimizer] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (item) {
      setFormData({
        title: item.title || '',
        author: item.author || '',
        publisher: item.publisher || '',
        isbn: item.isbn || '',
        series_title: item.series_title || '',
        issue_number: item.issue_number || '',
        issue_date: item.issue_date || '',
        suggested_price: item.suggested_price ? String(item.suggested_price) : '',
        condition_assessment: item.condition_assessment || 'good',
        genre: item.genre || '',
        description: item.description || '',
        suggested_category: item.suggested_category || item.type || 'book'
      });
    }
  }, [item]);

  const isBook = formData.suggested_category === 'book';
  const isMagazine = formData.suggested_category === 'magazine';

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !item?.id) return;

    setUploading(true);
    try {
      const fileName = `${item.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const filePath = `${item.user_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      // Create photo record
      const { data: photoData, error: photoError } = await supabase
        .from('photos')
        .insert({
          user_id: item.user_id!,
          file_name: fileName,
          storage_path: filePath,
          public_url: publicUrl,
          url_public: publicUrl
        })
        .select()
        .single();

      if (photoError) throw photoError;

      // Update item with photo_id
      await supabase
        .from('inventory_items')
        .update({ photo_id: photoData.id })
        .eq('id', item.id);

      toast({
        title: "Photo uploaded successfully!",
        description: "The photo has been added to your item.",
      });

      // Refresh the item data
      onSave({ ...item, photo_id: photoData.id, photos: [photoData] });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading your photo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          title: formData.title,
          author: formData.author,
          publisher: formData.publisher,
          isbn: formData.isbn,
          series_title: formData.series_title,
          issue_number: formData.issue_number,
          issue_date: formData.issue_date || null,
          suggested_price: formData.suggested_price ? parseFloat(formData.suggested_price) : null,
          condition_assessment: formData.condition_assessment,
          genre: formData.genre,
          description: formData.description,
          suggested_category: formData.suggested_category,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) throw error;

      toast({
        title: "Item updated successfully!",
        description: "Your changes have been saved.",
      });

      onSave({ 
        ...item, 
        ...formData,
        suggested_price: formData.suggested_price ? parseFloat(formData.suggested_price) : null
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save failed",
        description: "There was an error saving your changes.",
        variant: "destructive",
      });
    }
  };

  const handleOptimizedPhoto = async (blob: Blob) => {
    if (!item?.id) return;

    setUploading(true);
    try {
      const fileName = `${item.id}-optimized-${Date.now()}.jpg`;
      const filePath = `${item.user_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      // Create photo record
      const { data: photoData, error: photoError } = await supabase
        .from('photos')
        .insert({
          user_id: item.user_id!,
          file_name: fileName,
          storage_path: filePath,
          public_url: publicUrl,
          url_public: publicUrl
        })
        .select()
        .single();

      if (photoError) throw photoError;

      // Update item with new photo_id
      await supabase
        .from('inventory_items')
        .update({ photo_id: photoData.id })
        .eq('id', item.id);

      onSave({ ...item, photo_id: photoData.id, photos: [photoData] });
    } catch (error) {
      console.error('Optimized photo upload error:', error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading the optimized photo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (!item) return null;

  const currentPhoto = item.photos?.[0];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Photo Section */}
            <div className="space-y-4">
              <div className="aspect-square border-2 border-dashed border-muted-foreground/25 rounded-lg overflow-hidden bg-muted/50">
                {currentPhoto ? (
                  <img
                    src={currentPhoto.public_url || currentPhoto.url_public}
                    alt={formData.title || "Item photo"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Camera className="w-8 h-8" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="photo-upload"
                  disabled={uploading}
                />
                <Label htmlFor="photo-upload">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={uploading}
                    asChild
                  >
                    <span className="flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      {uploading ? "Uploading..." : "Upload Photo"}
                    </span>
                  </Button>
                </Label>

                {currentPhoto && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setShowPhotoOptimizer(true)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Optimize Photo
                  </Button>
                )}
              </div>
            </div>

            {/* Form Section */}
            <div className="md:col-span-2 space-y-6">
              {/* Category Selection */}
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.suggested_category}
                  onValueChange={(value) => handleInputChange('suggested_category', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="magazine">Magazine</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Basic Information */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder={isBook ? "Book title" : "Magazine name"}
                  />
                </div>

                {isBook && (
                  <div className="space-y-2">
                    <Label htmlFor="author">Author</Label>
                    <Input
                      id="author"
                      value={formData.author}
                      onChange={(e) => handleInputChange('author', e.target.value)}
                      placeholder="Author name"
                    />
                  </div>
                )}

                {isMagazine && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="series_title">Series/Edition</Label>
                      <Input
                        id="series_title"
                        value={formData.series_title}
                        onChange={(e) => handleInputChange('series_title', e.target.value)}
                        placeholder="Special edition, series name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="issue_number">Issue Number</Label>
                      <Input
                        id="issue_number"
                        value={formData.issue_number}
                        onChange={(e) => handleInputChange('issue_number', e.target.value)}
                        placeholder="Issue #"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publisher">Publisher</Label>
                    <Input
                      id="publisher"
                      value={formData.publisher}
                      onChange={(e) => handleInputChange('publisher', e.target.value)}
                      placeholder="Publisher name"
                    />
                  </div>
                  {isMagazine && (
                    <div className="space-y-2">
                      <Label htmlFor="issue_date">Issue Date</Label>
                      <Input
                        id="issue_date"
                        type="date"
                        value={formData.issue_date}
                        onChange={(e) => handleInputChange('issue_date', e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {isBook && (
                  <div className="space-y-2">
                    <Label htmlFor="isbn">ISBN</Label>
                    <Input
                      id="isbn"
                      value={formData.isbn}
                      onChange={(e) => handleInputChange('isbn', e.target.value)}
                      placeholder="ISBN-13 or ISBN-10"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="condition">Condition</Label>
                    <Select
                      value={formData.condition_assessment}
                      onValueChange={(value) => handleInputChange('condition_assessment', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="like-new">Like New</SelectItem>
                        <SelectItem value="very-good">Very Good</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="acceptable">Acceptable</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Suggested Price</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.suggested_price}
                      onChange={(e) => handleInputChange('suggested_price', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="genre">Genre/Topic</Label>
                  <Input
                    id="genre"
                    value={formData.genre}
                    onChange={(e) => handleInputChange('genre', e.target.value)}
                    placeholder={isBook ? "Fiction, Non-fiction, etc." : "Technology, Lifestyle, etc."}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Additional details about the item..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {currentPhoto && (
        <PhotoOptimizer
          open={showPhotoOptimizer}
          onOpenChange={setShowPhotoOptimizer}
          imageUrl={currentPhoto.public_url || currentPhoto.url_public}
          onOptimizedImage={handleOptimizedPhoto}
        />
      )}
    </>
  );
}