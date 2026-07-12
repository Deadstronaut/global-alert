/**
 * Pure SSE (Server-Sent Events) chunk parser (spec 036 remaining item —
 * "canlı SSE bildirim akışı"). The community-reports-stream Edge Function
 * response is consumed via a raw fetch() + ReadableStream reader (not the
 * native EventSource API, which can't attach an Authorization header) — this
 * function turns the raw decoded text chunks the reader yields into parsed
 * event objects, buffering any incomplete trailing event across calls.
 */

// Pure — splits `buffer` on the SSE double-newline event delimiter, parses
// each complete event's `data:` line as JSON (skipping heartbeat/comment
// lines starting with `:`), and returns both the parsed events and
// whatever incomplete text remains for the next chunk to be appended to.
export function parseSseBuffer(buffer) {
  const events = [];
  const parts = buffer.split('\n\n');
  // The last part is either '' (buffer ended exactly on a boundary) or an
  // incomplete event — either way, it is not consumed yet.
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    const dataLine = part
      .split('\n')
      .find((line) => line.startsWith('data:'));
    if (!dataLine) continue; // heartbeat-only or event-type-only fragment
    const jsonText = dataLine.slice('data:'.length).trim();
    try {
      events.push(JSON.parse(jsonText));
    } catch {
      // Malformed event — skip rather than throw, so one bad event can't
      // kill the whole stream's processing loop.
    }
  }

  return { events, remainder };
}
