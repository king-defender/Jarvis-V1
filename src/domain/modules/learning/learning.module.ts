import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { z } from 'zod';
import type { ModelRouterService } from '../../../infrastructure/ai/model-router.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const SyllabusSchema = z.object({
  topic: z.string().min(2),
  totalHours: z.number().positive(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']),
});

const FlashcardsSchema = z.object({
  sourceText: z.string().min(20).optional(),
  sourceFilePath: z.string().optional(),
  maxFlashcards: z.number().int().positive().default(8),
});

const SummarizeSchema = z.object({
  paperPath: z.string().optional(),
  paperText: z.string().optional(),
});

export function getLearningCommandRegistrations(deps: {
  storage: IStorageService;
  modelRouter: ModelRouterService;
  eventBus: ISystemEventBus;
}): CommandRegistration[] {
  return [
    {
      command: 'learning.create-syllabus',
      schema: SyllabusSchema,
      handler: async (payload: z.infer<typeof SyllabusSchema>, context) => {
        const weeks = Math.max(2, Math.ceil(payload.totalHours / 5));
        const modules = Array.from({ length: weeks }, (_, i) => ({
          week: i + 1,
          title: `${payload.topic} — Week ${i + 1} (${payload.skillLevel})`,
          sources: [
            `https://learn.example.com/${encodeURIComponent(payload.topic)}/week-${i + 1}`,
          ],
        }));
        const syllabusId = randomUUID();
        const now = new Date().toISOString();
        await deps.storage.collection('learning_syllabi').insertOne({
          id: syllabusId,
          user_id: context.userId,
          topic: payload.topic,
          total_hours: payload.totalHours,
          skill_level: payload.skillLevel,
          modules,
          created_at: now,
          updated_at: now,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'learning.syllabus_created',
            payload: { syllabusId, topic: payload.topic },
            producer: 'LearningModule',
          }),
        );

        return { syllabusId, modules };
      },
    },
    {
      command: 'learning.generate-flashcards',
      schema: FlashcardsSchema,
      handler: async (payload: z.infer<typeof FlashcardsSchema>, context) => {
        let source = payload.sourceText ?? '';
        if (!source && payload.sourceFilePath) {
          source = await fs.readFile(payload.sourceFilePath, 'utf8');
        }
        if (!source) {
          throw new Error('Provide sourceText or sourceFilePath');
        }

        const sentences = source
          .split(/[.!?\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 20)
          .slice(0, payload.maxFlashcards);

        const cards = sentences.map((sentence, index) => ({
          q: `What is the key idea #${index + 1}?`,
          a: sentence.slice(0, 240),
        }));

        const deckId = randomUUID();
        const now = new Date().toISOString();
        await deps.storage.collection('learning_decks').insertOne({
          deck_id: deckId,
          user_id: context.userId,
          name: `Deck ${now}`,
          cards_json: cards,
          created_at: now,
        });

        for (const [i, card] of cards.entries()) {
          await deps.storage.collection('study_progress').insertOne({
            card_id: `${deckId}-${i}`,
            deck_id: deckId,
            box_level: 1,
            next_review_at: now,
            question: card.q,
          });
        }

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'learning.flashcards_generated',
            payload: { deckId, cardsCount: cards.length },
            producer: 'LearningModule',
          }),
        );

        return { deckId, cardsCount: cards.length, cards };
      },
    },
    {
      command: 'learning.summarize-paper',
      schema: SummarizeSchema,
      handler: async (payload: z.infer<typeof SummarizeSchema>) => {
        let text = payload.paperText ?? '';
        if (!text && payload.paperPath) {
          text = await fs.readFile(payload.paperPath, 'utf8');
        }
        if (!text) {
          throw new Error('Provide paperText or paperPath');
        }

        const ai = await deps.modelRouter.complete({
          systemPrompt: 'Summarize academic/technical writing.',
          prompt: text.slice(0, 4000),
        });

        const sentences = text
          .split(/[.!?]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 30)
          .slice(0, 5);

        return {
          abstractSummary: ai.text.slice(0, 500),
          keyTakeaways: sentences,
          glossary: Object.fromEntries(
            [...new Set(text.toLowerCase().match(/\b[a-z]{6,}\b/g) ?? [])]
              .slice(0, 5)
              .map((term) => [term, `Term related to the source material`]),
          ),
        };
      },
    },
  ];
}
