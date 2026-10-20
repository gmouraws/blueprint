'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="standalone"><h1>Não foi possível abrir a sala.</h1><p>Tente novamente em instantes.</p><button onClick={reset}>Tentar novamente</button></main>;
}
