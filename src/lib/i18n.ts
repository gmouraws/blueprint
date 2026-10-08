export type Locale = 'en' | 'pt-BR';
export const sections = ['builds', 'experiments', 'notes'] as const;
export type Section = typeof sections[number];
export function pathFor(locale: Locale, path = '') {
  return `${locale === 'pt-BR' ? '/pt' : ''}${path ? `/${path}` : ''}` || '/';
}
export const words = {
  en: {
    evidence: 'Evidence', publicLink: 'Public link', authorStatement: 'Author statement',
    lab: 'Engineering Lab', tagline: 'Engineering ideas into working systems.',
    intro: 'A personal engineering lab for building software, exploring architecture, experimenting with AI-assisted development, and documenting engineering decisions.',
    home: 'Lab', builds: 'Builds', experiments: 'Experiments', notes: 'Notes', about: 'About',
    skip: 'Skip to content', nav: 'Main navigation', language: 'Change language',
    featured: 'Featured build', activity: 'Lab activity', read: 'Read the case study',
    onlyEnglish: 'Available in English', missing: 'This article is currently available only in English.',
    empty: 'No published entries yet.', back: 'Back to the lab', notFound: 'Page not found',
    notFoundText: 'This page is unavailable. Explore the lab to find published work.',
    updated: 'Updated', published: 'Published', translation: 'This translation needs review after a source update.',
    aboutText: 'Blueprint is a personal engineering lab by Guilherme Moura. It explores software, architecture, and AI-assisted development through original builds, experiments, and technical notes.',
    principle: 'Show the engineering, not the employment.',
    aboutDetail: 'The lab documents decisions, trade-offs, failures, and lessons behind working systems, with public supporting material when available. English is the source language; Brazilian Portuguese is a localized reading experience. AI assists the work, while direction and publication remain human decisions.',
    privacy: 'Privacy', privacyText: 'Production uses Vercel Web Analytics for aggregate usage insights. No advertising analytics, custom events, or public visitor counter are used. Metrics remain private in the Vercel dashboard. Query strings and fragments are removed before page views are sent.',
    descriptions: { builds: 'Engineering case studies: questions, decisions, trade-offs, and lessons from building systems.', experiments: 'Bounded questions, methods, and honest observations.', notes: 'Engineering ideas, repository practices, and decisions worth recording.' },
    statuses: { PLANNED: 'Planned', BUILDING: 'Building', LIVE: 'Live', ARCHIVED: 'Archived', RUNNING: 'Running', COMPLETED: 'Completed', FAILED: 'Failed' },
  },
  'pt-BR': {
    evidence: 'Evidências', publicLink: 'Link público', authorStatement: 'Relato do autor',
    lab: 'Laboratório de Engenharia', tagline: 'Transformando ideias de engenharia em sistemas funcionais.',
    intro: 'Um laboratório pessoal de engenharia para construir software, explorar arquitetura, experimentar com desenvolvimento assistido por IA e documentar decisões de engenharia.',
    home: 'Lab', builds: 'Builds', experiments: 'Experimentos', notes: 'Notas', about: 'Sobre',
    skip: 'Pular para o conteúdo', nav: 'Navegação principal', language: 'Mudar idioma',
    featured: 'Build em destaque', activity: 'Atividade do laboratório', read: 'Ler o estudo de caso',
    onlyEnglish: 'Disponível em inglês', missing: 'Este artigo está disponível apenas em inglês no momento.',
    empty: 'Ainda não há conteúdo publicado.', back: 'Voltar ao laboratório', notFound: 'Página não encontrada',
    notFoundText: 'Esta página não está disponível. Explore o laboratório para encontrar conteúdo publicado.',
    updated: 'Atualizado', published: 'Publicado', translation: 'Esta tradução precisa de revisão após uma atualização do original.',
    aboutText: 'Blueprint é um laboratório pessoal de engenharia de Guilherme Moura. Explora software, arquitetura e desenvolvimento assistido por IA por meio de builds originais, experimentos e notas técnicas.',
    principle: 'Mostrar a engenharia, não o emprego.',
    aboutDetail: 'O laboratório documenta decisões, trade-offs, falhas e aprendizados por trás de sistemas funcionais, com referências públicas quando disponíveis. O inglês é o idioma de origem; o português brasileiro oferece uma experiência de leitura localizada. A IA auxilia o trabalho, enquanto a direção e a publicação continuam sendo decisões humanas.',
    privacy: 'Privacidade', privacyText: 'Em produção, o site usa Vercel Web Analytics para obter informações agregadas de uso. Não utiliza analytics de publicidade, eventos personalizados ou contador público de visitantes. As métricas ficam privadas no dashboard da Vercel. Parâmetros de consulta e fragmentos são removidos antes do envio de visualizações de página.',
    descriptions: { builds: 'Estudos de caso de engenharia: perguntas, decisões, trade-offs e aprendizados ao construir sistemas.', experiments: 'Perguntas delimitadas, métodos e observações honestas.', notes: 'Ideias de engenharia, práticas de repositório e decisões que merecem registro.' },
    statuses: { PLANNED: 'Planejado', BUILDING: 'Em construção', LIVE: 'No ar', ARCHIVED: 'Arquivado', RUNNING: 'Em andamento', COMPLETED: 'Concluído', FAILED: 'Falhou' },
  },
};
