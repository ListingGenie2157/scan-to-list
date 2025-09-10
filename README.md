# AI Inference in Supabase Edge Functions

Since Supabase Edge Runtime [v1.36.0](https://github.com/supabase/edge-runtime/releases/tag/v1.36.0) you can run the [`gte-small` model](https://huggingface.co/Supabase/gte-small) natively within Supabase Edge Functions without any external dependencies! This allows you to easily generate text embeddings without calling any external APIs!

## Semantic Search with pgvector and Supabase Edge Functions

This demo consists of three parts:

1. A [`generate-embedding`](./supabase/functions/generate-embedding/index.ts) database webhook edge function which generates embeddings when a content row is added (or updated) in the [`public.embeddings`](./supabase/migrations/20240408072601_embeddings.sql) table.
2. A [`query_embeddings` Postgres function](./supabase/migrations/20240410031515_vector-search.sql) which allows us to perform similarity search from an egde function via [Remote Procedure Call (RPC)](https://supabase.com/docs/guides/database/functions?language=js).
3. A [`search` edge function](./supabase/functions/search/index.ts) which generates the embedding for the search term, performs the similarity search via RPC function call, and returns the result.

## Deploy

- Link your project: `supabase link`
- Deploy Edge Functions: `supabase functions deploy`
- Update project config to [enable webhooks](https://supabase.com/docs/guides/local-development/cli/config#experimental.webhooks.enabled): `supabase config push`
- Navigate to the [database-webhook](./supabase/migrations/20240410041607_database-webhook.sql) migration file and insert your `generate-embedding` function details.
- Push up the database schema `supabase db push`

## Run

Run a search via curl POST request:

```bash
curl -i --location --request POST 'https://<PROJECT-REF>.supabase.co/functions/v1/search' \
    --header 'Authorization: Bearer <SUPABASE_ANON_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"search":"vehicles"}'
```

## Operational Endpoints (Scan-to-List)

These helper endpoints make it easier to verify OAuth setup, check RLS visibility, and safely mirror external images into Storage.

### 1) OAuth health (validate RuName mapping and scopes)

- Path: `/functions/v1/oauth-health`
- Method: `GET`
- Auth: Required (Authorization bearer token for the signed-in user)

Example:

```bash
curl -s \
  -H "Authorization: Bearer <SUPABASE_SESSION_ACCESS_TOKEN>" \
  "https://<PROJECT-REF>.supabase.co/functions/v1/oauth-health"
```

Response:

```json
{
  "success": true,
  "callbackUrl": "https://<PROJECT-REF>.supabase.co/functions/v1/ebay-oauth-callback",
  "scopes": [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account.readonly"
  ]
}
```

Use this to confirm your eBay portal RuName (Redirect URI) exactly matches `callbackUrl`, and that only the intended SELL scopes are present.

### 2) Inventory health (RLS visibility quick check)

- Path: `/functions/v1/inventory-health`
- Method: `GET`
- Auth: Required

Example:

```bash
curl -s \
  -H "Authorization: Bearer <SUPABASE_SESSION_ACCESS_TOKEN>" \
  "https://<PROJECT-REF>.supabase.co/functions/v1/inventory-health"
```

Response (example):

```json
{
  "success": true,
  "rls_visible": {
    "items": true,
    "photos": true,
    "inventory_items": true
  }
}
```

### 3) Mirror cover (server-side image fetch to Storage)

- Path: `/functions/v1/mirror-cover`
- Method: `POST`
- Auth: Required

Body:

```json
{
  "itemId": 123,
  "type": "magazine", // "book" | "magazine" | "bundle"
  "sourceUrl": "https://example.com/image.jpg"
}
```

Example:

```bash
curl -s -X POST \
  -H "Authorization: Bearer <SUPABASE_SESSION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"itemId":123,"type":"magazine","sourceUrl":"https://example.com/image.jpg"}' \
  "https://<PROJECT-REF>.supabase.co/functions/v1/mirror-cover"
```

Response (example):

```json
{
  "success": true,
  "public_url": "https://<PROJECT-REF>.supabase.co/storage/v1/object/public/photos/<path>",
  "thumb_url": "https://<PROJECT-REF>.supabase.co/storage/v1/object/public/photos/<path>"
}
```

### 4) CSV exports are private + signed URLs

- The `exports` Storage bucket is private. Export endpoints return short‑lived signed URLs.
- Ensure your client always fetches using the returned `download_url`.

### 5) process-book-cover auth posture

- `process-book-cover` is protected with `verify_jwt = true` and derives the user from the Authorization header.
- It returns `200 { success: boolean, ... }` payloads to avoid raw 500s in clients.

