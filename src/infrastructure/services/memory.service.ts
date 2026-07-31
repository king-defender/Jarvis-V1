import { randomUUID } from 'node:crypto';
import type { IStorageService } from './storage.service.js';

export type TaughtIntent = {
  id: string;
  phrase: string;
  kind: 'command' | 'workflow';
  target: string;
  payload: Record<string, unknown>;
  spokenReply: string;
  userId: string;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MemoryNote = {
  key: string;
  value: string;
  userId: string;
  updatedAt: string;
};

export type InteractionEvent = {
  id: string;
  userId: string;
  utterance?: string;
  command?: string;
  workflow?: string;
  ok: boolean;
  summary: string;
  createdAt: string;
};

export type FeedbackEvent = {
  id: string;
  userId: string;
  rating: 'up' | 'down';
  note: string;
  relatedId?: string;
  createdAt: string;
};

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/[?!,]/g, '');
}

/**
 * Runtime learning store (Mongo). Improves Jarvis without editing source.
 */
export class MemoryService {
  constructor(private readonly storage: IStorageService) {}

  async teachIntent(input: {
    userId: string;
    phrase: string;
    kind: 'command' | 'workflow';
    target: string;
    payload?: Record<string, unknown>;
    spokenReply?: string;
  }): Promise<TaughtIntent> {
    const phrase = normalizePhrase(input.phrase);
    const now = new Date().toISOString();
    const existing = await this.storage.collection('assistant_teachings').findOne({
      user_id: input.userId,
      phrase,
    });
    if (existing) {
      await this.storage.collection('assistant_teachings').updateOne(
        { id: existing.id },
        {
          $set: {
            kind: input.kind,
            target: input.target,
            payload: input.payload ?? {},
            spoken_reply:
              input.spokenReply ??
              `Running ${input.target} from your teaching.`,
            updated_at: now,
          },
        },
      );
      return {
        id: String(existing.id),
        phrase,
        kind: input.kind,
        target: input.target,
        payload: (input.payload as Record<string, unknown>) ?? {},
        spokenReply: input.spokenReply ?? `Running ${input.target} from your teaching.`,
        userId: input.userId,
        hitCount: Number(existing.hit_count ?? 0),
        createdAt: String(existing.created_at ?? now),
        updatedAt: now,
      };
    }

    const doc: TaughtIntent = {
      id: randomUUID(),
      phrase,
      kind: input.kind,
      target: input.target,
      payload: input.payload ?? {},
      spokenReply: input.spokenReply ?? `Running ${input.target} from your teaching.`,
      userId: input.userId,
      hitCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.collection('assistant_teachings').insertOne({
      id: doc.id,
      user_id: doc.userId,
      phrase: doc.phrase,
      kind: doc.kind,
      target: doc.target,
      payload: doc.payload,
      spoken_reply: doc.spokenReply,
      hit_count: 0,
      created_at: doc.createdAt,
      updated_at: doc.updatedAt,
    });
    return doc;
  }

  async findTaughtIntent(userId: string, utterance: string): Promise<TaughtIntent | null> {
    const text = normalizePhrase(utterance);
    const rows = await this.storage
      .collection('assistant_teachings')
      .find({ user_id: userId })
      .sort({ updated_at: -1 })
      .limit(200)
      .toArray();

    let best: (typeof rows)[number] | null = null;
    for (const row of rows) {
      const phrase = String(row.phrase ?? '');
      if (!phrase) continue;
      if (text === phrase || text.includes(phrase) || phrase.includes(text)) {
        if (!best || phrase.length > String(best.phrase).length) best = row;
      }
    }
    if (!best) return null;

    await this.storage.collection('assistant_teachings').updateOne(
      { id: best.id },
      { $inc: { hit_count: 1 }, $set: { updated_at: new Date().toISOString() } },
    );

    return {
      id: String(best.id),
      phrase: String(best.phrase),
      kind: best.kind === 'workflow' ? 'workflow' : 'command',
      target: String(best.target),
      payload: (best.payload as Record<string, unknown>) ?? {},
      spokenReply: String(best.spoken_reply ?? `Running ${best.target}.`),
      userId: String(best.user_id),
      hitCount: Number(best.hit_count ?? 0) + 1,
      createdAt: String(best.created_at ?? ''),
      updatedAt: new Date().toISOString(),
    };
  }

  async listTeachings(userId: string): Promise<TaughtIntent[]> {
    const rows = await this.storage
      .collection('assistant_teachings')
      .find({ user_id: userId })
      .sort({ updated_at: -1 })
      .limit(100)
      .toArray();
    return rows.map((best) => ({
      id: String(best.id),
      phrase: String(best.phrase),
      kind: best.kind === 'workflow' ? 'workflow' : 'command',
      target: String(best.target),
      payload: (best.payload as Record<string, unknown>) ?? {},
      spokenReply: String(best.spoken_reply ?? ''),
      userId: String(best.user_id),
      hitCount: Number(best.hit_count ?? 0),
      createdAt: String(best.created_at ?? ''),
      updatedAt: String(best.updated_at ?? ''),
    }));
  }

  async remember(userId: string, key: string, value: string): Promise<MemoryNote> {
    const now = new Date().toISOString();
    const k = key.trim().toLowerCase();
    await this.storage.collection('assistant_memory').updateOne(
      { user_id: userId, key: k },
      {
        $set: { user_id: userId, key: k, value, updated_at: now },
        $setOnInsert: { id: randomUUID(), created_at: now },
      },
      { upsert: true },
    );
    return { key: k, value, userId, updatedAt: now };
  }

  async recall(userId: string, key?: string): Promise<MemoryNote[]> {
    const filter: Record<string, unknown> = { user_id: userId };
    if (key?.trim()) filter.key = key.trim().toLowerCase();
    const rows = await this.storage
      .collection('assistant_memory')
      .find(filter)
      .sort({ updated_at: -1 })
      .limit(100)
      .toArray();
    return rows.map((r) => ({
      key: String(r.key),
      value: String(r.value),
      userId: String(r.user_id),
      updatedAt: String(r.updated_at ?? ''),
    }));
  }

  async recordInteraction(input: {
    userId: string;
    utterance?: string;
    command?: string;
    workflow?: string;
    ok: boolean;
    summary: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.storage.collection('assistant_interactions').insertOne({
      id: randomUUID(),
      user_id: input.userId,
      utterance: input.utterance ?? null,
      command: input.command ?? null,
      workflow: input.workflow ?? null,
      ok: input.ok,
      summary: input.summary,
      created_at: now,
    });
  }

  async feedback(input: {
    userId: string;
    rating: 'up' | 'down';
    note: string;
    relatedId?: string;
  }): Promise<FeedbackEvent> {
    const event: FeedbackEvent = {
      id: randomUUID(),
      userId: input.userId,
      rating: input.rating,
      note: input.note,
      createdAt: new Date().toISOString(),
    };
    if (input.relatedId) event.relatedId = input.relatedId;
    await this.storage.collection('assistant_feedback').insertOne({
      id: event.id,
      user_id: event.userId,
      rating: event.rating,
      note: event.note,
      related_id: event.relatedId ?? null,
      created_at: event.createdAt,
    });
    return event;
  }

  async recentInteractions(userId: string, limit = 20): Promise<InteractionEvent[]> {
    const rows = await this.storage
      .collection('assistant_interactions')
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    return rows.map((r) => {
      const event: InteractionEvent = {
        id: String(r.id),
        userId: String(r.user_id),
        ok: Boolean(r.ok),
        summary: String(r.summary ?? ''),
        createdAt: String(r.created_at ?? ''),
      };
      if (r.utterance) event.utterance = String(r.utterance);
      if (r.command) event.command = String(r.command);
      if (r.workflow) event.workflow = String(r.workflow);
      return event;
    });
  }
}
