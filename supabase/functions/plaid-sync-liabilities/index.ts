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

  const { card_id } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: card } = await supabase
    .from('cards')
    .select('plaid_item_id, plaid_account_id')
    .eq('id', card_id)
    .single()

  if (!card?.plaid_item_id) {
    return new Response(JSON.stringify({ error: 'Card not linked to Plaid' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: connection } = await supabase
    .from('plaid_connections')
    .select('access_token')
    .eq('item_id', card.plaid_item_id)
    .single()

  // Fetch balances
  const balanceRes = await fetch(`${PLAID_BASE_URL}/accounts/balance/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      access_token: connection!.access_token,
    }),
  })

  const balanceData = await balanceRes.json()
  const account = balanceData.accounts?.find((a: any) => a.account_id === card.plaid_account_id)

  // Fetch liabilities
  const liabRes = await fetch(`${PLAID_BASE_URL}/liabilities/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      access_token: connection!.access_token,
    }),
  })

  const liabData = await liabRes.json()
  if (liabData.error_code) {
    return new Response(JSON.stringify({ error: `Plaid liabilities error: ${liabData.error_message}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const liability = liabData.liabilities?.credit?.find(
    (l: any) => l.account_id === card.plaid_account_id
  )

  const plaidLimit = account?.balances?.limit
  await supabase.from('cards').update({
    current_balance: account?.balances?.current ?? null,
    available_credit: account?.balances?.available ?? null,
    last_statement_balance: liability?.last_statement_balance ?? null,
    minimum_payment: liability?.minimum_payment_amount ?? null,
    next_payment_due: liability?.next_payment_due_date ?? null,
    last_synced_at: new Date().toISOString(),
    ...(plaidLimit != null && { card_limit: String(plaidLimit) }),
  }).eq('id', card_id)

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
