// Aplica as migrações com o papel dono do esquema (P6).
import { migrar } from '../db/migrar'

const url = process.env.DATABASE_URL_DONO
if (!url) throw new Error('Defina DATABASE_URL_DONO')
await migrar(url)
console.log('Migrações aplicadas.')
