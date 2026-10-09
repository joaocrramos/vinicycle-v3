import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import './estilos.css';
import './i18n';
import { ErroApi } from './lib/api';
import { useSessao } from './lib/sessao';
import { aplicarTema, aplicarTemaSalvo, observarSistema } from './lib/tema';
import { rotas } from './rotas';

aplicarTemaSalvo();

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ErroApi && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** Aplica o tema e a paleta do usuário assim que a sessão carrega (P9). */
function Tema() {
  const { data } = useSessao();
  const prefs = data?.usuario.preferencias;
  useEffect(() => {
    if (prefs) aplicarTema(prefs);
    return observarSistema(() => prefs);
  }, [prefs]);
  return null;
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <Tema />
      <RouterProvider router={rotas} />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--superficie)',
            color: 'var(--texto)',
            border: '1px solid var(--borda)',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
