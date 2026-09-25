/**
 * Tokenizer for the custom-script DSL. Produces a flat token list only — no
 * side effects, no evaluation. See `types.ts`'s header for why a textual
 * front-end exists at all (Hermetic Correspondence: the text is a direct
 * mirror of the AST `parser.ts` builds from these tokens, not a shortcut
 * around it).
 */

export type TokenKind =
  | "number"
  | "ident"
  | "("
  | ")"
  | "{"
  | "}"
  | "["
  | "]"
  | ","
  | "."
  | "+"
  | "-"
  | "*"
  | "/"
  | ">"
  | "<"
  | ">="
  | "<="
  | "=="
  | "!="
  | "="
  | "eof";

export interface Token {
  kind: TokenKind;
  text: string;
  value?: number;
  pos: number;
}

export class LexError extends Error {}

const SINGLE_CHAR: Record<string, TokenKind> = {
  "(": "(",
  ")": ")",
  "{": "{",
  "}": "}",
  "[": "[",
  "]": "]",
  ",": ",",
  ".": ".",
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
};

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }

    if (c === "#") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      while (i < n && isDigit(source[i])) i++;
      if (source[i] === ".") {
        i++;
        while (i < n && isDigit(source[i])) i++;
      }
      const text = source.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new LexError(`Invalid number at position ${start}`);
      tokens.push({ kind: "number", text, value, pos: start });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(source[i])) i++;
      tokens.push({ kind: "ident", text: source.slice(start, i), pos: start });
      continue;
    }

    if (c === ">" && source[i + 1] === "=") {
      tokens.push({ kind: ">=", text: ">=", pos: i });
      i += 2;
      continue;
    }
    if (c === "<" && source[i + 1] === "=") {
      tokens.push({ kind: "<=", text: "<=", pos: i });
      i += 2;
      continue;
    }
    if (c === "=" && source[i + 1] === "=") {
      tokens.push({ kind: "==", text: "==", pos: i });
      i += 2;
      continue;
    }
    if (c === "!" && source[i + 1] === "=") {
      tokens.push({ kind: "!=", text: "!=", pos: i });
      i += 2;
      continue;
    }
    if (c === ">") {
      tokens.push({ kind: ">", text: ">", pos: i });
      i++;
      continue;
    }
    if (c === "<") {
      tokens.push({ kind: "<", text: "<", pos: i });
      i++;
      continue;
    }
    if (c === "=") {
      tokens.push({ kind: "=", text: "=", pos: i });
      i++;
      continue;
    }

    const single = SINGLE_CHAR[c];
    if (single) {
      tokens.push({ kind: single, text: c, pos: i });
      i++;
      continue;
    }

    throw new LexError(`Unexpected character '${c}' at position ${i}`);
  }

  tokens.push({ kind: "eof", text: "", pos: n });
  return tokens;
}
