import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface EbayAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: () => void;
}

export function EbayAuthModal({ isOpen, onClose, onAuthSuccess }: EbayAuthModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [requiredScopes] = useState([
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/buy.browse'
  ]);

  const handleConnectEbay = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-auth', {
        body: { action: 'getAuthUrl' }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success && data?.authUrl) {
        setAuthUrl(data.authUrl);
        
        // Open eBay auth in a new window
        const authWindow = window.open(
          data.authUrl,
          'ebay-auth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        // Listen for the auth completion
        const handleMessage = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'EBAY_AUTH_SUCCESS') {
            authWindow?.close();
            window.removeEventListener('message', handleMessage);
            
            // Exchange the code for tokens
            const { data: tokenData, error: tokenError } = await supabase.functions.invoke('ebay-auth', {
              body: {
                action: 'exchangeCode',
                code: event.data.code,
                state: event.data.state,
                userId: user?.id
              }
            });

            if (tokenError) {
              throw new Error(tokenError.message);
            }

            if (tokenData?.success) {
              toast({
                title: "eBay Connected!",
                description: "Your eBay account has been successfully connected with the required scopes.",
              });
              onAuthSuccess?.();
              onClose();
            } else {
              throw new Error('Failed to exchange authorization code');
            }
          } else if (event.data.type === 'EBAY_AUTH_ERROR') {
            authWindow?.close();
            window.removeEventListener('message', handleMessage);
            throw new Error(event.data.error || 'eBay authentication failed');
          }
        };

        window.addEventListener('message', handleMessage);
        
        toast({
          title: "eBay Authorization",
          description: "Please complete the authorization in the new window.",
        });
      } else {
        throw new Error('Failed to generate eBay authorization URL');
      }
    } catch (error) {
      console.error('eBay connection error:', error);
      toast({
        title: "Connection Failed",
        description: `eBay connection error: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const testConnection = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ebay-auth', {
        body: { action: 'testConnection' }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: data?.success ? "Connection Test Passed" : "Connection Test Failed",
        description: data?.message || "Unknown status",
        variant: data?.success ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Test Failed",
        description: `Connection test error: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5" />
            Connect eBay Account
          </DialogTitle>
          <DialogDescription>
            Connect your eBay account to enable pricing analysis and listing features.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Required Scopes */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Required Permissions:</h4>
            <div className="space-y-1">
              {requiredScopes.map((scope, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <Badge variant="outline" className="text-xs">
                    {scope.split('/').pop() || scope}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Connection Status */}
          <div className="p-3 rounded-lg bg-muted/30 border border-warning/20">
            <div className="flex items-center gap-2 text-warning">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">eBay Integration Setup Required</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              You'll need to authorize the application with the required scopes to enable eBay pricing features.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <Button 
              onClick={handleConnectEbay}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Connect eBay Account
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={testConnection}
              className="w-full"
            >
              Test Current Connection
            </Button>
            
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}