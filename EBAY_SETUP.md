# eBay API Integration Setup

## Overview
The eBay pricing functionality has been implemented with proper OAuth authentication and the required scopes you specified.

## Required eBay API Scopes
The following scopes are now properly configured:
- `https://api.ebay.com/oauth/api_scope` - Basic API access
- `https://api.ebay.com/oauth/api_scope/sell.inventory` - Inventory management
- `https://api.ebay.com/oauth/api_scope/sell.account.readonly` - Account information
- `https://api.ebay.com/oauth/api_scope/buy.browse` - Browse and search listings

## Environment Variables Required

To complete the setup, you need to add these environment variables to your Supabase project:

### eBay Application Credentials
```bash
EBAY_CLIENT_ID=your_ebay_app_client_id
EBAY_CLIENT_SECRET=your_ebay_app_client_secret
EBAY_REDIRECT_URI=your_app_redirect_uri
```

### eBay Access Token (Optional - for server-side API calls)
```bash
EBAY_ACCESS_TOKEN=your_ebay_access_token
```

## How to Set Up eBay Developer Account

1. **Create eBay Developer Account**
   - Go to https://developer.ebay.com/
   - Sign up or log in with your eBay account
   - Navigate to "My Account" > "Keys"

2. **Create Application**
   - Click "Create App Key"
   - Choose "Production" for live environment or "Sandbox" for testing
   - Application Type: "Web Application"
   - Configure the scopes listed above

3. **Configure Redirect URI**
   - Set the redirect URI to point to your application
   - For development: `http://localhost:8080/auth/ebay/callback`
   - For production: `https://yourdomain.com/auth/ebay/callback`

4. **Add Credentials to Supabase**
   - Go to your Supabase project dashboard
   - Navigate to Settings > Edge Functions
   - Add the environment variables listed above

## Features Implemented

### 1. eBay Authentication Modal (`EbayAuthModal.tsx`)
- Handles OAuth flow with required scopes
- Opens eBay authorization in popup window
- Exchanges authorization code for access tokens
- Tests connection to verify authentication

### 2. Enhanced Pricing Function (`generate-ebay-listing/index.ts`)
- Real eBay API integration using Browse API
- Searches sold listings for market-based pricing
- Fallback to algorithmic pricing if API unavailable
- Proper error handling for authentication issues

### 3. eBay Auth Edge Function (`ebay-auth/index.ts`)
- Generates authorization URLs with correct scopes
- Handles token exchange and refresh
- Tests API connection
- Stores authentication tokens securely

## How Users Connect eBay

1. User clicks "AI Optimize" in the listing creation modal
2. If eBay authentication is required, the EbayAuthModal opens
3. User clicks "Connect eBay Account"
4. Authorization popup opens with required scopes
5. User authorizes the application on eBay
6. Tokens are exchanged and stored
7. Pricing generation retries automatically

## Testing the Integration

1. **Start the development server**: `npm run dev`
2. **Open the application**: http://localhost:8080
3. **Create a listing** for any inventory item
4. **Click "AI Optimize"** to trigger eBay pricing
5. **Follow the authentication flow** if prompted

## Error Handling

The system handles several error scenarios:
- **Invalid/Missing Scopes**: Shows authentication modal
- **Expired Tokens**: Automatically attempts refresh
- **API Rate Limits**: Falls back to algorithmic pricing
- **Network Issues**: Uses fallback pricing with user notification

## Database Schema Updates Needed

To fully store eBay authentication tokens, add these fields to `user_profiles` table:

```sql
ALTER TABLE user_profiles ADD COLUMN ebay_access_token TEXT;
ALTER TABLE user_profiles ADD COLUMN ebay_refresh_token TEXT;
ALTER TABLE user_profiles ADD COLUMN ebay_token_expires_at TIMESTAMP;
```

## Troubleshooting

### "Invalid Scopes" Error
- Verify all 4 scopes are configured in your eBay app
- Check that the app is approved for production use
- Ensure environment variables are set correctly

### "Authentication Failed" Error
- Check that `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are correct
- Verify the redirect URI matches exactly
- Ensure the eBay app has the correct callback URL

### "No Pricing Data" Error
- Check that `EBAY_ACCESS_TOKEN` is set (optional)
- Verify the Browse API scope is included
- Check eBay API rate limits

## Next Steps

1. Set up eBay developer account and app
2. Add environment variables to Supabase
3. Test the authentication flow
4. Deploy the updated edge functions
5. Test pricing functionality with real eBay data

The system is now properly configured with the correct scopes and should resolve your "invalid scopes" error once the environment variables are set up.