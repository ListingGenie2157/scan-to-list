import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, authors, publisher, year, isbn13 } = await req.json();

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      // Fallback heuristic if no key
      const price = heuristicPrice({ title, authors, publisher, year });
      return json({ price }, 200);
    }

    const prompt = `Suggest a realistic used market price in USD for this book. Consider author popularity, year, typical paperback vs hardcover ranges, and general demand. Return ONLY a number (e.g., 8.99).

Title: ${title || ''}
Authors: ${(authors || []).join(', ')}
Publisher: ${publisher || ''}
Year: ${year || ''}
ISBN-13: ${isbn13 || ''}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a pricing assistant. Respond with only a number.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 16
      }),
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const price = toPrice(text) ?? heuristicPrice({ title, authors, publisher, year });

    return json({ price }, 200);
  } catch (error) {
    console.error('Error in generate-price function:', error);
    return json({ error: error.message }, 500);
  }
});

function toPrice(s: string): number | null {
  const m = String(s).match(/[0-9]+(\.[0-9]{1,2})?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  if (!isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(n, 3.0), 100.0); // clamp 3 - 100
}

function heuristicPrice({ title, authors, year }: { title?: string; authors?: string[]; publisher?: string; year?: string; }): number {
  let base = 8.99;
  if (year) {
    const y = parseInt(year.substring(0,4));
    if (!isNaN(y)) {
      if (y < 1970) base += 2;
      if (y > 2015) base -= 1;
    }
  }
  if (authors && authors.length > 0) base += 1;
  if (title && /collector|deluxe|hardcover/i.test(title)) base += 3;
  return Math.round(base * 100) / 100;
}

function json<T>(body: T, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
