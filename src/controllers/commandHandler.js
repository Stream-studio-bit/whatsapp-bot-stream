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
 * 🔥 ARQUIVO SIMPLIFICADO
 * 
 * Este arquivo agora contém apenas funções auxiliares para gerenciamento
 * e monitoramento do bot. A lógica principal de comandos está no messageHandler.js
 */

/**
 * FUNÇÕES DE ESTATÍSTICAS E MONITORAMENTO
 */

/**
 * Mostra estatísticas do bot no console
 */
export function showStats() {
  const stats = getStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS DO BOT');
  console.log('📊 ╚═══════════════════════════════════════════╝');
  console.log(`👥 Total de usuários: ${stats.totalUsers}`);
  console.log(`🎯 Novos leads: ${stats.newLeads}`);
  console.log(`🔄 Clientes recorrentes: ${stats.returningClients}`);
  console.log(`🚫 Em atendimento manual: ${stats.usersInManualAttendance}`);
  console.log('📊 ╚═══════════════════════════════════════════╝\n');
}

/**
 * Lista todos os usuários bloqueados (em atendimento manual)
 */
export function listBlockedUsers() {
  const blocked = getBlockedUsers();
  
  if (blocked.length === 0) {
    console.log('\n✅ Nenhum usuário em atendimento manual no momento.\n');
    return;
  }
  
  console.log('\n🚫 ╔═══════════════════════════════════════════╗');
  console.log('🚫 USUÁRIOS EM ATENDIMENTO MANUAL');
  console.log('🚫 ╚═══════════════════════════════════════════╝');
  
  blocked.forEach((user, index) => {
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
    
    // Verifica se está próximo de expirar
    const willExpireSoon = diffMinutes > 50 && diffMinutes < 60;
    const expiredWarning = willExpireSoon ? ' ⚠️ EXPIRA EM BREVE' : '';
    
    console.log(`${index + 1}. ${phone}`);
    console.log(`   Bloqueado há: ${timeStr}${expiredWarning}`);
    console.log(`   Bloqueado por: ${blockedBy}`);
    console.log(`   Data/Hora: ${blockedTime}`);
    console.log('');
  });
  
  console.log('🚫 ╚═══════════════════════════════════════════╝\n');
}

/**
 * Lista todos os usuários cadastrados
 */
export function listAllUsers() {
  const users = getAllUsers();
  
  if (users.length === 0) {
    console.log('\n❌ Nenhum usuário cadastrado ainda.\n');
    return;
  }
  
  console.log('\n👥 ╔═══════════════════════════════════════════╗');
  console.log('👥 TODOS OS USUÁRIOS');
  console.log('👥 ╚═══════════════════════════════════════════╝');
  
  users.forEach((user, index) => {
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
      console.log(`   Bloqueado em: ${blockedTime}`);
    }
    
    console.log('');
  });
  
  console.log('👥 ╚═══════════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVA FUNÇÃO: Mostra detalhes de um usuário específico
 * @param {string} phone - Número do telefone (com ou sem formatação)
 */
export function showUserDetails(phone) {
  // Limpa o número para buscar
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Busca o usuário
  const jid = `${cleanPhone}@s.whatsapp.net`;
  const user = getUser(jid);
  
  if (!user) {
    console.log(`\n❌ Usuário não encontrado: ${phone}\n`);
    return;
  }
  
  const isBlocked = isBotBlockedForUser(jid);
  const formattedPhone = formatPhoneNumber(user.phone);
  
  console.log('\n👤 ╔═══════════════════════════════════════════╗');
  console.log('👤 DETALHES DO USUÁRIO');
  console.log('👤 ╚═══════════════════════════════════════════╝');
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
    
    if (isBlockExpired(user.blockedAt)) {
      console.log(`⚠️ BLOQUEIO EXPIRADO - Será liberado na próxima mensagem`);
    } else {
      const remainingMinutes = 60 - diffMinutes;
      console.log(`⏰ Expira em: ${remainingMinutes} minutos`);
    }
  }
  
  console.log('👤 ╚═══════════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVA FUNÇÃO: Limpa bloqueios expirados manualmente
 */
export function cleanupExpiredBlocks() {
  console.log('\n🧹 Limpando bloqueios expirados...\n');
  const cleaned = cleanExpiredBlocks();
  
  if (cleaned > 0) {
    console.log(`✅ ${cleaned} bloqueio(s) expirado(s) removido(s)!\n`);
  } else {
    console.log(`ℹ️ Nenhum bloqueio expirado encontrado.\n`);
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Exporta dados para backup
 * @param {string} filename - Nome do arquivo (opcional)
 */
export function backupData(filename = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFilename = `bot-backup-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;
  
  try {
    const data = exportData();
    const jsonData = JSON.stringify(data, null, 2);
    
    // Aqui você pode salvar em arquivo se tiver acesso ao fs
    // Por enquanto, apenas retorna os dados
    console.log('\n💾 ╔═══════════════════════════════════════════╗');
    console.log('💾 BACKUP DOS DADOS');
    console.log('💾 ╚═══════════════════════════════════════════╝');
    console.log(`Total de usuários: ${data.users.length}`);
    console.log(`Usuários bloqueados: ${data.blockedUsers.length}`);
    console.log(`Exportado em: ${data.exportedAt}`);
    console.log('💾 ╚═══════════════════════════════════════════╝\n');
    
    log('SUCCESS', `✅ Backup criado com sucesso!`);
    
    return data;
  } catch (error) {
    log('ERROR', `❌ Erro ao criar backup: ${error.message}`);
    return null;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Limpa cache de usuário específico
 * @param {string} phone - Número do telefone
 */
export function removeUser(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;
  
  const user = getUser(jid);
  if (!user) {
    console.log(`\n❌ Usuário não encontrado: ${phone}\n`);
    return false;
  }
  
  console.log(`\n🗑️ Removendo usuário: ${user.name} (${formatPhoneNumber(cleanPhone)})\n`);
  clearUser(jid);
  console.log(`✅ Usuário removido com sucesso!\n`);
  
  return true;
}

/**
 * 🔥 NOVA FUNÇÃO: Reseta todo o sistema (CUIDADO!)
 */
export function resetSystem() {
  console.log('\n⚠️ ═══════════════════════════════════════════');
  console.log('⚠️ ATENÇÃO: RESETANDO TODO O SISTEMA');
  console.log('⚠️ ═══════════════════════════════════════════\n');
  
  // Faz backup antes de limpar
  console.log('📦 Criando backup de segurança...\n');
  const backup = backupData();
  
  // Limpa todo o cache
  clearAllCache();
  
  console.log('✅ Sistema resetado com sucesso!');
  console.log('💾 Backup disponível caso necessário.\n');
  
  return backup;
}

/**
 * 🔥 NOVA FUNÇÃO: Mostra resumo rápido do sistema
 */
export function quickStatus() {
  const stats = getStats();
  const blocked = getBlockedUsers();
  
  console.log('\n⚡ ═══════════════════════════════════════════');
  console.log('⚡ STATUS RÁPIDO DO BOT');
  console.log('⚡ ═══════════════════════════════════════════');
  console.log(`👥 ${stats.totalUsers} usuários | 🎯 ${stats.newLeads} leads | 🔄 ${stats.returningClients} clientes`);
  console.log(`🚫 ${stats.usersInManualAttendance} em atendimento manual`);
  
  if (blocked.length > 0) {
    console.log('\n🚫 Usuários bloqueados:');
    blocked.forEach((user, index) => {
      const phone = formatPhoneNumber(user.phone);
      const now = new Date();
      const blockedDate = new Date(user.blockedAt);
      const diffMinutes = Math.floor((now - blockedDate) / 1000 / 60);
      const timeStr = diffMinutes < 60 ? `${diffMinutes}min` : `${Math.floor(diffMinutes / 60)}h`;
      
      console.log(`   ${index + 1}. ${phone} (há ${timeStr})`);
    });
  }
  
  console.log('⚡ ═══════════════════════════════════════════\n');
}

/**
 * 🔥 NOVA FUNÇÃO: Menu de ajuda para comandos administrativos
 */
export function showHelpMenu() {
  console.log('\n📖 ╔═══════════════════════════════════════════╗');
  console.log('📖 COMANDOS ADMINISTRATIVOS DISPONÍVEIS');
  console.log('📖 ╚═══════════════════════════════════════════╝\n');
  
  console.log('🔧 GERENCIAMENTO:');
  console.log('   showStats()              - Mostra estatísticas completas');
  console.log('   quickStatus()            - Status rápido do sistema');
  console.log('   listBlockedUsers()       - Lista usuários bloqueados');
  console.log('   listAllUsers()           - Lista todos os usuários');
  console.log('   showUserDetails(phone)   - Detalhes de um usuário específico');
  console.log('');
  
  console.log('🧹 LIMPEZA:');
  console.log('   cleanupExpiredBlocks()   - Remove bloqueios expirados');
  console.log('   removeUser(phone)        - Remove usuário específico');
  console.log('   resetSystem()            - Reseta todo o sistema (⚠️ cuidado!)');
  console.log('');
  
  console.log('💾 BACKUP:');
  console.log('   backupData(filename)     - Exporta dados para backup');
  console.log('');
  
  console.log('ℹ️ INFORMAÇÕES:');
  console.log('   showHelpMenu()           - Mostra este menu');
  console.log('');
  
  console.log('📖 ╚═══════════════════════════════════════════╝\n');
  console.log('💡 Dica: Use process.env.DEBUG_MODE = "true" para logs detalhados\n');
}

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