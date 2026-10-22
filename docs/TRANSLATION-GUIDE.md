# Language rules

Blueprint Room's public landing and private-access introduction support English and Brazilian Portuguese. English is the default for new public visitors; an explicit language selection is stored in the landing preference cookie. Authenticated room, owner and distribution controls remain Brazilian Portuguese. Code identifiers, code comments, tests and repository documentation are English. Keep product/platform names (Blueprint Room, LiveKit, Vercel, Chrome, Edge) unchanged. Use natural Portuguese labels for controls, errors and permissions.

Landing locales use validated `?lang=en` / `?lang=pt-BR` values and `blueprint_landing_language`; no /pt route tree, MDX registry or translation-revision workflow is introduced. These belonged to the previous website and are recoverable from Git history. Do not translate browser-owned capture/device pickers, whose language follows the browser/OS.
