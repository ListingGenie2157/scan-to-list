# OCR Function Debug Guide

## Common Causes for Non-2xx Errors:

### 1. Missing Environment Variables (500 Error)
Check if these are set in your Supabase project:
- `OPENAI_API_KEY` 
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Fix:** Go to Supabase Dashboard → Settings → Edge Functions → Environment Variables

### 2. Invalid Request Payload (400 Error)
The function expects:
```json
{
  "photoId": "uuid-string",
  "imageUrl": "https://...",
  "batchSettings": { ... }
}
```

### 3. OpenAI API Issues (500 Error)
- API key invalid/expired
- Rate limit exceeded  
- OpenAI API down
- Invalid image URL (can't fetch image)

### 4. Supabase Database Issues (500 Error)
- Database connection failed
- Table/column doesn't exist
- Permission issues

## Quick Fixes to Try:

1. **Check Environment Variables**
2. **Verify OpenAI API Key** is valid and has credits
3. **Check Image URL** is publicly accessible
4. **Review function logs** in Supabase Dashboard

## Temporary Workaround:
The function has fallback handling for missing API keys - it should still work but with placeholder data.