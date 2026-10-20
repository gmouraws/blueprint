import Link from 'next/link';
export default function NotFound() {
  return <main className="standalone"><h1>Esta página não está aqui.</h1><p>O Blueprint agora tem uma única sala privada.</p><Link href="/">Voltar para a entrada →</Link></main>;
}
