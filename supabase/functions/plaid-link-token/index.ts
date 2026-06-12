import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const PLAID_SECRET = Deno.env.get('PLAID_SECRET')!
const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const PLAID_BASE_URL = `https://${PLAID_ENV}.plaid.com`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const body = await req.json().catch(() => ({}))
  const { card_id } = body

  let accessToken: string | undefined

  // If card_id provided, look up existing access token for update mode
  if (card_id) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: card } = await supabase
      .from('cards')
      .select('plaid_item_id')
      .eq('id', card_id)
      .single()

    if (card?.plaid_item_id) {
      const { data: conn } = await supabase
        .from('plaid_connections')
        .select('access_token')
        .eq('item_id', card.plaid_item_id)
        .single()
      accessToken = conn?.access_token
    }
  }

  const linkBody = accessToken
    ? {
        // Update mode — re-authenticates existing item, no products field
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        client_name: 'Credit Card Manager',
        user: { client_user_id: 'default-user' },
        access_token: accessToken,
        country_codes: ['US'],
        language: 'en',
      }
    : {
        // Normal mode — new connection
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        client_name: 'Credit Card Manager',
        user: { client_user_id: 'default-user' },
        products: ['transactions', 'liabilities'],
        country_codes: ['US'],
        language: 'en',
      }

  const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(linkBody),
  })

  const data = await response.json()

  if (!response.ok) {
    return new Response(JSON.stringify({ error: data }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ link_token: data.link_token }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
