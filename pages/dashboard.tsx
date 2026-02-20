import { useEffect, useState } from 'react';

import type {
  DashboardChatItem,
  DashboardChatsResponse,
} from './api/dashboard/chats';
import type {
  DashboardUsageEvent,
  DashboardUsageResponse,
  DashboardUsageSummary,
} from './api/dashboard/usage';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summaries, setSummaries] = useState<DashboardUsageSummary[]>([]);
  const [events, setEvents] = useState<DashboardUsageEvent[]>([]);
  const [chats, setChats] = useState<DashboardChatItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [usageRes, chatsRes] = await Promise.all([
          fetch('/api/dashboard/usage'),
          fetch('/api/dashboard/chats'),
        ]);

        if (!usageRes.ok) {
          throw new Error(`Usage API error (${usageRes.status})`);
        }
        if (!chatsRes.ok) {
          throw new Error(`Chats API error (${chatsRes.status})`);
        }

        const usageJson = (await usageRes.json()) as DashboardUsageResponse;
        const chatsJson = (await chatsRes.json()) as DashboardChatsResponse;

        if (cancelled) return;

        setSummaries(usageJson.summaries ?? []);
        setEvents(usageJson.events ?? []);
        setChats(chatsJson.chats ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-300">
          Reads from Cosmos via admin-only API routes.
        </p>

        {loading ? (
          <div className="mt-6 text-gray-300">Loading…</div>
        ) : error ? (
          <div className="mt-6 rounded bg-red-900/40 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            <section>
              <h2 className="text-lg font-semibold">Usage Summaries</h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Total Cost (USD)</th>
                      <th className="px-3 py-2">Input Tokens</th>
                      <th className="px-3 py-2">Output Tokens</th>
                      <th className="px-3 py-2">Assistant Msgs</th>
                      <th className="px-3 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {summaries.map((s) => (
                      <tr key={s.userId} className="text-gray-100">
                        <td className="px-3 py-2 font-mono text-xs">
                          {s.userId}
                        </td>
                        <td className="px-3 py-2">
                          {s.totalCostUSD.toFixed(4)}
                        </td>
                        <td className="px-3 py-2">{s.totalInputTokens}</td>
                        <td className="px-3 py-2">{s.totalOutputTokens}</td>
                        <td className="px-3 py-2">
                          {s.totalAssistantMessages}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-300">
                          {s.updatedAt ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Recent Usage Events</h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Conversation</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Tokens (in/out)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {events.slice(0, 50).map((e) => (
                      <tr
                        key={`${e.userId}|${e.conversationId}|${e.assistantMessageIndex}`}
                        className="text-gray-100"
                      >
                        <td className="px-3 py-2 text-xs text-gray-300">
                          {e.createdAt}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {e.userId}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {e.conversationId}
                        </td>
                        <td className="px-3 py-2">
                          {e.pricingModelId ?? e.modelId ?? ''}
                        </td>
                        <td className="px-3 py-2">
                          {e.totalCostUSD.toFixed(4)}
                        </td>
                        <td className="px-3 py-2">
                          {e.inputTokens}/{e.outputTokens}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Recent Chats</h2>
              <div className="mt-3 overflow-x-auto rounded border border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-800 text-gray-200">
                    <tr>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Question</th>
                      <th className="px-3 py-2">Answer (snippet)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {chats.slice(0, 50).map((c) => (
                      <tr key={c.id} className="align-top text-gray-100">
                        <td className="px-3 py-2 text-xs text-gray-300">
                          {c.createdAt}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">
                            {c.userId ?? 'unknown'}
                          </div>
                          <div className="text-xs text-gray-300">
                            {c.userName ?? ''}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {c.modelName ?? c.modelId ?? ''}
                        </td>
                        <td className="max-w-md whitespace-pre-wrap px-3 py-2">
                          {c.question}
                        </td>
                        <td className="max-w-md whitespace-pre-wrap px-3 py-2 text-gray-200">
                          {c.answerSnippet}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
