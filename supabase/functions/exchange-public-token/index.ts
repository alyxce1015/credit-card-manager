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
    const { public_token, institution_id, institution_name, card_id } = await req.json()

    const exchangeRes = await fetch(`https://${PLAID_ENV}.plaid.com/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token,
      }),
    })

    const exchangeData = await exchangeRes.json()

    if (exchangeData.error_code) {
      return new Response(
        JSON.stringify({ error: exchangeData.error_message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { access_token, item_id } = exchangeData

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: connError } = await supabase.from('plaid_connections').upsert({
      item_id,
      access_token,
      institution_id,
      institution_name,
    })

    if (connError) throw new Error(connError.message)

    if (card_id) {
      const accountsRes = await fetch(`https://${PLAID_ENV}.plaid.com/accounts/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          access_token,
        }),
      })

      const { accounts } = await accountsRes.json()

      if (accounts?.length) {
        await supabase
          .from('cards')
          .update({
            plaid_item_id: item_id,
            plaid_account_id: accounts[0].account_id,
          })
          .eq('id', card_id)
      }
    }

    return new Response(
      JSON.stringify({ success: true, item_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
