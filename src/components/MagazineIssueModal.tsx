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
  const [publicationName, setPublicationName] = useState(meta.title || '');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueNumber, setIssueNumber] = useState((meta as any).inferred_issue || '');
  const [coverMonth, setCoverMonth] = useState((meta as any).inferred_month || '');
  const [coverYear, setCoverYear] = useState((meta as any).inferred_year || new Date().getFullYear().toString());
  const [specialIssue, setSpecialIssue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleConfirm = async () => {
    if (!publicationName.trim()) {
      toast({ title: 'Missing Information', description: 'Publication name is required', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      // Enhance the metadata with user-provided details
      const issueBits = [
        issueNumber ? `Issue ${issueNumber}` : null,
        specialIssue ? specialIssue : null,
      ].filter(Boolean).join(' • ');
      const dateBit = coverMonth && coverYear ? `${coverMonth} ${coverYear}` : (coverYear ? coverYear : '');
      const enhancedTitle = [publicationName, issueTitle, issueNumber ? `Issue ${issueNumber}` : null, dateBit].filter(Boolean).join(' - ');

      const enhancedMeta: NonNullable<LookupMeta> = {
        ...meta,
        title: publicationName,
        issue_title: issueTitle || null,
        year: coverYear,
        type: 'magazine',
        // Keep the addon and barcode; preserve suggested price if provided from backend
        suggested_price: (meta as any).suggested_price ?? null,
        // Explicit magazine fields for persistence
        issue_number: issueNumber || (meta as any).inferred_issue || null,
        issue_date: dateBit || null,
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
            Barcode: {(meta as any).barcode}
            {(meta as any).barcode_addon && ` (Add-on: ${(meta as any).barcode_addon})`}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="publication-name">Publication Name *</Label>
            <Input
              id="publication-name"
              value={publicationName}
              onChange={(e) => setPublicationName(e.target.value)}
              placeholder="e.g., Time Magazine, National Geographic"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-title">Issue Title (optional)</Label>
            <Input
              id="issue-title"
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              placeholder="e.g., The World of AI"
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

          <div className="space-y-2">
            <Label htmlFor="special-issue">Special Issue (optional)</Label>
            <Input
              id="special-issue"
              value={specialIssue}
              onChange={(e) => setSpecialIssue(e.target.value)}
              placeholder="e.g., Holiday Edition, Collector's Issue"
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