import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Check, X, ExternalLink } from 'lucide-react';

interface ListingDraft {
  id: string;
  item_id: string;
  listing_data: any;
  status: string;
  created_at: string;
  approved_at?: string;
  listed_at?: string;
  ebay_listing_id?: string;
}

export const ListingApprovalsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<ListingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingDrafts, setProcessingDrafts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadDrafts();
    }
  }, [user]);

  const loadDrafts = async () => {
    try {
      const { data, error } = await supabase
        .from('listing_drafts')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setDrafts(data || []);
    } catch (error) {
      console.error('Error loading listing drafts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load listing drafts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDraftAction = async (draftId: string, action: 'approve' | 'reject') => {
    setProcessingDrafts(prev => new Set(prev).add(draftId));
    
    try {
      const { data, error } = await supabase.functions.invoke('approve-listing-draft', {
        body: { draftId, action }
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: action === 'approve' 
          ? 'Listing approved successfully' 
          : 'Listing rejected successfully'
      });

      // Reload drafts to show updated status
      await loadDrafts();
    } catch (error) {
      console.error(`Error ${action}ing draft:`, error);
      toast({
        title: 'Error',
        description: `Failed to ${action} listing`,
        variant: 'destructive'
      });
    } finally {
      setProcessingDrafts(prev => {
        const newSet = new Set(prev);
        newSet.delete(draftId);
        return newSet;
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'default',
      approved: 'secondary',
      rejected: 'destructive',
      listed: 'outline',
      failed: 'destructive'
    };

    return (
      <Badge variant={variants[status] || 'default'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const pendingDrafts = drafts.filter(draft => draft.status === 'pending');
  const recentDrafts = drafts.filter(draft => draft.status !== 'pending').slice(0, 10);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Listing Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve your daily listing drafts
        </p>
      </div>

      {pendingDrafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals ({pendingDrafts.length})</CardTitle>
            <CardDescription>
              Review these auto-generated listings and approve or reject them
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingDrafts.map((draft) => (
                <div key={draft.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{draft.listing_data.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {draft.listing_data.author} • {draft.listing_data.publisher} • {draft.listing_data.year}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ISBN: {draft.listing_data.isbn}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-lg">${draft.listing_data.price}</p>
                      <p className="text-sm text-muted-foreground">{draft.listing_data.condition}</p>
                    </div>
                  </div>
                  
                  <div className="text-sm">
                    <p className="font-medium">Description:</p>
                    <p className="text-muted-foreground">{draft.listing_data.description}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleDraftAction(draft.id, 'approve')}
                      disabled={processingDrafts.has(draft.id)}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDraftAction(draft.id, 'reject')}
                      disabled={processingDrafts.has(draft.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recentDrafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your recently processed listing drafts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentDrafts.map((draft) => (
                <div key={draft.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="flex-1">
                    <p className="font-medium">{draft.listing_data.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Created: {formatDate(draft.created_at)}
                      {draft.approved_at && ` • Processed: ${formatDate(draft.approved_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(draft.status)}
                    {draft.ebay_listing_id && (
                      <Button size="sm" variant="ghost" asChild>
                        <a 
                          href={`https://www.ebay.com/itm/${draft.ebay_listing_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingDrafts.length === 0 && recentDrafts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No listing drafts found. Make sure auto-listing is enabled in your settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};