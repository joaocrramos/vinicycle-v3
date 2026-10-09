// Armazenamento de arquivos (P15). Interface no formato de objeto do S3 (chave → conteúdo), com
// implementação em disco para o início; o MinIO entra depois sem mudar quem usa
// (ANDAMENTO.md, Pendências de infraestrutura, item 4).
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

export interface Armazenamento {
  gravar(chave: string, conteudo: Buffer): Promise<void>;
  ler(chave: string): Promise<Readable>;
  existe(chave: string): Promise<boolean>;
}

const CHAVE_VALIDA = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i;

export function armazenamentoEmDisco(raiz: string): Armazenamento {
  const base = path.resolve(raiz);
  const resolver = (chave: string) => {
    if (!CHAVE_VALIDA.test(chave)) throw new Error(`Chave de arquivo inválida: ${chave}`);
    return path.join(base, chave);
  };
  return {
    async gravar(chave, conteudo) {
      const destino = resolver(chave);
      await mkdir(path.dirname(destino), { recursive: true });
      // Grava num arquivo temporário e renomeia: nunca fica arquivo pela metade.
      const temporario = `${destino}.parcial`;
      await writeFile(temporario, conteudo, { flag: 'wx' });
      await rename(temporario, destino);
    },
    async ler(chave) {
      const origem = resolver(chave);
      await stat(origem);
      return createReadStream(origem);
    },
    async existe(chave) {
      try {
        await stat(resolver(chave));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Caminho previsível: empresa/estabelecimento/entidade/registro/arquivo (P15). */
export function chaveAnexo(d: {
  empresaId: string;
  estabelecimentoId: string | null;
  entidade: string;
  registroId: string;
  anexoId: string;
}): string {
  return [d.empresaId, d.estabelecimentoId ?? 'empresa', d.entidade, d.registroId, d.anexoId].join(
    '/',
  );
}
