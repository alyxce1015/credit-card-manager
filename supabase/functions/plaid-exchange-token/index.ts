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

  const { public_token, account_id, card_id, institution_name, institution_id } = await req.json()

  // Exchange public token for access token
  const exchangeRes = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      public_token,
    }),
  })

  const exchangeData = await exchangeRes.json()

  if (!exchangeRes.ok) {
    return new Response(JSON.stringify({ error: exchangeData }), {
      status: exchangeRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { access_token, item_id } = exchangeData

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Store the access token securely
  await supabase.from('plaid_connections').upsert({
    item_id,
    access_token,
    institution_name,
    institution_id,
  })

  // Resolve account_id — use what was passed, or fall back to fetching from Plaid
  let resolvedAccountId = account_id
  if (!resolvedAccountId && card_id) {
    const accountsRes = await fetch(`${PLAID_BASE_URL}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, access_token }),
    })
    const accountsData = await accountsRes.json()
    const accounts = accountsData.accounts ?? []
    const creditAccount = accounts.find((a: any) => a.type === 'credit') ?? accounts[0]
    resolvedAccountId = creditAccount?.account_id ?? null
  }

  // Link the Plaid account to the card
  if (card_id) {
    await supabase.from('cards').update({
      plaid_account_id: resolvedAccountId,
      plaid_item_id: item_id,
    }).eq('id', card_id)
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
