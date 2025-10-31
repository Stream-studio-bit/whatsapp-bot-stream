import NodeCache from 'node-cache';
import { daysDifference, log, extractPhoneNumber } from '../utils/helpers.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * CACHE DE USUÁRIOS
 */
const userCache = new NodeCache({ 
  stdTTL: 0, 
  checkperiod: 600
});

/**
 * 🔥 NORMALIZA DATA
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
 * 🔥 VERIFICA EXPIRAÇÃO: Bloqueio expira após 1 hora
 */
export function isBlockExpired(blockedAt) {
  if (!blockedAt) return true;
  
  const blockedDate = normalizeDate(blockedAt);
  if (!blockedDate) return true;
  
  const now = new Date();
  const diffMinutes = (now - blockedDate) / 1000 / 60;
  
  return diffMinutes > 60;
}

/**
 * 🔥 SALVA USUÁRIO
 */
export async function saveUser(jid, data = {}) {
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
 * 🔥 ATUALIZA USUÁRIO (sem incrementar messageCount)
 */
export async function updateUser(jid, data = {}) {
  const phone = extractPhoneNumber(jid);
  const existing = userCache.get(phone);
  
  if (!existing) {
    log('WARNING', `⚠️ Tentativa de atualizar usuário inexistente: ${phone}`);
    return null;
  }
  
  const userData = {
    ...existing,
    ...data,
    messageCount: data.messageCount !== undefined ? data.messageCount : existing.messageCount
  };
  
  userCache.set(phone, userData);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🔄 Usuário atualizado: ${userData.name} (${phone})`);
  }
  
  return userData;
}

/**
 * 🔥 BUSCA USUÁRIO
 * 🔥 DIRETRIZ 5: Verifica expiração automática
 */
export async function getUser(jid) {
  const phone = extractPhoneNumber(jid);
  const user = userCache.get(phone);
  
  if (!user) return null;
  
  // 🔥 Verifica expiração automática
  if (user.blockedAt && isBlockExpired(user.blockedAt)) {
    log('INFO', `⏰ Bloqueio expirado automaticamente para ${phone}`);
    await unblockBotForUser(jid);
    user.blockedAt = null;
  }
  
  return user;
}

/**
 * Verifica se usuário já interagiu
 */
export async function isExistingUser(jid) {
  const user = await getUser(jid);
  return user !== null;
}

/**
 * Verifica conversa ativa (últimos 7 dias)
 */
export async function hasOngoingConversation(jid) {
  const user = await getUser(jid);
  
  if (!user || !user.lastInteraction) {
    return false;
  }
  
  const timeoutDays = parseInt(process.env.CONVERSATION_TIMEOUT_DAYS) || 7;
  const daysSinceLastInteraction = daysDifference(new Date(), user.lastInteraction);
  
  return daysSinceLastInteraction <= timeoutDays;
}

/**
 * Marca como novo lead
 */
export async function markAsNewLead(jid, name) {
  await saveUser(jid, { 
    name: name,
    isNewLead: true 
  });
  
  log('SUCCESS', `🎯 Novo Lead identificado: ${name}`);
}

/**
 * Verifica se é lead
 */
export async function isLeadUser(jid) {
  const user = await getUser(jid);
  return user?.isNewLead || false;
}

/**
 * ============================================
 * 🔥 CONTROLE DE ATENDIMENTO MANUAL
 * 🔥 DIRETRIZ 3: NUNCA acessa socket
 * ============================================
 */

/**
 * 🔥 BLOQUEIA BOT (Diretriz 3)
 * ⚠️ CRÍTICO: NUNCA toca no socket
 */
export async function blockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  const blockedAt = new Date();
  
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = blockedAt;
    user.blockedBy = process.env.OWNER_NAME || 'Roberto';
    userCache.set(phone, user);
  }
  
  log('WARNING', `🔒 Bot bloqueado para: ${phone}`);
}

/**
 * 🔥 LIBERA BOT (Diretriz 3)
 * ⚠️ CRÍTICO: NUNCA toca no socket
 */
export async function unblockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = null;
    user.blockedBy = null;
    userCache.set(phone, user);
  }
  
  log('SUCCESS', `🔓 Bot liberado para: ${phone}`);
}

/**
 * 🔥 VERIFICA BLOQUEIO (Diretriz 4)
 * 🔥 DIRETRIZ 5: Verifica expiração
 */
export async function isBotBlockedForUser(jid) {
  const phone = extractPhoneNumber(jid);
  
  const user = userCache.get(phone);
  
  if (!user || !user.blockedAt) {
    return false;
  }
  
  // 🔥 Verifica expiração
  if (isBlockExpired(user.blockedAt)) {
    log('INFO', `⏰ Bloqueio expirado e removido para: ${phone}`);
    await unblockBotForUser(jid);
    return false;
  }
  
  return true;
}

/**
 * Lista bloqueados
 */
export function getBlockedUsers() {
  const allUsers = getAllUsers();
  return allUsers.filter(user => user.blockedAt && !isBlockExpired(user.blockedAt));
}

/**
 * 🔥 CLEANUP PERIÓDICO (Diretriz 5)
 * Chamado a cada 5 minutos pelo index.js
 */
export async function cleanExpiredBlocks() {
  const allUsers = getAllUsers();
  let cleaned = 0;
  
  for (const user of allUsers) {
    if (user.blockedAt && isBlockExpired(user.blockedAt)) {
      user.blockedAt = null;
      user.blockedBy = null;
      userCache.set(user.phone, user);
      
      cleaned++;
      log('INFO', `🧹 Bloqueio expirado removido: ${user.phone}`);
    }
  }
  
  if (cleaned > 0) {
    log('SUCCESS', `✅ ${cleaned} bloqueio(s) expirado(s) removido(s)`);
  }
  
  return cleaned;
}

/**
 * ============================================
 * ESTATÍSTICAS
 * ============================================
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
    
    // 🔥 Conta apenas bloqueios NÃO expirados
    if (user.blockedAt && !isBlockExpired(user.blockedAt)) {
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

export function getAllUsers() {
  const keys = userCache.keys();
  return keys.map(key => userCache.get(key));
}

export function clearUser(jid) {
  const phone = extractPhoneNumber(jid);
  userCache.del(phone);
  log('INFO', `🗑️ Cache limpo para: ${phone}`);
}

export function clearAllCache() {
  userCache.flushAll();
  log('WARNING', '🗑️ Todo o cache limpo!');
}

export function exportData() {
  return {
    users: getAllUsers(),
    blockedUsers: getBlockedUsers(),
    stats: getStats(),
    exportedAt: new Date().toISOString()
  };
}

export function printStats() {
  const stats = getStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS DO BOT');
  console.log('📊 ╚═══════════════════════════════════════╝');
  console.log(`👥 Total de usuários: ${stats.totalUsers}`);
  console.log(`🎯 Novos leads: ${stats.newLeads}`);
  console.log(`🔄 Clientes recorrentes: ${stats.returningClients}`);
  console.log(`🚫 Em atendimento manual: ${stats.usersInManualAttendance}`);
  console.log('📊 ╚═══════════════════════════════════════╝\n');
}

/**
 * 🔥 SALVA HISTÓRICO
 */
export async function saveConversationHistory(jid, messages) {
  const phone = extractPhoneNumber(jid);
  const key = `history_${phone}`;
  const existing = userCache.get(key) || [];
  
  if (Array.isArray(messages)) {
    messages.forEach(msg => {
      existing.push({
        timestamp: new Date().toISOString(),
        role: msg.role || 'user',
        content: msg.content || msg
      });
    });
  } else {
    existing.push({
      timestamp: new Date().toISOString(),
      role: 'user',
      content: messages
    });
  }
  
  userCache.set(key, existing);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `💬 Histórico salvo para ${phone}`);
  }
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