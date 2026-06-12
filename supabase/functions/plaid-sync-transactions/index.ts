import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const PLAID_SECRET = Deno.env.get('PLAID_SECRET')!
const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const PLAID_BASE_URL = `https://${PLAID_ENV}.plaid.com`

function mapCategory(t: any): string {
  // Use personal_finance_category (modern Plaid field) first
  const pfc = t.personal_finance_category
  if (pfc?.primary) {
    const primary: string = pfc.primary
    const detailed: string = pfc.detailed ?? ''

    if (detailed.startsWith('TRANSPORTATION_GAS')) return 'gas'
    if (primary === 'FOOD_AND_DRINK') {
      return detailed === 'FOOD_AND_DRINK_GROCERIES' ? 'grocery' : 'food'
    }
    if (primary === 'GROCERIES') return 'grocery'
    if (primary === 'TRAVEL' || primary === 'TRANSPORTATION') return 'travel'
    if (detailed.includes('ONLINE_MARKETPLACE') || detailed.includes('DIGITAL_PURCHASE')) return 'online'
    return 'store'
  }

  // Legacy fallback: iterate most-specific to most-general
  const legacyMap: Record<string, string> = {
    'Food and Drink': 'food', 'Restaurants': 'food', 'Coffee Shop': 'food',
    'Fast Food': 'food', 'Bakeries': 'food', 'Delis': 'food', 'Food Courts': 'food',
    'Bar': 'food', 'Breweries': 'food', 'Catering': 'food',
    'Supermarkets and Groceries': 'grocery', 'Warehouse Clubs': 'grocery',
    'Gas Stations': 'gas',
    'Airlines and Aviation Services': 'travel', 'Hotels': 'travel',
    'Car Rental': 'travel', 'Travel': 'travel',
    'Digital Purchase': 'online', 'Internet Services': 'online',
    'Shops': 'store', 'Department Stores': 'store',
  }
  for (const cat of [...(t.category ?? [])].reverse()) {
    if (legacyMap[cat]) return legacyMap[cat]
  }
  return 'store'
}

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
    .select('access_token, cursor')
    .eq('item_id', card.plaid_item_id)
    .single()

  if (!connection) {
    return new Response(JSON.stringify({ error: `No Plaid connection found for item_id: ${card.plaid_item_id}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let cursor = connection.cursor ?? null
  let added: any[] = []
  let modified: any[] = []
  let removed: any[] = []
  let hasMore = true

  while (hasMore) {
    const syncRes = await fetch(`${PLAID_BASE_URL}/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: connection!.access_token,
        cursor,
        options: { include_personal_finance_category: true },
      }),
    })

    const syncData = await syncRes.json()
    if (syncData.error_code) {
      console.error('[plaid-sync-transactions] Plaid error:', JSON.stringify(syncData))
      return new Response(JSON.stringify({ error: `${syncData.error_code}: ${syncData.error_message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    added = added.concat(syncData.added ?? [])
    modified = modified.concat(syncData.modified ?? [])
    removed = removed.concat(syncData.removed ?? [])
    hasMore = syncData.has_more
    cursor = syncData.next_cursor
  }

  // Save updated cursor
  await supabase
    .from('plaid_connections')
    .update({ cursor })
    .eq('item_id', card.plaid_item_id)

  // Upsert added + modified transactions
  const toUpsert = [...added, ...modified]
    .filter((t: any) => t.account_id === card.plaid_account_id)
    .map((t: any) => ({
      id: t.transaction_id,
      card_id,
      amount: Math.abs(t.amount),
      merchant: t.merchant_name ?? t.name,
      category: mapCategory(t),
      date: t.date,
    }))

  if (toUpsert.length > 0) {
    await supabase.from('purchases').upsert(toUpsert, { onConflict: 'id' })
  }

  // Delete removed transactions
  const removedIds = removed.map((t: any) => t.transaction_id).filter(Boolean)
  if (removedIds.length > 0) {
    await supabase.from('purchases').delete().in('id', removedIds)
  }

  return new Response(JSON.stringify({ synced: toUpsert.length, removed: removedIds.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
