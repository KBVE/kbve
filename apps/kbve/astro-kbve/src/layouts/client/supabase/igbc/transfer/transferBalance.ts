import { z } from 'zod';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

export const transferSchema = z.object({
  to_user: z.string().uuid(),
  kind: z.enum(['credit', 'khash']),
  amount: z.number().positive().max(1000000),
  reason: z.string()
    .min(3, { message: 'Reason must be at least 3 characters.' })
    .max(100, { message: 'Reason must be at most 100 characters.' })
    .regex(/^[a-zA-Z0-9 _\-()]+$/, { message: 'Reason can only contain letters, numbers, spaces, underscores, hyphens, and parentheses.' }),
  meta: z.record(z.any()).optional()
});

export type TransferInput = z.infer<typeof transferSchema>;

export async function transferBalance(input: TransferInput) {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error, data: null };
  }

  const { to_user, kind, amount, reason, meta } = parsed.data;

  const { data, error } = await supabase.rpc('transfer_balance_proxy', {
    p_to_user: to_user,
    p_kind: kind,
    p_amount: amount,
    p_reason: reason,
    p_meta: meta ?? {},
  });

  return { data, error };
}