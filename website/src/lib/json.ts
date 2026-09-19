export type DataResult =
  | { ok: true; value: Record<string, unknown>; count: number; empty: boolean }
  | { ok: false; message: string; from: number; to: number; line: number; column: number };

function lineColumn(text: string, pos: number) {
  const before = text.slice(0, pos);
  const line = before.split("\n").length;
  const column = pos - (before.lastIndexOf("\n") + 1) + 1;
  return { line, column };
}

function offsetOf(text: string, line: number, column: number) {
  let offset = 0;
  const lines = text.split("\n");
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
  return Math.min(text.length, offset + column - 1);
}

class SyntaxFailure {
  constructor(
    readonly message: string,
    readonly pos: number,
  ) {}
}

/**
 * Find where a JSON document first goes wrong.
 *
 * Browsers disagree on whether (and how) they report a position, so this
 * small recursive-descent checker gives every browser the same answer.
 *
 * This is only consulted after JSON.parse() has already rejected the text.
 */
function locateSyntaxError(text: string): { message: string; pos: number } | null {
  let position = 0;

  const whitespace = " \t\n\r";

  /**
   * Describe the character at the current position, or report that we've
   * reached the end of the input.
   */
  const found = (): string =>
    position >= text.length ? "the end of the data" : JSON.stringify(text[position]);

  /**
   * Stop parsing at the current position.
   */
  const fail = (message: string, pos = position): never => {
    throw new SyntaxFailure(message, pos);
  };

  /**
   * Consume any whitespace at the current position.
   */
  const skipWhitespace = (): void => {
    while (position < text.length && whitespace.includes(text[position])) {
      position++;
    }
  };

  /**
   * Parse a JSON string.
   *
   * This intentionally performs only the validation needed to locate the
   * syntax error. JSON.parse() remains responsible for full validation.
   */
  const parseString = (): void => {
    const start = position;

    // Skip the opening quote.
    position++;

    while (position < text.length) {
      const character = text[position];

      if (character === '"') {
        position++;
        return;
      }

      if (character === "\\") {
        // Skip the escaped character. Full escape validation is left to
        // JSON.parse().
        position += 2;
        continue;
      }

      if (character === "\n") {
        fail("Unterminated string", start);
      }

      position++;
    }

    fail("Unterminated string", start);
  };

  /**
   * Parse a JSON number.
   */
  const parseNumber = (): void => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(position));

    if (!match) {
      fail("Invalid number");
      // This return should be unreachable, but it satisfies TypeScript that match
      // after this is non-null.
      return;
    }

    position += match[0].length;
  };

  /**
   * Parse a JSON object.
   */
  const parseObject = (): void => {
    // Skip the opening brace.
    position++;
    skipWhitespace();

    // Empty object.
    if (text[position] === "}") {
      position++;
      return;
    }

    while (true) {
      skipWhitespace();

      if (text[position] !== '"') {
        fail(`Expected a property name in double quotes, found ${found()}`);
      }

      parseString();
      skipWhitespace();

      if (text[position] !== ":") {
        fail(`Expected ":" after the property name, found ${found()}`);
      }

      position++;
      parseValue();
      skipWhitespace();

      if (text[position] === ",") {
        position++;
        continue;
      }

      if (text[position] === "}") {
        position++;
        return;
      }

      fail(`Expected "," or "}", found ${found()}`);
    }
  };

  /**
   * Parse a JSON array.
   */
  const parseArray = (): void => {
    // Skip the opening bracket.
    position++;
    skipWhitespace();

    // Empty array.
    if (text[position] === "]") {
      position++;
      return;
    }

    while (true) {
      parseValue();
      skipWhitespace();

      if (text[position] === ",") {
        position++;
        continue;
      }

      if (text[position] === "]") {
        position++;
        return;
      }

      fail(`Expected "," or "]", found ${found()}`);
    }
  };

  /**
   * Parse any JSON value.
   */
  const parseValue = (): void => {
    skipWhitespace();

    const character = text[position];

    if (character === "{") {
      parseObject();
      return;
    }

    if (character === "[") {
      parseArray();
      return;
    }

    if (character === '"') {
      parseString();
      return;
    }

    if (character === "-" || (character >= "0" && character <= "9")) {
      parseNumber();
      return;
    }

    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, position)) {
        position += literal.length;
        return;
      }
    }

    fail(`Expected a value, found ${found()}`);
  };

  try {
    parseValue();
    skipWhitespace();

    if (position < text.length) {
      fail(`Unexpected ${found()} after the end of the value`);
    }

    return null;
  } catch (error) {
    if (error instanceof SyntaxFailure) {
      return {
        message: error.message,
        pos: error.pos,
      };
    }

    throw error;
  }
}

/**
 * Fallback for when locateSyntaxError finds nothing.
 *
 * Browsers word JSON syntax errors differently, so instead we
 * extract a position and normalize the message into a consistent format.
 */
function describeError(text: string, error: unknown): { message: string; pos: number } {
  const rawMessage = error instanceof Error ? error.message : String(error);

  const positionMatch = /position (\d+)/.exec(rawMessage);
  const lineColumnMatch = /line (\d+) column (\d+)/.exec(rawMessage);

  let position: number | undefined;

  if (lineColumnMatch !== null) {
    const line = Number(lineColumnMatch[1]);
    const column = Number(lineColumnMatch[2]);

    position = offsetOf(text, line, column);
  } else if (positionMatch !== null) {
    position = Number(positionMatch[1]);
  } else if (/end of (JSON|data)|unexpected end/i.test(rawMessage)) {
    position = text.length;
  }

  const message = rawMessage
    .replace(/^JSON\.parse:\s*/, "")
    .replace(/\s+in JSON at position \d+(?: \(line \d+ column \d+\))?/, "")
    .replace(/\s+at line \d+ column \d+ of the JSON data/, "")
    .replace(/,\s*".*"\s*is not valid JSON$/s, "")
    .replace(/^./, (character) => character.toUpperCase());

  const safePosition = Math.max(0, Math.min(text.length, position ?? 0));

  return {
    message,
    pos: safePosition,
  };
}

/**
 * Mirrors how `spall render --data` reads its file.
 *
 * The top level must be a plain object.
 */
export function parseData(text: string): DataResult {
  if (text.trim() === "") return { ok: true, value: {}, count: 0, empty: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const { message, pos } = locateSyntaxError(text) ?? describeError(text, error);
    const { line, column } = lineColumn(text, pos);
    // A zero-width range can't be underlined, so point to the last character at the very end.
    const from = pos >= text.length ? Math.max(0, text.length - 1) : pos;
    return { ok: false, message, from, to: Math.min(text.length, from + 1), line, column };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const start = text.search(/\S/);
    const { line, column } = lineColumn(text, start);
    return {
      ok: false,
      message: "The top level must be a JSON object",
      from: start,
      to: Math.min(text.length, start + 1),
      line,
      column,
    };
  }

  const value = parsed as Record<string, unknown>;
  return { ok: true, value, count: Object.keys(value).length, empty: false };
}
