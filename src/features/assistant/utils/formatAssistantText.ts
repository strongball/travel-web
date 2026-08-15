const LATEX_SYMBOL_MAP: Record<string, string> = {
  // Arrows
  rightarrow: '→',
  to: '→',
  longrightarrow: '→',
  Rightarrow: '⇒',
  Longrightarrow: '⇒',
  rArr: '⇒',
  leftarrow: '←',
  gets: '←',
  longleftarrow: '←',
  Leftarrow: '⇐',
  Longleftarrow: '⇐',
  lArr: '⇐',
  leftrightarrow: '↔',
  longleftrightarrow: '↔',
  Leftrightarrow: '⇔',
  Longleftrightarrow: '⇔',
  iff: '⇔',
  uparrow: '↑',
  Uparrow: '⇑',
  downarrow: '↓',
  Downarrow: '⇓',
  nearrow: '↗',
  searrow: '↘',
  swarrow: '↙',
  nwarrow: '↖',
  mapsto: '↦',

  // Operators & comparisons
  times: '×',
  div: '÷',
  pm: '±',
  mp: '∓',
  cdot: '·',
  cdots: '…',
  dots: '…',
  ldots: '…',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  sim: '~',
  equiv: '≡',
  degree: '°',
  circ: '°',
  bullet: '•',
  checkmark: '✓',
  approxeq: '≈',
}

const LATEX_COMMAND_REGEX = /\\([a-zA-Z]+)/g

/**
 * Replace known LaTeX commands with their Unicode equivalent.
 */
function replaceLatexCommands(input: string): string {
  return input.replace(LATEX_COMMAND_REGEX, (match, command: string) => {
    return LATEX_SYMBOL_MAP[command] ?? match
  })
}

/**
 * Format markdown/text from assistant responses or proposals by converting
 * LaTeX math symbols (e.g. $\rightarrow$, $\to$, $\times$) into clean Unicode characters.
 */
export function formatAssistantText(content: string): string {
  if (!content) return ''

  let result = content

  // 1. Handle $$...$$ display math blocks containing LaTeX
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner: string) => {
    const cleaned = replaceLatexCommands(inner.replace(/\\text\{([^}]*)\}/g, '$1')).trim()
    // If it contains converted symbols or was a single command, strip the $$
    return cleaned
  })

  // 2. Handle $...$ inline math blocks (avoid matching standard currency like $100)
  result = result.replace(/\$([^$\n]+?)\$/g, (match, inner: string) => {
    // Check if inner contains any LaTeX command like \rightarrow or \to
    if (/\\([a-zA-Z]+)|\^\\circ|\^\{\\circ\}|\^\{?\\?circ\}?/.test(inner)) {
      let cleaned = inner.replace(/\\text\{([^}]*)\}/g, '$1')
      cleaned = cleaned.replace(/\^\\?circ|\^\{\\?circ\}/g, '°')
      cleaned = replaceLatexCommands(cleaned)
      return cleaned.trim()
    }
    return match
  })

  // 3. Handle degree notation like 25^\circ or 25^{\circ}
  result = result.replace(/\^\\?circ|\^\{\\?circ\}/g, '°')

  // 4. Handle standalone LaTeX symbol commands outside math mode (e.g. 台北 \rightarrow 九份)
  result = replaceLatexCommands(result)

  return result
}
