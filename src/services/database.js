import NodeCache from 'node-cache';
import { daysDifference, log, extractPhoneNumber } from '../utils/helpers.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * CACHE DE USUÁRIOS
 * Armazena informações dos clientes em memória
 * stdTTL: 0 = sem expiração automática
 */
const userCache = new NodeCache({ 
  stdTTL: 0, 
  checkperiod: 600 // Verifica items expirados a cada 10 minutos
});

/**
 * CACHE DE BLOQUEIO DO BOT (atendimento manual)
 * Guarda quais usuários estão em atendimento manual
 */
const manualAttendanceCache = new NodeCache({ 
  stdTTL: 0 
});

/**
 * Estrutura de dados do usuário
 * @typedef {Object} UserData
 * @property {string} phone - Número do telefone
 * @property {string} name - Nome do usuário
 * @property {Date} firstInteraction - Data da primeira interação
 * @property {Date} lastInteraction - Data da última interação
 * @property {boolean} isNewLead - Se é um lead interessado no bot
 * @property {number} messageCount - Contador de mensagens
 * @property {Date|null} blockedAt - Data/hora do bloqueio (se em atendimento manual)
 */

/**
 * Salva ou atualiza dados do usuário
 * @param {string} jid - JID do WhatsApp
 * @param {Object} data - Dados para atualizar
 */
export function saveUser(jid, data = {}) {
  const phone = extractPhoneNumber(jid);
  const existing = userCache.get(phone);
  
  const userData = {
    phone: phone,
    name: data.name || existing?.name || 'Cliente',
    firstInteraction: existing?.firstInteraction || new Date(),
    lastInteraction: new Date(),
    isNewLead: data.isNewLead !== undefined ? data.isNewLead : existing?.isNewLead || false,
    messageCount: (existing?.messageCount || 0) + 1,
    blockedAt: data.blockedAt !== undefined ? data.blockedAt : existing?.blockedAt || null
  };
  
  userCache.set(phone, userData);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `💾 Usuário salvo: ${userData.name} (${phone})`);
  }
  
  return userData;
}

/**
 * 🔧 NOVA FUNÇÃO: Atualiza dados do usuário sem incrementar messageCount
 * @param {string} jid - JID do WhatsApp
 * @param {Object} data - Dados para atualizar
 * @returns {UserData|null}
 */
export function updateUser(jid, data = {}) {
  const phone = extractPhoneNumber(jid);
  const existing = userCache.get(phone);
  
  if (!existing) {
    log('WARNING', `⚠️ Tentativa de atualizar usuário inexistente: ${phone}`);
    return null;
  }
  
  const userData = {
    ...existing,
    ...data,
    // Garante que messageCount não seja sobrescrito acidentalmente
    messageCount: data.messageCount !== undefined ? data.messageCount : existing.messageCount
  };
  
  userCache.set(phone, userData);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🔄 Usuário atualizado: ${userData.name} (${phone})`);
  }
  
  return userData;
}

/**
 * Busca dados do usuário
 * @param {string} jid - JID do WhatsApp
 * @returns {UserData|null}
 */
export function getUser(jid) {
  const phone = extractPhoneNumber(jid);
  const user = userCache.get(phone);
  
  if (!user) return null;
  
  // 🔧 MELHORIA: Sincroniza blockedAt do cache de atendimento manual
  const manualAttendance = manualAttendanceCache.get(phone);
  if (manualAttendance?.blockedAt) {
    user.blockedAt = manualAttendance.blockedAt;
  }
  
  return user;
}

/**
 * Verifica se o usuário já interagiu antes
 * @param {string} jid - JID do WhatsApp
 * @returns {boolean}
 */
export function isExistingUser(jid) {
  const user = getUser(jid);
  return user !== null;
}

/**
 * Verifica se o usuário tem conversa em andamento (últimos 7 dias)
 * @param {string} jid - JID do WhatsApp
 * @returns {boolean}
 */
export function hasOngoingConversation(jid) {
  const user = getUser(jid);
  
  if (!user || !user.lastInteraction) {
    return false;
  }
  
  const timeoutDays = parseInt(process.env.CONVERSATION_TIMEOUT_DAYS) || 7;
  const daysSinceLastInteraction = daysDifference(new Date(), user.lastInteraction);
  
  return daysSinceLastInteraction <= timeoutDays;
}

/**
 * Marca usuário como novo lead (interessado no bot)
 * @param {string} jid - JID do WhatsApp
 * @param {string} name - Nome do usuário
 */
export function markAsNewLead(jid, name) {
  saveUser(jid, { 
    name: name,
    isNewLead: true 
  });
  
  log('SUCCESS', `🎯 Novo Lead identificado: ${name}`);
}

/**
 * Verifica se usuário é um lead novo
 * @param {string} jid - JID do WhatsApp
 * @returns {boolean}
 */
export function isLeadUser(jid) {
  const user = getUser(jid);
  return user?.isNewLead || false;
}

/**
 * CONTROLE DE ATENDIMENTO MANUAL
 */

/**
 * Bloqueia o bot para um usuário (atendimento manual assumido)
 * @param {string} jid - JID do WhatsApp
 */
export function blockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  const blockedAt = new Date();
  
  manualAttendanceCache.set(phone, {
    blockedAt: blockedAt,
    blockedBy: process.env.OWNER_NAME || 'Roberto'
  });
  
  // 🔧 MELHORIA: Sincroniza blockedAt no userCache também
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = blockedAt;
    userCache.set(phone, user);
  }
  
  log('WARNING', `🚫 Bot bloqueado para: ${phone} (atendimento manual)`);
}

/**
 * Libera o bot para um usuário (volta para automático)
 * @param {string} jid - JID do WhatsApp
 */
export function unblockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  manualAttendanceCache.del(phone);
  
  // 🔧 MELHORIA: Remove blockedAt do userCache também
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = null;
    userCache.set(phone, user);
  }
  
  log('SUCCESS', `✅ Bot liberado para: ${phone} (automático novamente)`);
}

/**
 * Verifica se o bot está bloqueado para um usuário
 * @param {string} jid - JID do WhatsApp
 * @returns {boolean}
 */
export function isBotBlockedForUser(jid) {
  const phone = extractPhoneNumber(jid);
  return manualAttendanceCache.has(phone);
}

/**
 * Lista todos os usuários bloqueados (em atendimento manual)
 * @returns {Array}
 */
export function getBlockedUsers() {
  const keys = manualAttendanceCache.keys();
  return keys.map(key => ({
    phone: key,
    ...manualAttendanceCache.get(key)
  }));
}

/**
 * ESTATÍSTICAS
 */

/**
 * Retorna estatísticas gerais
 * @returns {Object}
 */
export function getStats() {
  const allUsers = userCache.keys();
  const totalUsers = allUsers.length;
  
  let newLeads = 0;
  let returningClients = 0;
  let usersInManualAttendance = manualAttendanceCache.keys().length;
  
  allUsers.forEach(phone => {
    const user = userCache.get(phone);
    if (user.isNewLead) {
      newLeads++;
    } else {
      returningClients++;
    }
  });
  
  return {
    totalUsers,
    newLeads,
    returningClients,
    usersInManualAttendance
  };
}

/**
 * Lista todos os usuários
 * @returns {Array}
 */
export function getAllUsers() {
  const keys = userCache.keys();
  return keys.map(key => userCache.get(key));
}

/**
 * Limpa cache de um usuário específico
 * @param {string} jid - JID do WhatsApp
 */
export function clearUser(jid) {
  const phone = extractPhoneNumber(jid);
  userCache.del(phone);
  manualAttendanceCache.del(phone);
  
  log('INFO', `🗑️ Cache limpo para: ${phone}`);
}

/**
 * Limpa todo o cache
 */
export function clearAllCache() {
  userCache.flushAll();
  manualAttendanceCache.flushAll();
  
  log('WARNING', '🗑️ Todo o cache foi limpo!');
}

/**
 * Exporta dados para backup (JSON)
 * @returns {Object}
 */
export function exportData() {
  return {
    users: getAllUsers(),
    blockedUsers: getBlockedUsers(),
    stats: getStats(),
    exportedAt: new Date().toISOString()
  };
}

/**
 * Imprime estatísticas no console
 */
export function printStats() {
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

export default {
  saveUser,
  updateUser,
  getUser,
  isExistingUser,
  hasOngoingConversation,
  markAsNewLead,
  isLeadUser,
  blockBotForUser,
  unblockBotForUser,
  isBotBlockedForUser,
  getBlockedUsers,
  getStats,
  getAllUsers,
  clearUser,
  clearAllCache,
  exportData,
  printStats
};