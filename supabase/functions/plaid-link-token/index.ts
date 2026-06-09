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

  const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      client_name: 'Credit Card Manager',
      user: { client_user_id: 'default-user' },
      products: ['transactions', 'liabilities'],
      country_codes: ['US'],
      language: 'en',
    }),
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
