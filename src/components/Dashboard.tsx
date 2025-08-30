import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Camera, Package, TrendingUp, Clock, CheckCircle, AlertCircle, LogOut, User, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UploadModal } from "./UploadModal";
import { InventoryGrid, type InventoryGridRef } from "./InventoryGrid";
import { BundleSuggestionsModal } from "./BundleSuggestionsModal";
import { EbayAuthModal } from "./EbayAuthModal";
import { ConnectEbayButton } from "./ConnectEbayButton";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export const Dashboard = () => {
  const { user, signOut, loading } = useAuth();
  const { toast } = useToast();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [autoOpenScanner, setAutoOpenScanner] = useState(false);
  const [showBundleSuggestions, setShowBundleSuggestions] = useState(false);
  const [showEbayAuth, setShowEbayAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "inventory">("overview");
  const [ebayStatus, setEbayStatus] = useState<{
    connected: boolean;
    testing: boolean;
    lastTest: Date | null;
    error: string | null;
  }>({
    connected: false,
    testing: false,
    lastTest: null,
    error: null
  });
  const inventoryGridRef = useRef<{ refreshInventory: () => void }>(null);

  // Check for eBay connection success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ebay') === 'connected') {
      toast({
        title: "eBay Connected Successfully!",
        description: "Your eBay account is now connected and ready for listing.",
      });
      // Clean up the URL parameter
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleUploadSuccess = () => {
    // Switch to inventory tab and refresh the data
    setActiveTab("inventory");
    // Small delay to ensure tab switch happens first
    setTimeout(() => {
      inventoryGridRef.current?.refreshInventory();
    }, 100);
  };

  const testEbayConnection = useCallback(async () => {
    if (!user) return; // Don't test if no user
    
    setEbayStatus(prev => ({ ...prev, testing: true, error: null }));
    
    try {
      // Test the eBay pricing function with improved error reporting
      // Include auth header even though verify_jwt is false, just in case
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      
      const { data, error } = await supabase.functions.invoke('ebay-pricing', {
        body: { query: 'test book' },
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : {}
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        // Now we get specific error messages from the function
        throw new Error(data.error);
      }

      if (data && (data.suggestedPrice !== undefined || data.analytics)) {
        setEbayStatus({
          connected: true,
          testing: false,
          lastTest: new Date(),
          error: null
        });
        
        toast({
          title: "eBay Connection Working!",
          description: "eBay API credentials are configured and working.",
        });
      } else {
        throw new Error('Unexpected response from eBay function');
      }
    } catch (error) {
      setEbayStatus({
        connected: false,
        testing: false,
        lastTest: new Date(),
        error: error.message
      });
      
      toast({
        title: "eBay Connection Failed",
        description: `Error: ${error.message}`,
        variant: "destructive",
      });
    }
  }, [user, supabase, toast]);

  // Remove automatic eBay connection test to prevent React error #310
  // Users can manually test by clicking the "Test Connection" button

  // Mock data for demonstration
  const stats = {
    totalItems: 1247,
    pendingListings: 23,
    thisWeekUploads: 156,
    monthlyRevenue: 2849
  };

  const recentActivity = [
    { id: 1, title: "Harry Potter Collection", status: "processed", time: "2 hours ago", items: 7 },
    { id: 2, title: "Vintage National Geographic", status: "processing", time: "4 hours ago", items: 12 },
    { id: 3, title: "Stephen King Novels", status: "listed", time: "1 day ago", items: 5 },
    { id: 4, title: "Science Textbooks", status: "pending", time: "2 days ago", items: 8 }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "processing": return <Clock className="w-4 h-4 text-warning" />;
      case "listed": return <Package className="w-4 h-4 text-primary" />;
      default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processed: "bg-success/10 text-success border-success/20",
      processing: "bg-warning/10 text-warning border-warning/20", 
      listed: "bg-primary/10 text-primary border-primary/20",
      pending: "bg-muted text-muted-foreground"
    };
    
    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants]}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-shrink-0">
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                BookLister Pro
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">AI-Powered Reseller Tool</p>
            </div>
            
            {/* Mobile-first layout */}
            <div className="flex items-center gap-2">
              {/* Upload button - always visible */}
              <Button 
                variant="upload" 
                size="sm"
                onClick={() => {
                  console.log('Upload button clicked!');
                  setShowUploadModal(true);
                }}
                className="shadow-elevated"
              >
                <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline ml-2">Upload Photos</span>
              </Button>
              
              {/* User menu - simplified for mobile */}
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <User className="w-4 h-4" />
                <span className="max-w-32 truncate">{user?.email}</span>
              </div>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={signOut}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline ml-2">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "overview" ? "default" : "ghost"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </Button>
          <Button
            variant={activeTab === "inventory" ? "default" : "ghost"}
            onClick={() => setActiveTab("inventory")}
          >
            Inventory
          </Button>
        </div>

        {activeTab === "overview" ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="text-2xl font-bold">{stats.totalItems.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pending Listings</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning" />
                    <span className="text-2xl font-bold">{stats.pendingListings}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-success" />
                    <span className="text-2xl font-bold">{stats.thisWeekUploads}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-success" />
                    <span className="text-2xl font-bold">${stats.monthlyRevenue.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* eBay Connection Status */}
            <Card className="mb-6 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  eBay Integration Status
                </CardTitle>
                <CardDescription>Manage your eBay connection and view API status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {ebayStatus.connected ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-warning" />
                      )}
                      <span className="font-medium">API Connection</span>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={ebayStatus.connected 
                        ? "bg-success/10 text-success border-success/20" 
                        : "bg-warning/10 text-warning border-warning/20"
                      }
                    >
                      {ebayStatus.testing ? "Testing..." : ebayStatus.connected ? "Connected" : "Disconnected"}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {ebayStatus.error 
                        ? `Error: ${ebayStatus.error.slice(0, 50)}...`
                        : ebayStatus.connected 
                          ? "eBay pricing API is working"
                          : "eBay API credentials needed"
                      }
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Last Test</span>
                    </div>
                    <span className="text-lg font-bold text-muted-foreground">
                      {ebayStatus.lastTest ? ebayStatus.lastTest.toLocaleTimeString() : "--:--"}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {ebayStatus.lastTest ? ebayStatus.lastTest.toLocaleDateString() : "Never tested"}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Listing API</span>
                    </div>
                    <Badge variant="outline" className="bg-muted/20 text-muted-foreground border-muted/20">
                      Not Implemented
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Requires eBay Inventory API setup
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant={ebayStatus.connected ? "outline" : "default"}
                      size="sm"
                      onClick={() => setShowEbayAuth(true)}
                      className="flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      {ebayStatus.connected ? "Manage eBay Auth" : "Setup eBay OAuth"}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={testEbayConnection}
                      disabled={ebayStatus.testing}
                      className="flex items-center gap-2"
                    >
                      {ebayStatus.testing ? (
                        <Clock className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      {ebayStatus.testing ? "Testing..." : "Test Connection"}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => window.open('https://www.ebay.com/sh/ovw', '_blank')}
                      className="flex items-center gap-2"
                    >
                      <Package className="w-4 h-4" />
                      eBay Seller Hub
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="mb-6 shadow-card">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Get started with your daily workflow</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Button 
                    variant="upload" 
                    size="lg" 
                    onClick={() => {
                      setAutoOpenScanner(true);
                      setShowUploadModal(true);
                    }}
                    className="h-20 flex-col"
                  >
                    <Camera className="w-6 h-6 mb-2" />
                    Scan Barcode
                  </Button>
                  <Button 
                    variant="gradient" 
                    size="lg" 
                    onClick={() => {
                      console.log('Quick action upload button clicked!');
                      setShowUploadModal(true);
                    }}
                    className="h-20 flex-col"
                  >
                    <Upload className="w-6 h-6 mb-2" />
                    Upload New Photos
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="h-20 flex-col"
                    onClick={() => {
                      console.log('Create listings button clicked!');
                      setActiveTab("inventory");
                    }}
                  >
                    <Package className="w-6 h-6 mb-2" />
                    Create Listings
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="h-20 flex-col"
                    onClick={() => setShowEbayAuth(true)}
                  >
                    <Package className="w-6 h-6 mb-2" />
                    Connect eBay
                  </Button>
                  {/* eBay Connect */}
                  <ConnectEbayButton />
                </div>
              </CardContent>
            </Card>

            {/* AI Bundle Suggestions Card */}
            <Card className="mb-6 shadow-card border-2 border-purple-200 dark:border-purple-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  AI Bundle Suggestions
                </CardTitle>
                <CardDescription>Let AI analyze your inventory and suggest profitable bundle opportunities</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => setShowBundleSuggestions(true)}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  size="lg"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Get Bundle Suggestions
                </Button>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Track your latest uploads and processing status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(activity.status)}
                        <div>
                          <p className="font-medium">{activity.title}</p>
                          <p className="text-sm text-muted-foreground">{activity.items} items • {activity.time}</p>
                        </div>
                      </div>
                      {getStatusBadge(activity.status)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <InventoryGrid ref={inventoryGridRef} />
        )}
      </div>


      <UploadModal 
        open={showUploadModal} 
        onOpenChange={(o) => { setShowUploadModal(o); if (!o) setAutoOpenScanner(false); }}
        onUploadSuccess={handleUploadSuccess}
        autoOpenScanner={autoOpenScanner}
      />
      
      <BundleSuggestionsModal 
        isOpen={showBundleSuggestions}
        onClose={() => setShowBundleSuggestions(false)}
      />
      
      <EbayAuthModal 
        isOpen={showEbayAuth}
        onClose={() => setShowEbayAuth(false)}
        onAuthSuccess={() => {
          setShowEbayAuth(false);
          // Show success message
        }}
      />
    </div>
  );
};