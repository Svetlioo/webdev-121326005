// The project's MCP server: the Exercise 1 protocol loop, with tools that call the same
// service functions as the HTTP API. It signs in with MCP_TOKEN (a Better Auth session
// token), so a tool may do exactly what that user may do. No SQL here, ever.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { actorFromToken, type Actor } from '../src/auth';
import { closeDb } from '../src/data/db';
import { AppError } from '../src/services/errors';
import { addNote, findFreeRooms, getWeek, searchClasses } from '../src/services/schedule';

type Message = { jsonrpc: '2.0'; id?: number | string; method: string; params?: any };

// The lectures, read once when the server starts (Exercise 1).
const lectures: { number: number; title: string; topics: string }[] = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, 'lectures.json'), 'utf8'),
);

// A tool result: one text part, and whether the tool failed.
function textResult(id: Message['id'], text: string, isError: boolean) {
  return { jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: text }], isError: isError } };
}

const integer = (description: string) => ({ type: 'integer', description });
const string = (description: string) => ({ type: 'string', description });

// The tools this server offers. The description is what the model reads to choose.
export const tools = [
  {
    name: 'find_lecture',
    description: "Returns the title and topics of one lecture of the web development course, by its number.",
    inputSchema: { type: 'object', properties: { number: integer('Lecture number, 1 to 12') }, required: ['number'] },
  },
  {
    name: 'list_lectures',
    description: 'List the number and title of every course lecture. Use it when asked what the course covers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_my_week',
    description:
      "Returns the classes of one of the caller's plans for a week number (1-15): day, time, room, notes and whether a class is cancelled, for the plan's group, with odd/even weeks and start weeks applied, the same as the plan page.",
    inputSchema: {
      type: 'object',
      properties: { plan_id: integer('The id of a plan the caller owns or that is shared with them'), week: integer('Week of the semester, 1 to 15') },
      required: ['plan_id', 'week'],
    },
  },
  {
    name: 'search_classes',
    description: "Searches the timetable of one of the caller's plans by course abbreviation, room number or group, and returns the matching classes with day, time, room, groups and start week.",
    inputSchema: {
      type: 'object',
      properties: { plan_id: integer('The id of the plan'), query: string('Course, room or group, for example ПИ, 1211 or 222') },
      required: ['plan_id', 'query'],
    },
  },
  {
    name: 'find_free_rooms',
    description: "Lists the rooms from the timetable of one of the caller's plans that have no class on a given day and time range in a given week.",
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: integer('The id of the plan'),
        day: integer('1 = Monday ... 6 = Saturday'),
        from: string('Start time, HH:MM, for example 07:30'),
        to: string('End time, HH:MM, for example 10:15'),
        week: integer('Week of the semester, 1 to 15'),
      },
      required: ['plan_id', 'day', 'from', 'to', 'week'],
    },
  },
  {
    name: 'add_class_note',
    description: 'Adds a note to one class of a plan, such as "Отменено" (cancelled) or "mandatory lecture", that everyone who reads the plan then sees. Only the plan\'s owner or an admin.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: integer('The id of the class, as returned by get_my_week or search_classes'),
        week: integer('The week the note is for, 1 to 15; leave out for every week'),
        text: string('The note, 1 to 500 characters'),
      },
      required: ['entry_id', 'text'],
    },
  },
];

/** Runs a project tool as `actor`. A refusal from a service is a tool error the model can read. */
async function callService(id: Message['id'], run: () => Promise<unknown>) {
  try {
    return textResult(id, JSON.stringify(await run()), false);
  } catch (error) {
    if (error instanceof AppError) return textResult(id, error.message, true);
    console.error(error);
    return textResult(id, 'Нещо се обърка. Опитайте отново.', true);
  }
}

// Decide what to answer. Return the reply, or null to answer nothing.
export async function handle(msg: Message, actor: Actor | null) {
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'tu-sofia-schedule', version: '0.2.0' },
      },
    };
  }
  if (msg.method === 'notifications/initialized') {
    return null; // a notification: it has no id and gets no reply
  }
  if (msg.method === 'tools/list') {
    return { jsonrpc: '2.0', id: msg.id, result: { tools: tools } };
  }
  if (msg.method === 'tools/call') {
    const name = msg.params.name;
    const args = msg.params.arguments || {};
    if (name === 'find_lecture') {
      const lecture = lectures.find((l) => l.number === args.number);
      if (!lecture) {
        // The tool ran and failed: a normal result the model can read, marked isError.
        return textResult(msg.id, 'There is no lecture ' + args.number + '. The course has lectures 1 to 12.', true);
      }
      return textResult(msg.id, 'Lecture ' + lecture.number + ': ' + lecture.title + '. Topics: ' + lecture.topics, false);
    }
    if (name === 'list_lectures') {
      return textResult(msg.id, lectures.map((l) => l.number + '. ' + l.title).join('\n'), false);
    }
    if (name === 'get_my_week') {
      return callService(msg.id, () => getWeek(actor, Number(args.plan_id), Number(args.week)));
    }
    if (name === 'search_classes') {
      return callService(msg.id, () => searchClasses(actor, Number(args.plan_id), String(args.query ?? '')));
    }
    if (name === 'find_free_rooms') {
      const query = { day: Number(args.day), from: String(args.from ?? ''), to: String(args.to ?? ''), week: Number(args.week) };
      return callService(msg.id, () => findFreeRooms(actor, Number(args.plan_id), query));
    }
    if (name === 'add_class_note') {
      const note = { entryId: Number(args.entry_id), week: args.week == null ? null : Number(args.week), text: String(args.text ?? '') };
      return callService(msg.id, () => addNote(actor, note));
    }
    // A tool we never offered: the message itself is wrong, so it is a protocol error.
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Unknown tool: ' + name } };
  }
  if (msg.id !== undefined) {
    // Any other request we do not know.
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unknown method: ' + msg.method } };
  }
  return null;
}

// Print one reply as one line of JSON on stdout.
function send(reply: object) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}

if (import.meta.filename === process.argv[1]) {
  const lines = readline.createInterface({ input: process.stdin });
  lines.on('line', async (line) => {
    console.error('got: ' + line);
    let msg: Message;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    try {
      // Who is calling, checked through Better Auth on every message, like every HTTP request.
      const actor = await actorFromToken(process.env.MCP_TOKEN).catch((error) => {
        console.error('could not check MCP_TOKEN: ' + error.message);
        return null;
      });
      const reply = await handle(msg, actor);
      if (reply) send(reply);
    } catch (error) {
      console.error(error);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Internal error' } });
    }
  });
  lines.on('close', () => closeDb());
}
