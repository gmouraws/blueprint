export type LandingLocale = 'en' | 'pt-BR';
export const landingLocale = (value: unknown): LandingLocale | undefined => value === 'en' || value === 'pt-BR' ? value : undefined;
export const creatorLinks = { github: 'https://github.com/gmouraws', linkedin: 'https://www.linkedin.com/in/guilherme-moura16' };
export const landingCopy = {
  en: {
    admin: 'Private access', eyebrow: 'A BLUEPRINT EXPERIMENT', title: 'Screen sharing, built for private spaces.',
    description: 'An experimental real-time screen-sharing application with invitation-only sessions, access control, and Windows integration.',
    features: [['Real-time sharing', 'Screen and optional audio sharing for small groups.'], ['Private sessions', 'Invitation-based access control.'], ['Community workflow integration', 'Connects private screen-sharing sessions with existing communication workflows.'], ['Engineering experiment', 'Built as part of Blueprint, a personal software engineering lab.']],
    windows: 'Blueprint Room for Windows', desktop: 'A desktop companion for private screen-sharing sessions. Currently available to invited participants only.', distribution: 'Private distribution · No public downloads',
    disclaimer: 'Experimental software. Features and availability may change.', attribution: 'An experiment by Guilherme Moura', repository: 'Repository',
  },
  'pt-BR': {
    admin: 'Acesso privado', eyebrow: 'UM EXPERIMENTO BLUEPRINT', title: 'Compartilhamento de tela para espaços privados.',
    description: 'Uma aplicação experimental de compartilhamento de tela em tempo real, com sessões por convite, controle de acesso e integração com Windows.',
    features: [['Compartilhamento em tempo real', 'Tela e áudio opcional para pequenos grupos.'], ['Sessões privadas', 'Controle de acesso por convite.'], ['Integração com a comunidade', 'Conecta sessões privadas de compartilhamento de tela aos canais de comunicação existentes.'], ['Experimento de engenharia', 'Parte do Blueprint, um laboratório pessoal de engenharia de software.']],
    windows: 'Blueprint Room para Windows', desktop: 'Um aplicativo complementar para sessões privadas de compartilhamento de tela. Disponível apenas para participantes convidados.', distribution: 'Distribuição privada · Sem downloads públicos',
    disclaimer: 'Software experimental. Recursos e disponibilidade podem mudar.', attribution: 'Um experimento de Guilherme Moura', repository: 'Repositório',
  },
};
