// The shapes the model must answer in (structured output). The same schema is sent to the model
// as the answer format and used by the server to check the answer, so a wrong shape never gets in.
import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** A schedule import: the classes read from a page or a photo. Checked again against real data later. */
export const importAnswer = z.object({
  classes: z.array(
    z.object({
      course: z.string(),
      type: z.enum(['lecture', 'seminar', 'lab']),
      day: z.number().int().min(1).max(6),
      startsAt: time,
      endsAt: time,
      room: z.string(),
      startWeek: z.number().int().min(1).max(15),
      groups: z.array(z.object({ name: z.string(), parity: z.enum(['all', 'odd', 'even']) })),
    }),
  ),
});

/** One busy time of a student, such as work on weekdays from 09:00 to 16:30. */
export const timeWindow = z
  .object({
    day: z.number().int().min(1).max(6),
    from: time,
    to: time,
    what: z.string().min(1).max(100),
  })
  .refine((w) => w.from < w.to, 'from must be before to');

/** A plan: the student's busy windows read from the sources, and a short reply for the chat. */
export const planAnswer = z.object({
  reply: z.string().min(1).max(1000),
  windows: z.array(timeWindow).max(50),
});

export type TimeWindow = z.infer<typeof timeWindow>;
export type PlanAnswer = z.infer<typeof planAnswer>;

/** The JSON Schema Ollama receives as `format`. */
export const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema);
