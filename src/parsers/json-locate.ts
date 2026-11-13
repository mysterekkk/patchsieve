/**
 * Position-aware scan of an already-valid JSON document: for each requested top-level section object, maps
 * every direct key to the line it appears on. It tracks string state and container depth, so braces,
 * colons and quotes inside strings, compact one-line objects and duplicate keys (last one wins, like
 * JSON.parse) are all handled exactly. Input must have passed JSON.parse first.
 */
export function locateSectionKeys(text: string, sections: readonly string[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const s of sections) out.set(s, new Map());
  interface Frame {
    kind: 'obj' | 'arr';
    key?: string;
  }
  const stack: Frame[] = [];
  let line = 1;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i]!;
    if (c === '\n') {
      line++;
    } else if (c === '{') {
      stack.push({ kind: 'obj' });
    } else if (c === '[') {
      stack.push({ kind: 'arr' });
    } else if (c === '}' || c === ']') {
      stack.pop();
    } else if (c === '"') {
      const startLine = line;
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const raw = text.slice(i + 1, j);
      let k = j + 1;
      while (k < n && /\s/.test(text[k]!)) k++;
      const top = stack[stack.length - 1];
      if (top?.kind === 'obj' && text[k] === ':') {
        let key: string;
        try {
          key = JSON.parse(`"${raw}"`) as string;
        } catch {
          key = raw;
        }
        top.key = key;
        if (stack.length === 2 && stack[1] === top) {
          const sectionMap = out.get(stack[0]!.key ?? '');
          if (sectionMap) sectionMap.set(key, startLine);
        }
      }
      i = j; // string content never contains structural characters we care about
    }
  }
  return out;
}
