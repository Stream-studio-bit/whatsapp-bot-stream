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
 * ⚠️ FONTE ÚNICA DE VERDADE para status de bloqueio
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
 * @property {Date|null} blockedAt - Data/hora do bloqueio (sincronizado com manualAttendanceCache)
 */

/**
 * 🔥 NOVA FUNÇÃO: Normaliza data para Date object
 * @param {Date|string|number} date - Data em qualquer formato
 * @returns {Date|null}
 */
function normalizeDate(date) {
  if (!date) return null;
  if (date instanceof Date) return date;
  
  try {
    const normalized = new Date(date);
    return isNaN(normalized.getTime()) ? null : normalized;
  } catch {
    return null;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Verifica se bloqueio expirou (1 hora)
 * @param {Date|string} blockedAt - Data do bloqueio
 * @returns {boolean} true se expirou (passou 1 hora)
 */
export function isBlockExpired(blockedAt) {
  if (!blockedAt) return true;
  
  const blockedDate = normalizeDate(blockedAt);
  if (!blockedDate) return true;
  
  const now = new Date();
  const diffMinutes = (now - blockedDate) / 1000 / 60;
  
  return diffMinutes > 60; // Expirou após 1 hora
}

/**
 * 🔥 MELHORADA: Salva ou atualiza dados do usuário
 * @param {string} jid - JID do WhatsApp
 * @param {Object} data - Dados para atualizar
 */
export function saveUser(jid, data = {}) {
  const phone = extractPhoneNumber(jid);
  const existing = userCache.get(phone);
  
  // 🔥 CORREÇÃO: Sincroniza blockedAt do manualAttendanceCache (fonte única de verdade)
  const manualAttendance = manualAttendanceCache.get(phone);
  const blockedAt = manualAttendance?.blockedAt 
    ? normalizeDate(manualAttendance.blockedAt)
    : null;
  
  const userData = {
    phone: phone,
    name: data.name || existing?.name || 'Cliente',
    firstInteraction: existing?.firstInteraction || new Date(),
    lastInteraction: new Date(),
    isNewLead: data.isNewLead !== undefined ? data.isNewLead : existing?.isNewLead || false,
    messageCount: (existing?.messageCount || 0) + 1,
    blockedAt: blockedAt // Sempre sincronizado com manualAttendanceCache
  };
  
  userCache.set(phone, userData);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `💾 Usuário salvo: ${userData.name} (${phone}) | Bloqueado: ${!!blockedAt}`);
  }
  
  return userData;
}

/**
 * 🔥 MELHORADA: Atualiza dados do usuário sem incrementar messageCount
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
  
  // 🔥 CORREÇÃO: Sincroniza blockedAt do manualAttendanceCache
  const manualAttendance = manualAttendanceCache.get(phone);
  const blockedAt = manualAttendance?.blockedAt 
    ? normalizeDate(manualAttendance.blockedAt)
    : null;
  
  const userData = {
    ...existing,
    ...data,
    // Garante que messageCount não seja sobrescrito acidentalmente
    messageCount: data.messageCount !== undefined ? data.messageCount : existing.messageCount,
    // Sempre sincroniza blockedAt com manualAttendanceCache (fonte única)
    blockedAt: blockedAt
  };
  
  userCache.set(phone, userData);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🔄 Usuário atualizado: ${userData.name} (${phone}) | Bloqueado: ${!!blockedAt}`);
  }
  
  return userData;
}

/**
 * 🔥 MELHORADA: Busca dados do usuário
 * @param {string} jid - JID do WhatsApp
 * @returns {UserData|null}
 */
export function getUser(jid) {
  const phone = extractPhoneNumber(jid);
  const user = userCache.get(phone);
  
  if (!user) return null;
  
  // 🔥 CORREÇÃO: SEMPRE sincroniza blockedAt do manualAttendanceCache (fonte única de verdade)
  const manualAttendance = manualAttendanceCache.get(phone);
  const blockedAt = manualAttendance?.blockedAt 
    ? normalizeDate(manualAttendance.blockedAt)
    : null;
  
  // Atualiza o objeto user com o blockedAt correto
  user.blockedAt = blockedAt;
  
  // 🔥 NOVO: Verifica se bloqueio expirou automaticamente
  if (blockedAt && isBlockExpired(blockedAt)) {
    // Desbloqueia automaticamente se passou 1 hora
    unblockBotForUser(jid);
    user.blockedAt = null;
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `⏰ Bloqueio expirado automaticamente para: ${phone}`);
    }
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
 * 🔥 MELHORADA: Bloqueia o bot para um usuário (atendimento manual assumido)
 * @param {string} jid - JID do WhatsApp
 */
export function blockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  const blockedAt = new Date();
  
  // 🔥 CORREÇÃO: manualAttendanceCache é a FONTE ÚNICA DE VERDADE
  manualAttendanceCache.set(phone, {
    blockedAt: blockedAt, // Date object, não string
    blockedBy: process.env.OWNER_NAME || 'Roberto'
  });
  
  // Atualiza userCache apenas para manter sincronizado (mas manualAttendanceCache é a fonte)
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = blockedAt;
    userCache.set(phone, user);
  }
  
  log('WARNING', `🚫 Bot bloqueado para: ${phone} (atendimento manual)`);
}

/**
 * 🔥 MELHORADA: Libera o bot para um usuário (volta para automático)
 * @param {string} jid - JID do WhatsApp
 */
export function unblockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  
  // 🔥 CORREÇÃO: Remove do manualAttendanceCache (fonte única)
  manualAttendanceCache.del(phone);
  
  // Sincroniza userCache
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = null;
    userCache.set(phone, user);
  }
  
  log('SUCCESS', `✅ Bot liberado para: ${phone} (automático novamente)`);
}

/**
 * 🔥 MELHORADA: Verifica se o bot está bloqueado para um usuário
 * @param {string} jid - JID do WhatsApp
 * @returns {boolean}
 */
export function isBotBlockedForUser(jid) {
  const phone = extractPhoneNumber(jid);
  
  // 🔥 CORREÇÃO: Verifica no manualAttendanceCache (fonte única)
  const manualAttendance = manualAttendanceCache.get(phone);
  
  if (!manualAttendance) {
    return false; // Não está bloqueado
  }
  
  // 🔥 NOVO: Verifica se bloqueio expirou
  if (isBlockExpired(manualAttendance.blockedAt)) {
    // Desbloqueia automaticamente
    unblockBotForUser(jid);
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `⏰ Bloqueio expirado e removido para: ${phone}`);
    }
    
    return false;
  }
  
  return true; // Está bloqueado e não expirou
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
 * 🔥 NOVA FUNÇÃO: Limpa bloqueios expirados (chamada periodicamente)
 * @returns {number} Quantidade de bloqueios removidos
 */
export function cleanExpiredBlocks() {
  const keys = manualAttendanceCache.keys();
  let cleaned = 0;
  
  keys.forEach(phone => {
    const attendance = manualAttendanceCache.get(phone);
    if (attendance && isBlockExpired(attendance.blockedAt)) {
      manualAttendanceCache.del(phone);
      
      // Sincroniza userCache
      const user = userCache.get(phone);
      if (user) {
        user.blockedAt = null;
        userCache.set(phone, user);
      }
      
      cleaned++;
      log('INFO', `🧹 Bloqueio expirado removido: ${phone}`);
    }
  });
  
  if (cleaned > 0) {
    log('SUCCESS', `✅ ${cleaned} bloqueio(s) expirado(s) removido(s)`);
  }
  
  return cleaned;
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
  let usersInManualAttendance = 0;
  
  allUsers.forEach(phone => {
    const user = userCache.get(phone);
    if (user.isNewLead) {
      newLeads++;
    } else {
      returningClients++;
    }
  });
  
  // 🔥 CORREÇÃO: Conta apenas bloqueios NÃO expirados
  const blockedKeys = manualAttendanceCache.keys();
  blockedKeys.forEach(phone => {
    const attendance = manualAttendanceCache.get(phone);
    if (attendance && !isBlockExpired(attendance.blockedAt)) {
      usersInManualAttendance++;
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
  return keys.map(key => {
    const user = userCache.get(key);
    
    // Sincroniza blockedAt
    const manualAttendance = manualAttendanceCache.get(key);
    if (manualAttendance?.blockedAt) {
      user.blockedAt = normalizeDate(manualAttendance.blockedAt);
    }
    
    return user;
  });
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

/**
 * 🔥 NOVA FUNÇÃO: Salva histórico de conversa (chamada pelo messageHandler)
 * Armazena mensagens trocadas em memória (pode evoluir para salvar em arquivo ou DB)
 * @param {string} jid - JID do WhatsApp
 * @param {string} message - Mensagem enviada ou recebida
 * @param {'in'|'out'} direction - Direção da mensagem
 */
export function saveConversationHistory(jid, message, direction = 'in') {
  const phone = extractPhoneNumber(jid);
  const key = `history_${phone}`;
  const existing = userCache.get(key) || [];
  const entry = {
    timestamp: new Date().toISOString(),
    direction,
    message
  };
  existing.push(entry);
  userCache.set(key, existing);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `💬 Histórico salvo para ${phone} (${direction}): ${message}`);
  }
}

/**
 * EXPORTAÇÃO FINAL
 */
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
  isBlockExpired,
  cleanExpiredBlocks,
  getStats,
  getAllUsers,
  clearUser,
  clearAllCache,
  exportData,
  printStats,
  saveConversationHistory
};
