import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const PLAID_SECRET = Deno.env.get('PLAID_SECRET')!
const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()

    const body: Record<string, unknown> = {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      client_name: 'Credit Card Manager',
      country_codes: ['US'],
      language: 'en',
      user: { client_user_id: user_id ?? 'anonymous' },
      products: ['transactions', 'liabilities'],
    }

    const redirectUri = Deno.env.get('PLAID_REDIRECT_URI')
    if (redirectUri) body.redirect_uri = redirectUri

    const response = await fetch(`https://${PLAID_ENV}.plaid.com/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (data.error_code) {
      return new Response(
        JSON.stringify({ error: data.error_message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ link_token: data.link_token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
