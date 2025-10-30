// clean.js - Script de limpeza total
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧹 LIMPANDO TUDO...\n');

// 1. Remove pasta de autenticação (sessão do WhatsApp)
const authPath = path.join(__dirname, 'auth_info');
if (fs.existsSync(authPath)) {
  fs.rmSync(authPath, { recursive: true, force: true });
  console.log('✅ Sessão do WhatsApp removida');
} else {
  console.log('ℹ️  Sessão não encontrada (ok)');
}

// 2. Remove node_modules/.cache (cache do Baileys)
const cachePath = path.join(__dirname, 'node_modules/.cache');
if (fs.existsSync(cachePath)) {
  fs.rmSync(cachePath, { recursive: true, force: true });
  console.log('✅ Cache do Baileys removido');
}

console.log('\n🎉 LIMPEZA CONCLUÍDA!');
console.log('📱 Próximo passo: Escanear QR Code novamente\n');