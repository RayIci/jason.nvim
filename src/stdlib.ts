// Documentation of Jason's internal actions, extracted from the @Manual
// annotations in the Jason jar (npm run stdlib).

import entries from './stdlib.json' with { type: 'json' };

export interface InternalAction {
  name: string;
  literal?: string;
  hint?: string;
  argsHint?: string[];
  argsType?: string[];
  examples?: string[];
  seeAlso?: string[];
}

export const stdlib: InternalAction[] = entries;

const byName = new Map(stdlib.map(e => [e.name, e]));

export function internalAction(name: string): InternalAction | undefined {
  return byName.get(name);
}

/** Markdown documentation for hover and completion. */
export function documentation(ia: InternalAction): string {
  const parts = ['```jason', ia.literal || ia.name, '```'];
  if (ia.hint) {
    parts.push(ia.hint.charAt(0).toUpperCase() + ia.hint.slice(1));
  }
  const names = /\(([^)]*)\)/.exec(ia.literal ?? '')?.[1]
    .replace(/[[\]]/g, '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean) ?? [];
  if (ia.argsHint?.length) {
    parts.push(
      ia.argsHint
        .map((h, i) => {
          const type = ia.argsType?.[i] ? ` (${ia.argsType[i]})` : '';
          return `- \`${names[i] ?? `arg${i}`}\`${type}: ${h}`;
        })
        .join('\n'),
    );
  }
  if (ia.examples?.length) {
    parts.push('Examples:\n' + ia.examples.map(e => `- \`${e.replace(/:\s.*$/s, '')}\`${/:\s/.test(e) ? ': ' + e.replace(/^[^:]*:\s*/s, '') : ''}`).join('\n'));
  }
  return parts.join('\n\n');
}
