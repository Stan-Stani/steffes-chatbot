import type { NextApiRequest, NextApiResponse } from 'next';

import { ChatLogger } from '../../../steffes-packages/chat-logger';
import { requireSwaRole } from '../../../utils/server/identity';

const chatLogger = new ChatLogger();

export type DashboardUsageSummary = {
  userId: string;
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalAssistantMessages: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardUsageEvent = {
  userId: string;
  conversationId: string;
  assistantMessageIndex: number;
  modelId?: string;
  pricingModelId?: string;
  priced: boolean;
  inputTokens: number;
  outputTokens: number;
  totalCostUSD: number;
  createdAt: string;
};

export type DashboardUsageResponse = {
  summaries: DashboardUsageSummary[];
  events: DashboardUsageEvent[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardUsageResponse | { error: string }>,
) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    // Convert Next headers object into Web Headers for shared SWA parser.
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(','));
    }

    requireSwaRole(headers, 'admin');

    const container = (await chatLogger.containerResponsePromise).container;

    const summariesQuery = {
      query:
        'SELECT TOP 200 c.userId, c.totalCostUSD, c.totalInputTokens, c.totalOutputTokens, c.totalAssistantMessages, c.createdAt, c.updatedAt FROM c WHERE c.type = @type ORDER BY c.totalCostUSD DESC',
      parameters: [{ name: '@type', value: 'usageSummary' }],
    };

    const eventsQuery = {
      query:
        'SELECT TOP 200 c.userId, c.conversationId, c.assistantMessageIndex, c.modelId, c.pricingModelId, c.priced, c.inputTokens, c.outputTokens, c.totalCostUSD, c.createdAt FROM c WHERE c.type = @type ORDER BY c.createdAt DESC',
      parameters: [{ name: '@type', value: 'usageEvent' }],
    };

    const [{ resources: summaries }, { resources: events }] = await Promise.all(
      [
        container.items.query(summariesQuery).fetchAll(),
        container.items.query(eventsQuery).fetchAll(),
      ],
    );

    res.status(200).json({
      summaries: (summaries ?? []) as DashboardUsageSummary[],
      events: (events ?? []) as DashboardUsageEvent[],
    });
  } catch (e: any) {
    const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal Server Error' : e.message,
    });
  }
}
