import type { RawFinding, RuleContext } from '../core/types.ts';
import type ts from 'typescript';
import { pos } from '../parsers/typescript.ts';

export function at(sf: ts.SourceFile, node: ts.Node, message: string, reason: string, extra: Partial<RawFinding> = {}): RawFinding {
  const p = pos(sf, node);
  return { ...p, message, reason, anchor: node.getText(sf).replace(/\s+/g, ' ').slice(0, 120), ...extra };
}

export function requireTs(ctx: RuleContext): ts.SourceFile | undefined {
  return ctx.ts;
}
