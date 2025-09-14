import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface AutoListingSettings {
  id?: string;
  enabled: boolean;
  daily_limit: number;
  schedule_time: string;
  timezone: string;
}

export const AutoListingSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoListingSettings>({
    enabled: false,
    daily_limit: 10,
    schedule_time: '09:00',
    timezone: 'UTC'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('auto_listing_settings')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      if (data) {
        setSettings({
          id: data.id,
          enabled: data.enabled,
          daily_limit: data.daily_limit,
          schedule_time: data.schedule_time,
          timezone: data.timezone
        });
      }
    } catch (error) {
      console.error('Error loading auto-listing settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load auto-listing settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user, loadSettings]);

  const saveSettings = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        enabled: settings.enabled,
        daily_limit: settings.daily_limit,
        schedule_time: settings.schedule_time,
        timezone: settings.timezone
      };

      if (settings.id) {
        // Update existing
        const { error } = await supabase
          .from('auto_listing_settings')
          .update(payload)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('auto_listing_settings')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      toast({
        title: 'Success',
        description: 'Auto-listing settings saved successfully'
      });
    } catch (error) {
      console.error('Error saving auto-listing settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save auto-listing settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Listing Settings</CardTitle>
        <CardDescription>
          Automatically create listing drafts from your inventory every day. 
          You'll receive notifications to review and approve listings before they go live.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center space-x-2">
          <Switch
            id="enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => 
              setSettings(prev => ({ ...prev, enabled: checked }))
            }
          />
          <Label htmlFor="enabled">Enable Auto-Listing</Label>
        </div>

        {settings.enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="daily_limit">Daily Listing Limit</Label>
              <Input
                id="daily_limit"
                type="number"
                min="1"
                max="50"
                value={settings.daily_limit}
                onChange={(e) => 
                  setSettings(prev => ({ ...prev, daily_limit: parseInt(e.target.value) || 10 }))
                }
              />
              <p className="text-sm text-muted-foreground">
                Maximum number of listings to create per day (1-50)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule_time">Daily Schedule Time</Label>
              <Input
                id="schedule_time"
                type="time"
                value={settings.schedule_time}
                onChange={(e) => 
                  setSettings(prev => ({ ...prev, schedule_time: e.target.value }))
                }
              />
              <p className="text-sm text-muted-foreground">
                Time when listing drafts will be created each day
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={settings.timezone}
                onValueChange={(value) => 
                  setSettings(prev => ({ ...prev, timezone: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Europe/Paris">Paris</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <Button onClick={saveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
};