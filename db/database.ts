import { supabase } from '../lib/supabase';

export type Purchase = {
  id: string;
  cardId: string;
  amount: number;
  merchant: string;
  category: 'food' | 'travel' | 'online' | 'store' | 'grocery' | 'gas';
  date: string; // "YYYY-MM-DD"
};

export type UserCard = {
  id: string;
  catalogId: string;
  name: string;
  lastFour: string;
  dueDay: number;
  limit: string;
  imageUrl: string;
  color: string;
  memberSince?: string;  // "YYYY-MM-01" — card opened month, shown on no-fee cards
  feeDueDate?: string;   // "YYYY-MM-DD" — exact annual fee due date, for fee cards
  paidDate?: string;     // "YYYY-MM-DD" of the due date this card was marked paid for
  // Plaid fields — written by edge functions, never by the client
  plaidAccountId?: string;
  plaidItemId?: string;
  currentBalance?: number;
  availableCredit?: number;
  lastStatementBalance?: number;
  minimumPayment?: number;
  nextPaymentDue?: string; // "YYYY-MM-DD"
  lastSyncedAt?: string;   // ISO timestamp
};

function toRow(card: UserCard) {
  return {
    id: card.id,
    catalog_id: card.catalogId,
    name: card.name,
    last_four: card.lastFour,
    due_day: card.dueDay,
    card_limit: card.limit,
    image_url: card.imageUrl,
    color: card.color,
    ...(card.memberSince !== undefined && { member_since: card.memberSince }),
    ...(card.feeDueDate !== undefined && { fee_due_date: card.feeDueDate }),
  };
}

function fromRow(row: Record<string, unknown>): UserCard {
  return {
    id: row.id as string,
    catalogId: row.catalog_id as string,
    name: row.name as string,
    lastFour: row.last_four as string,
    dueDay: row.due_day as number,
    limit: row.card_limit as string,
    imageUrl: row.image_url as string,
    color: row.color as string,
    memberSince: (row.member_since as string | null | undefined) ?? undefined,
    feeDueDate: (row.fee_due_date as string | null | undefined) ?? undefined,
    paidDate: (row.paid_date as string | null | undefined) ?? undefined,
    plaidAccountId: (row.plaid_account_id as string | null | undefined) ?? undefined,
    plaidItemId: (row.plaid_item_id as string | null | undefined) ?? undefined,
    currentBalance: row.current_balance != null ? Number(row.current_balance) : undefined,
    availableCredit: row.available_credit != null ? Number(row.available_credit) : undefined,
    lastStatementBalance: row.last_statement_balance != null ? Number(row.last_statement_balance) : undefined,
    minimumPayment: row.minimum_payment != null ? Number(row.minimum_payment) : undefined,
    nextPaymentDue: (row.next_payment_due as string | null | undefined) ?? undefined,
    lastSyncedAt: (row.last_synced_at as string | null | undefined) ?? undefined,
  };
}

export async function getCards(): Promise<UserCard[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .order('due_day', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}

export async function insertCard(card: UserCard): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .insert(toRow(card));

  if (error) throw new Error(error.message);
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteCards(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .delete()
    .in('id', ids);

  if (error) throw new Error(error.message);
}

export async function setCardPaidDate(id: string, paidDate: string | null): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .update({ paid_date: paidDate })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateCard(card: UserCard): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .update(toRow(card))
    .eq('id', card.id);

  if (error) throw new Error(error.message);
}

// ─── Purchases ───────────────────────────────────────────────────────────────

function purchaseToRow(p: Purchase) {
  return {
    id: p.id,
    card_id: p.cardId,
    amount: p.amount,
    merchant: p.merchant,
    category: p.category,
    date: p.date,
  };
}

function purchaseFromRow(row: Record<string, unknown>): Purchase {
  return {
    id: row.id as string,
    cardId: row.card_id as string,
    amount: Number(row.amount),
    merchant: row.merchant as string,
    category: row.category as Purchase['category'],
    date: row.date as string,
  };
}

export async function getPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(purchaseFromRow);
}

export async function insertPurchase(p: Purchase): Promise<void> {
  const { error } = await supabase
    .from('purchases')
    .insert(purchaseToRow(p));

  if (error) throw new Error(error.message);
}

export async function deletePurchase(id: string): Promise<void> {
  const { error } = await supabase
    .from('purchases')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function clearAllData(): Promise<void> {
  const { error: purchasesError } = await supabase
    .from('purchases')
    .delete()
    .not('id', 'is', null);
  if (purchasesError) throw new Error(purchasesError.message);

  const { error: cardsError } = await supabase
    .from('cards')
    .delete()
    .not('id', 'is', null);
  if (cardsError) throw new Error(cardsError.message);
}

// ─── Plaid Edge Functions ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function callEdge(name: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : data?.error?.message ?? 'Edge function error';
    throw new Error(msg);
  }
  return data;
}

export async function plaidGetLinkToken(): Promise<string> {
  const data = await callEdge('plaid-link-token') as { link_token: string };
  return data.link_token;
}

export async function plaidExchangeToken(opts: {
  publicToken: string;
  institutionName: string;
  institutionId: string;
  accountId?: string;
  cardId?: string;
}): Promise<void> {
  await callEdge('plaid-exchange-token', {
    public_token: opts.publicToken,
    institution_name: opts.institutionName,
    institution_id: opts.institutionId,
    ...(opts.accountId && { account_id: opts.accountId }),
    ...(opts.cardId && { card_id: opts.cardId }),
  });
}

export async function plaidSyncLiabilities(cardId: string): Promise<void> {
  await callEdge('plaid-sync-liabilities', { card_id: cardId });
}

export async function plaidSyncTransactions(cardId: string): Promise<void> {
  await callEdge('plaid-sync-transactions', { card_id: cardId });
}
