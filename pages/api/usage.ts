import { parseIdentityInfoFromHeaders } from '../../utils/server/identity';
import type { Container, ContainerResponse } from '@azure/cosmos';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ChatLogger } from '../../steffes-packages/chat-logger';

export type UsagePersistBody = {
  conversationId: string;
  assistantMessageIndex: number;
  modelId?: string;
  pricingModelId?: string;
  priced: boolean;
  inputTokens: number;
  outputTokens: number;
  totalCostUSD: number;
};

const chatLogger = new ChatLogger();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const body = req.body as Partial<UsagePersistBody>;

    if (!body.conversationId || typeof body.conversationId !== 'string') {
      res.status(400).send('Missing conversationId');
      return;
    }

    if (typeof body.assistantMessageIndex !== 'number') {
      res.status(400).send('Missing assistantMessageIndex');
      return;
    }

    if (typeof body.inputTokens !== 'number' || typeof body.outputTokens !== 'number') {
      res.status(400).send('Missing token counts');
      return;
    }

    if (typeof body.totalCostUSD !== 'number') {
      res.status(400).send('Missing totalCostUSD');
      return;
    }

    if (typeof body.priced !== 'boolean') {
      res.status(400).send('Missing priced');
      return;
    }

    // Best-effort: return 200 even if Cosmos is down (but log it).
    await persistUsageToCosmos({
      containerPromise: chatLogger.containerResponsePromise,
      headers: req.headers,
      conversationId: body.conversationId,
      assistantMessageIndex: body.assistantMessageIndex,
      modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
      pricingModelId:
        typeof body.pricingModelId === 'string' ? body.pricingModelId : undefined,
      priced: body.priced,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      totalCostUSD: body.totalCostUSD,
    });

    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.warn('[usage] Failed', e);
    // Don’t break the UI if persistence fails.
    res.status(200).json({ ok: false });
  }
};

export default handler;

type PersistInput = {
  containerPromise: Promise<ContainerResponse>;
  headers: NextApiRequest['headers'];
  conversationId: string;
  assistantMessageIndex: number;
  modelId?: string;
  pricingModelId?: string;
  priced: boolean;
  inputTokens: number;
  outputTokens: number;
  totalCostUSD: number;
};

async function persistUsageToCosmos(input: PersistInput): Promise<void> {
  let container: Container | undefined;
  try {
    const resp = await input.containerPromise;
    container = resp?.container;
  } catch (e) {
    console.warn('[usage] Cosmos container unavailable', e);
    return;
  }

  if (!container) return;

  // Convert Next's plain object headers to Web Headers for shared parser.
  const headers = new Headers();
  for (const [k, v] of Object.entries(input.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(','));
  }

    const identity = parseIdentityInfoFromHeaders(headers);
    console.log(identity ? '[usage] Persisting usage for user' : '[usage] Persisting usage for anonymous user', {
      conversationId: input.conversationId,
      assistantMessageIndex: input.assistantMessageIndex,
      modelId: input.modelId,
      pricingModelId: input.pricingModelId,
      priced: input.priced,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalCostUSD: input.totalCostUSD,
    });
  const userId = identity?.userId?.trim() || 'anonymous';

  const nowIso = new Date().toISOString();
  const eventId = `usageEvent|${userId}|${input.conversationId}|${input.assistantMessageIndex}`;
  const summaryId = `usageSummary|${userId}`;

  const usageEvent = {
    id: eventId,
    type: 'usageEvent',
    userId,
    conversationId: input.conversationId,
    assistantMessageIndex: input.assistantMessageIndex,
    modelId: input.modelId,
    pricingModelId: input.pricingModelId,
    priced: input.priced,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalCostUSD: input.totalCostUSD,
    createdAt: nowIso,
  };

  // Idempotency: if this event already exists, do not increment the summary.
  try {
    await container.items.create(usageEvent);
  } catch (e: any) {
    const status = e?.code ?? e?.statusCode;
    if (status === 409 || e?.code === 'Conflict') {
      return;
    }
    console.warn('[usage] Failed to create usage event', {
      eventId,
      status,
      message: e?.message,
    });
    return;
  }

  // Create/update the running summary.
  // Use a query + upsert to avoid assuming the container's partition key.
  try {
    const query = {
      query:
        'SELECT TOP 1 * FROM c WHERE c.type = @type AND c.id = @id AND c.userId = @userId',
      parameters: [
        { name: '@type', value: 'usageSummary' },
        { name: '@id', value: summaryId },
        { name: '@userId', value: userId },
      ],
    };

    const { resources } = await container.items.query(query).fetchAll();
    const existing = resources?.[0] as any | undefined;

    const nextDoc = {
      ...(existing ?? {}),
      id: summaryId,
      type: 'usageSummary',
      userId,
      totalCostUSD: (existing?.totalCostUSD ?? 0) + input.totalCostUSD,
      totalInputTokens: (existing?.totalInputTokens ?? 0) + input.inputTokens,
      totalOutputTokens:
        (existing?.totalOutputTokens ?? 0) + input.outputTokens,
      totalAssistantMessages: (existing?.totalAssistantMessages ?? 0) + 1,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    await container.items.upsert(nextDoc);
  } catch (e: any) {
    console.warn('[usage] Failed to upsert usage summary', {
      summaryId,
      message: e?.message,
      status: e?.code ?? e?.statusCode,
    });
  }
}
