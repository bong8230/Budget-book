export type TransactionType = 'income' | 'expense' | 'transfer';
export type Ledger = { id: string; name: string; created_by: string; created_at: string };
export type LedgerMember = { ledger_id: string; user_id: string; role: 'owner' | 'member'; display_name: string; joined_at: string };
export type Category = { id: string; ledger_id: string; name: string; type: 'income' | 'expense' };
export type Transaction = { id: string; ledger_id: string; type: TransactionType; amount: number; occurred_on: string; category_id: string | null; memo: string; created_by: string; created_at: string; updated_at: string };
export type MonthlyBudget = { ledger_id: string; month: string; amount: number };
export type ImportItem = { id: string; ledger_id: string; owner_id: string; source: string; raw_text: string; amount: number | null; occurred_on: string | null; merchant: string | null; type: TransactionType | null; status: 'pending' | 'accepted' | 'ignored'; transaction_id: string | null; created_at: string };
