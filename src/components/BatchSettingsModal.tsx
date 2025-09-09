import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, BookOpen, FileText } from "lucide-react";

interface BatchSettings {
  defaultCategory: string;
  defaultCondition: string;
  autoGenerateTitle: boolean;
  autoGeneratePrice: boolean;
  skipPricing: boolean;
  autoOptimize: boolean;
}

interface BatchSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: BatchSettings) => void;
  currentSettings: BatchSettings;
}

export function BatchSettingsModal({ isOpen, onClose, onSettingsChange, currentSettings }: BatchSettingsModalProps) {
  const [settings, setSettings] = useState<BatchSettings>(currentSettings);

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings, isOpen]);

  const handleSave = () => {
    onSettingsChange(settings);
    onClose();
  };

  const updateSetting = (key: keyof BatchSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Batch Upload Settings
          </DialogTitle>
          <DialogDescription>
            Set default values that will be applied to all uploaded items in this batch.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Default Item Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Default Category</Label>
                <Select 
                  value={settings.defaultCategory} 
                  onValueChange={(value) => updateSetting('defaultCategory', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose default category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="magazine">Magazine</SelectItem>
                    <SelectItem value="auto">Auto-detect (default)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default Condition</Label>
                <Select 
                  value={settings.defaultCondition} 
                  onValueChange={(value) => updateSetting('defaultCondition', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose default condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="like-new">Like New</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="auto">Auto-assess (default)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                AI Processing Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Auto-generate optimized titles</Label>
                  <p className="text-xs text-muted-foreground">Automatically create SEO-optimized titles</p>
                </div>
                <Button
                  variant={settings.autoGenerateTitle ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSetting('autoGenerateTitle', !settings.autoGenerateTitle)}
                >
                  {settings.autoGenerateTitle ? "ON" : "OFF"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Auto-generate pricing</Label>
                  <p className="text-xs text-muted-foreground">Automatically suggest market prices</p>
                </div>
                <Button
                  variant={settings.autoGeneratePrice ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSetting('autoGeneratePrice', !settings.autoGeneratePrice)}
                >
                  {settings.autoGeneratePrice ? "ON" : "OFF"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Skip pricing entirely</Label>
                  <p className="text-xs text-muted-foreground">Skip eBay pricing API calls (faster processing)</p>
                </div>
                <Button
                  variant={settings.skipPricing ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => updateSetting('skipPricing', !settings.skipPricing)}
                >
                  {settings.skipPricing ? "SKIP" : "OFF"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Auto-optimize after OCR</Label>
                  <p className="text-xs text-muted-foreground">Generate optimized titles & descriptions automatically</p>
                </div>
                <Button
                  variant={settings.autoOptimize ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSetting('autoOptimize', !settings.autoOptimize)}
                >
                  {settings.autoOptimize ? "ON" : "OFF"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}