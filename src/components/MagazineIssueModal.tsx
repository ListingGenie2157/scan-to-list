import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { LookupMeta } from '@/lib/scanning';

interface MagazineIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: NonNullable<LookupMeta>;
  onConfirm: (enhancedMeta: NonNullable<LookupMeta>) => void;
}

export function MagazineIssueModal({ open, onOpenChange, meta, onConfirm }: MagazineIssueModalProps) {
  const [seriesTitle, setSeriesTitle] = useState(meta.title || '');
  const [issueNumber, setIssueNumber] = useState('');
  const [coverMonth, setCoverMonth] = useState('');
  const [coverYear, setCoverYear] = useState(new Date().getFullYear().toString());
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleConfirm = async () => {
    if (!seriesTitle.trim()) {
      toast({ title: 'Missing Information', description: 'Series title is required', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      // Enhance the metadata with user-provided details
      const enhancedTitle = issueNumber && coverMonth && coverYear 
        ? `${seriesTitle} - ${coverMonth} ${coverYear} (Issue ${issueNumber})`
        : `${seriesTitle}${issueNumber ? ` - Issue ${issueNumber}` : ''}`;

      const enhancedMeta: NonNullable<LookupMeta> = {
        ...meta,
        title: enhancedTitle,
        year: coverYear,
        type: 'magazine',
      };

      onConfirm(enhancedMeta);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving magazine information:', error);
      toast({ title: 'Error', description: 'Failed to save magazine information', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Magazine Issue Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Barcode: {meta.barcode}
            {meta.barcode_addon && ` (Add-on: ${meta.barcode_addon})`}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="series-title">Series Title *</Label>
            <Input
              id="series-title"
              value={seriesTitle}
              onChange={(e) => setSeriesTitle(e.target.value)}
              placeholder="e.g., National Geographic"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-number">Issue Number</Label>
            <Input
              id="issue-number"
              value={issueNumber}
              onChange={(e) => setIssueNumber(e.target.value)}
              placeholder="e.g., 123 or Vol 45 No 3"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="cover-month">Cover Month</Label>
              <Select value={coverMonth} onValueChange={setCoverMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cover-year">Cover Year</Label>
              <Input
                id="cover-year"
                value={coverYear}
                onChange={(e) => setCoverYear(e.target.value)}
                placeholder="2024"
                type="number"
                min="1800"
                max={new Date().getFullYear() + 1}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}