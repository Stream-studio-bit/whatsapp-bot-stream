import { 
  extractPhoneNumber, 
  log,
  formatPhoneNumber,
  getTimestamp
} from '../utils/helpers.js';

import {
  getUser,
  getStats,
  getAllUsers,
  getBlockedUsers,
  isBotBlockedForUser,
  isBlockExpired,
  cleanExpiredBlocks,
  clearUser,
  clearAllCache,
  exportData
} from '../services/database.js';

import dotenv from 'dotenv';

dotenv.config();

/**
 * 🔥 ARQUIVO SIMPLIFICADO - COMANDOS ADMINISTRATIVOS
 * 
 * ⚠️ CRÍTICO: Este arquivo NUNCA acessa o socket
 * 🔥 DIRETRIZ 1: Apenas funções auxiliares para gerenciamento
 * 🔥 DIRETRIZ 3: Isolamento total - apenas consulta database.js
 * 
 * A lógica principal de comandos (/assumir e /liberar) está no messageHandler.js
 */

/**
 * ============================================
 * FUNÇÕES DE ESTATÍSTICAS E MONITORAMENTO
 * ============================================
 */

/**
 * Mostra estatísticas do bot no console
 */
export function showStats() {
  const stats = getStats();
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  console.log(`\n📊 ╔═══════════════════════════════════════════╗`);
  console.log(`📊 ESTATÍSTICAS DO BOT [${timestamp}]`);
  console.log(`📊 ╚═══════════════════════════════════════════╝`);
  console.log(`👥 Total de usuários: ${stats.totalUsers}`);
  console.log(`🎯 Novos leads: ${stats.newLeads}`);
  console.log(`🔄 Clientes recorrentes: ${stats.returningClients}`);
  console.log(`🚫 Em atendimento manual: ${stats.usersInManualAttendance}`);
  console.log(`📊 ╚═══════════════════════════════════════════╝\n`);
}

/**
 * 🔥 CORRIGIDA: Lista todos os usuários bloqueados (em atendimento manual)
 * 🔥 DIRETRIZ 5: Mostra tempo restante até expiração
 */
export async function listBlockedUsers() {
  const blocked = getBlockedUsers();
  
  if (blocked.length === 0) {
    console.log('\n✅ Nenhum usuário em atendimento manual no momento.\n');
    return;
  }
  
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  console.log(`\n🚫 ╔═══════════════════════════════════════════╗`);
  console.log(`🚫 USUÁRIOS EM ATENDIMENTO MANUAL [${timestamp}]`);
  console.log(`🚫 ╚═══════════════════════════════════════════╝`);
  
  for (const [index, user] of blocked.entries()) {
    const blockedTime = new Date(user.blockedAt).toLocaleString('pt-BR');
    const phone = formatPhoneNumber(user.phone);
    const blockedBy = user.blockedBy || 'Sistema';
    
    // Calcula tempo desde o bloqueio
    const now = new Date();
    const blockedDate = new Date(user.blockedAt);
    const diffMinutes = Math.floor((now - blockedDate) / 1000 / 60);
    
    const timeStr = diffMinutes < 60 
      ? `${diffMinutes} minuto${diffMinutes !== 1 ? 's' : ''}`
      : `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}min`;
    
    // 🔥 DIRETRIZ 5: Calcula tempo restante até expiração (1h)
    const remainingMinutes = 60 - diffMinutes;
    const willExpireSoon = remainingMinutes <= 10 && remainingMinutes > 0;
    const expired = remainingMinutes <= 0;
    
    let expiredWarning = '';
    if (expired) {
      expiredWarning = ' ⚠️ EXPIRADO (será removido no próximo cleanup)';
    } else if (willExpireSoon) {
      expiredWarning = ` ⚠️ EXPIRA EM ${remainingMinutes} MIN`;
    }
    
    console.log(`${index + 1}. ${phone}`);
    console.log(`   Bloqueado há: ${timeStr}${expiredWarning}`);
    console.log(`   Bloqueado por: ${blockedBy}`);
    console.log(`   Data/Hora: ${blockedTime}`);
    console.log('');
  }
  
  console.log(`🚫 ╚═══════════════════════════════════════════╝\n`);
}

/**
 * 🔥 CORRIGIDA: Lista todos os usuários cadastrados
 */
export async function listAllUsers() {
  const users = getAllUsers();
  
  if (users.length === 0) {
    console.log('\n❌ Nenhum usuário cadastrado ainda.\n');
    return;
  }
  
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  console.log(`\n👥 ╔═══════════════════════════════════════════╗`);
  console.log(`👥 TODOS OS USUÁRIOS [${timestamp}]`);
  console.log(`👥 ╚═══════════════════════════════════════════╝`);
  
  for (const [index, user] of users.entries()) {
    const type = user.isNewLead ? '🎯 LEAD' : '🔄 CLIENTE';
    const lastMsg = new Date(user.lastInteraction).toLocaleString('pt-BR');
    const phone = formatPhoneNumber(user.phone);
    const blocked = user.blockedAt ? '🚫 (BLOQUEADO)' : '';
    
    console.log(`${index + 1}. ${type} - ${user.name} ${blocked}`);
    console.log(`   Telefone: ${phone}`);
    console.log(`   Última mensagem: ${lastMsg}`);
    console.log(`   Total de mensagens: ${user.messageCount}`);
    
    if (user.blockedAt) {
      const blockedTime = new Date(user.blockedAt).toLocaleString('pt-BR');
      const now = new Date();
      const blockedDate = new Date(user.blockedAt);
      const diffMinutes = Math.floor((now - blockedDate) / 1000 / 60);
      const remainingMinutes = 60 - diffMinutes;
      
      console.log(`   Bloqueado em: ${blockedTime}`);
      
      if (remainingMinutes > 0) {
        console.log(`   ⏰ Expira em: ${remainingMinutes} minutos`);
      } else {
        console.log(`   ⚠️ Bloqueio EXPIRADO`);
      }
    }
    
    console.log('');
  }
  
  console.log(`👥 ╚═══════════════════════════════════════════╝\n`);
}

/**
 * 🔥 CORRIGIDA: Mostra detalhes de um usuário específico
 * 🔥 DIRETRIZ 3: Usa isBotBlockedForUser() com await
 * @param {string} phone - Número do telefone (com ou sem formatação)
 */
export async function showUserDetails(phone) {
  // Limpa o número para buscar
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Busca o usuário
  const jid = `${cleanPhone}@s.whatsapp.net`;
  const user = getUser(jid);
  
  if (!user) {
    console.log(`\n❌ Usuário não encontrado: ${phone}\n`);
    return;
  }
  
  // 🔥 CORREÇÃO: isBotBlockedForUser() agora é async
  const isBlocked = await isBotBlockedForUser(jid);
  const formattedPhone = formatPhoneNumber(user.phone);
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  console.log(`\n👤 ╔═══════════════════════════════════════════╗`);
  console.log(`👤 DETALHES DO USUÁRIO [${timestamp}]`);
  console.log(`👤 ╚═══════════════════════════════════════════╝`);
  console.log(`Nome: ${user.name}`);
  console.log(`Telefone: ${formattedPhone}`);
  console.log(`Tipo: ${user.isNewLead ? '🎯 Lead' : '🔄 Cliente'}`);
  console.log(`Status: ${isBlocked ? '🚫 Bloqueado (Atendimento Manual)' : '🤖 Bot Ativo'}`);
  console.log(`Total de mensagens: ${user.messageCount}`);
  console.log(`Primeira interação: ${new Date(user.firstInteraction).toLocaleString('pt-BR')}`);
  console.log(`Última interação: ${new Date(user.lastInteraction).toLocaleString('pt-BR')}`);
  
  if (user.blockedAt) {
    const blockedTime = new Date(user.blockedAt).toLocaleString('pt-BR');
    const now = new Date();
    const blockedDate = new Date(user.blockedAt);
    const diffMinutes = Math.floor((now - blockedDate) / 1000 / 60);
    const timeStr = diffMinutes < 60 
      ? `${diffMinutes} minuto${diffMinutes !== 1 ? 's' : ''}`
      : `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}min`;
    
    console.log(`Bloqueado em: ${blockedTime}`);
    console.log(`Bloqueado há: ${timeStr}`);
    
    // 🔥 DIRETRIZ 5: Mostra status de expiração
    if (isBlockExpired(user.blockedAt)) {
      console.log(`⚠️ BLOQUEIO EXPIRADO - Será liberado na próxima mensagem ou cleanup`);
    } else {
      const remainingMinutes = 60 - diffMinutes;
      console.log(`⏰ Expira em: ${remainingMinutes} minutos`);
    }
  }
  
  console.log(`👤 ╚═══════════════════════════════════════════╝\n`);
}

/**
 * 🔥 CORRIGIDA: Limpa bloqueios expirados manualmente
 * 🔥 DIRETRIZ 5: cleanExpiredBlocks() agora é async
 * 🔥 DIRETRIZ 7: Logs descritivos
 */
export async function cleanupExpiredBlocks() {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  console.log(`\n🧹 [${timestamp}] Limpando bloqueios expirados...\n`);
  
  // 🔥 CORREÇÃO: cleanExpiredBlocks() agora retorna Promise
  const cleaned = await cleanExpiredBlocks();
  
  if (cleaned > 0) {
    console.log(`✅ ${cleaned} bloqueio(s) expirado(s) removido(s)!\n`);
    log('SUCCESS', `🧹 Cleanup manual: ${cleaned} bloqueio(s) removido(s)`);
  } else {
    console.log(`ℹ️ Nenhum bloqueio expirado encontrado.\n`);
  }
  
  return cleaned;
}

/**
 * 🔥 CORRIGIDA: Exporta dados para backup
 * @param {string} filename - Nome do arquivo (opcional)
 */
export async function backupData(filename = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFilename = `bot-backup-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;
  
  try {
    const data = exportData();
    const jsonData = JSON.stringify(data, null, 2);
    
    // Aqui você pode salvar em arquivo se tiver acesso ao fs
    // Por enquanto, apenas retorna os dados
    const displayTime = new Date().toLocaleTimeString('pt-BR');
    
    console.log(`\n💾 ╔═══════════════════════════════════════════╗`);
    console.log(`💾 BACKUP DOS DADOS [${displayTime}]`);
    console.log(`💾 ╚═══════════════════════════════════════════╝`);
    console.log(`Total de usuários: ${data.users.length}`);
    console.log(`Usuários bloqueados: ${data.blockedUsers.length}`);
    console.log(`Exportado em: ${data.exportedAt}`);
    console.log(`Arquivo sugerido: ${finalFilename}`);
    console.log(`💾 ╚═══════════════════════════════════════════╝\n`);
    
    log('SUCCESS', `✅ Backup criado com sucesso! (${data.users.length} usuários)`);
    
    return data;
  } catch (error) {
    // 🔥 DIRETRIZ 7: Log não bloqueante
    log('WARNING', `⚠️ Erro ao criar backup: ${error.message}`);
    return null;
  }
}

/**
 * 🔥 CORRIGIDA: Limpa cache de usuário específico
 * @param {string} phone - Número do telefone
 */
export async function removeUser(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  const user = getUser(jid);
  if (!user) {
    console.log(`\n❌ Usuário não encontrado: ${phone}\n`);
    return false;
  }
  
  console.log(`\n🗑️ [${timestamp}] Removendo usuário: ${user.name} (${formatPhoneNumber(cleanPhone)})\n`);
  
  // 🔥 DIRETRIZ 3: clearUser só manipula cache, não toca no socket
  clearUser(jid);
  
  console.log(`✅ Usuário removido com sucesso!\n`);
  log('INFO', `🗑️ Usuário removido: ${user.name} (${cleanPhone})`);
  
  return true;
}

/**
 * 🔥 CORRIGIDA: Reseta todo o sistema (CUIDADO!)
 * 🔥 DIRETRIZ 7: Não interrompe processo, apenas limpa cache
 */
export async function resetSystem() {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  console.log(`\n⚠️ ═══════════════════════════════════════════`);
  console.log(`⚠️ ATENÇÃO: RESETANDO TODO O SISTEMA [${timestamp}]`);
  console.log(`⚠️ ═══════════════════════════════════════════\n`);
  
  // Faz backup antes de limpar
  console.log(`📦 Criando backup de segurança...\n`);
  const backup = await backupData();
  
  // 🔥 DIRETRIZ 3: clearAllCache só limpa NodeCache, não toca no socket
  clearAllCache();
  
  console.log(`✅ Sistema resetado com sucesso!`);
  console.log(`💾 Backup disponível caso necessário.`);
  console.log(`⚠️ ═══════════════════════════════════════════\n`);
  
  log('WARNING', `🔄 Sistema resetado (backup criado)`);
  
  return backup;
}

/**
 * 🔥 CORRIGIDA: Mostra resumo rápido do sistema
 */
export async function quickStatus() {
  const stats = getStats();
  const blocked = getBlockedUsers();
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  console.log(`\n⚡ ═══════════════════════════════════════════`);
  console.log(`⚡ STATUS RÁPIDO DO BOT [${timestamp}]`);
  console.log(`⚡ ═══════════════════════════════════════════`);
  console.log(`👥 ${stats.totalUsers} usuários | 🎯 ${stats.newLeads} leads | 🔄 ${stats.returningClients} clientes`);
  console.log(`🚫 ${stats.usersInManualAttendance} em atendimento manual`);
  
  if (blocked.length > 0) {
    console.log(`\n🚫 Usuários bloqueados:`);
    blocked.forEach((user, index) => {
      const phone = formatPhoneNumber(user.phone);
      const now = new Date();
      const blockedDate = new Date(user.blockedAt);
      const diffMinutes = Math.floor((now - blockedDate) / 1000 / 60);
      const remainingMinutes = 60 - diffMinutes;
      
      const timeStr = diffMinutes < 60 ? `${diffMinutes}min` : `${Math.floor(diffMinutes / 60)}h`;
      const expireStr = remainingMinutes > 0 ? ` (expira em ${remainingMinutes}min)` : ' (EXPIRADO)';
      
      console.log(`   ${index + 1}. ${phone} - há ${timeStr}${expireStr}`);
    });
  }
  
  console.log(`⚡ ═══════════════════════════════════════════\n`);
}

/**
 * 🔥 NOVA FUNÇÃO: Menu de ajuda para comandos administrativos
 */
export function showHelpMenu() {
  console.log(`\n📖 ╔═══════════════════════════════════════════╗`);
  console.log(`📖 COMANDOS ADMINISTRATIVOS DISPONÍVEIS`);
  console.log(`📖 ╚═══════════════════════════════════════════╝\n`);
  
  console.log(`🔧 GERENCIAMENTO:`);
  console.log(`   showStats()              - Mostra estatísticas completas`);
  console.log(`   quickStatus()            - Status rápido do sistema`);
  console.log(`   listBlockedUsers()       - Lista usuários bloqueados`);
  console.log(`   listAllUsers()           - Lista todos os usuários`);
  console.log(`   showUserDetails(phone)   - Detalhes de um usuário específico`);
  console.log(``);
  
  console.log(`🧹 LIMPEZA:`);
  console.log(`   cleanupExpiredBlocks()   - Remove bloqueios expirados`);
  console.log(`   removeUser(phone)        - Remove usuário específico`);
  console.log(`   resetSystem()            - Reseta todo o sistema (⚠️ cuidado!)`);
  console.log(``);
  
  console.log(`💾 BACKUP:`);
  console.log(`   backupData(filename)     - Exporta dados para backup`);
  console.log(``);
  
  console.log(`ℹ️ INFORMAÇÕES:`);
  console.log(`   showHelpMenu()           - Mostra este menu`);
  console.log(``);
  
  console.log(`📖 ╚═══════════════════════════════════════════╝\n`);
  console.log(`💡 Dica: Todas as funções agora são assíncronas (use await)`);
  console.log(`💡 Exemplo: await listBlockedUsers()`);
  console.log(`💡 Debug: process.env.DEBUG_MODE = "true" para logs detalhados\n`);
}

/**
 * ============================================
 * 🔥 EXPORTAÇÃO FINAL
 * ============================================
 */

// Exporta todas as funções
export default {
  showStats,
  listBlockedUsers,
  listAllUsers,
  showUserDetails,
  cleanupExpiredBlocks,
  backupData,
  removeUser,
  resetSystem,
  quickStatus,
  showHelpMenu
};