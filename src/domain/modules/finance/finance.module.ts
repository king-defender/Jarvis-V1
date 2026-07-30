import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { RuleEngineEvaluator } from '../../../evaluation/rules/rule-engine.evaluator.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const ParseReceiptSchema = z.object({
  receiptFilePath: z.string().optional(),
  receiptText: z.string().optional(),
  monthlyBudget: z.number().positive().default(2000),
});

const ReportSchema = z.object({
  startDate: z.string().min(4),
  endDate: z.string().min(4),
  monthlyBudget: z.number().positive().default(2000),
});

function parseReceiptText(text: string): {
  merchant: string;
  date: string;
  items: Array<{ name: string; price: number }>;
  total: number;
  currency: string;
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const merchant = lines[0] ?? 'Unknown Merchant';
  const dateMatch = text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/);
  const items: Array<{ name: string; price: number }> = [];
  for (const line of lines.slice(1)) {
    const m = line.match(/^(.*?)[\s\$]*(\d+\.\d{2})\s*$/);
    if (m?.[1] && m[2]) {
      items.push({ name: m[1].trim(), price: Number(m[2]) });
    }
  }
  const total =
    items.reduce((sum, i) => sum + i.price, 0) ||
    Number(text.match(/total[:\s\$]*(\d+\.\d{2})/i)?.[1] ?? 0);
  return {
    merchant,
    date: dateMatch?.[0] ?? new Date().toISOString().slice(0, 10),
    items,
    total,
    currency: 'USD',
  };
}

export function getFinanceCommandRegistrations(deps: {
  storage: IStorageService;
  eventBus: ISystemEventBus;
}): CommandRegistration[] {
  return [
    {
      command: 'finance.parse-receipt',
      schema: ParseReceiptSchema,
      handler: async (payload: z.infer<typeof ParseReceiptSchema>, context) => {
        let text = payload.receiptText ?? '';
        if (!text && payload.receiptFilePath) {
          text = await fs.readFile(payload.receiptFilePath, 'utf8');
        }
        if (!text) {
          text = 'Cafe Example\nLatte 4.50\nSandwich 8.25\nTotal 12.75';
        }

        const parsed = parseReceiptText(text);
        const category =
          /uber|lyft|taxi/i.test(parsed.merchant)
            ? 'Transport'
            : /cafe|coffee|restaurant/i.test(parsed.merchant)
              ? 'Food'
              : 'General';

        const id = randomUUID();
        const now = new Date().toISOString();
        await deps.storage.collection('financial_expenses').insertOne({
          id,
          user_id: context.userId,
          merchant: parsed.merchant,
          transaction_date: parsed.date,
          amount: parsed.total,
          currency: parsed.currency,
          category,
          raw_payload_json: parsed,
          created_at: now,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'finance.receipt_parsed',
            payload: { id, merchant: parsed.merchant, total: parsed.total },
            producer: 'FinanceModule',
          }),
        );

        return { ...parsed, category, expenseId: id };
      },
    },
    {
      command: 'finance.generate-report',
      schema: ReportSchema,
      handler: async (payload: z.infer<typeof ReportSchema>, context) => {
        const expenses = await deps.storage
          .collection('financial_expenses')
          .find({
            user_id: context.userId,
            transaction_date: { $gte: payload.startDate, $lte: payload.endDate },
          })
          .toArray();

        const breakdown: Record<string, number> = {};
        let totalSpent = 0;
        for (const expense of expenses) {
          const amount = Number(expense.amount ?? 0);
          const category = String(expense.category ?? 'General');
          breakdown[category] = (breakdown[category] ?? 0) + amount;
          totalSpent += amount;
        }

        const withinBudget = RuleEngineEvaluator.evaluateField(
          totalSpent,
          'LESS_THAN_OR_EQUAL',
          payload.monthlyBudget,
        );

        const reportId = randomUUID();
        const now = new Date().toISOString();
        await deps.storage.collection('financial_reports').insertOne({
          id: reportId,
          user_id: context.userId,
          start_date: payload.startDate,
          end_date: payload.endDate,
          total_spent: totalSpent,
          breakdown,
          within_budget: withinBudget,
          created_at: now,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'finance.report_generated',
            payload: { reportId, totalSpent, withinBudget },
            producer: 'FinanceModule',
          }),
        );

        return { reportId, totalSpent, breakdown, withinBudget };
      },
    },
  ];
}
