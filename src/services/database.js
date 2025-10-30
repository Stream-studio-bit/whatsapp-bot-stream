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
 * ⚠️ 🔥 FONTE ÚNICA DE VERDADE para status de bloqueio
 * 🔥 DIRETRIZ 3: Esta é a única fonte de controle de bloqueio
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
 * 🔥 NORMALIZA DATA: Converte para Date object
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
 * 🔥 VERIFICA EXPIRAÇÃO: Bloqueio expira após 1 hora (Diretriz 5)
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
 * 🔥 SALVA USUÁRIO: Atualiza dados do usuário
 * @param {string} jid - JID do WhatsApp
 * @param {Object} data - Dados para atualizar
 */
export function saveUser(jid, data = {}) {
  const phone = extractPhoneNumber(jid);
  const existing = userCache.get(phone);
  
  // 🔥 DIRETRIZ 3: Sincroniza blockedAt do manualAttendanceCache (fonte única)
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
 * 🔥 ATUALIZA USUÁRIO: Sem incrementar messageCount
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
  
  // 🔥 DIRETRIZ 3: Sincroniza blockedAt do manualAttendanceCache
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
 * 🔥 BUSCA USUÁRIO: Retorna dados do usuário
 * 🔥 DIRETRIZ 5: Verifica expiração automática ao buscar
 * @param {string} jid - JID do WhatsApp
 * @returns {UserData|null}
 */
export function getUser(jid) {
  const phone = extractPhoneNumber(jid);
  const user = userCache.get(phone);
  
  if (!user) return null;
  
  // 🔥 DIRETRIZ 3: SEMPRE sincroniza blockedAt do manualAttendanceCache (fonte única)
  const manualAttendance = manualAttendanceCache.get(phone);
  const blockedAt = manualAttendance?.blockedAt 
    ? normalizeDate(manualAttendance.blockedAt)
    : null;
  
  // Atualiza o objeto user com o blockedAt correto
  user.blockedAt = blockedAt;
  
  // 🔥 DIRETRIZ 5 + 10: Verifica expiração automática com log
  if (blockedAt && isBlockExpired(blockedAt)) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    log('INFO', `⏰ [${timestamp}] Bloqueio expirado automaticamente para ${phone}`);
    
    // Desbloqueia automaticamente se passou 1 hora
    unblockBotForUser(jid);
    user.blockedAt = null;
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
  
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  log('SUCCESS', `🎯 [${timestamp}] Novo Lead identificado: ${name}`);
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
 * ============================================
 * 🔥 CONTROLE DE ATENDIMENTO MANUAL
 * 🔥 DIRETRIZ 3: Isolamento total - NUNCA acessa socket
 * ============================================
 */

/**
 * 🔥 BLOQUEIA BOT: Ativa atendimento manual (Diretriz 3)
 * ⚠️ CRÍTICO: Esta função NUNCA deve tocar no socket
 * @param {string} jid - JID do WhatsApp
 * @returns {Promise<void>} Sempre retorna Promise para compatibilidade
 */
export async function blockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  const blockedAt = new Date();
  const timestamp = blockedAt.toLocaleTimeString('pt-BR');
  
  // 🔥 DIRETRIZ 3: manualAttendanceCache é a FONTE ÚNICA DE VERDADE
  manualAttendanceCache.set(phone, {
    blockedAt: blockedAt, // Date object, não string
    blockedBy: process.env.OWNER_NAME || 'Roberto'
  });
  
  // Atualiza userCache apenas para manter sincronizado
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = blockedAt;
    userCache.set(phone, user);
  }
  
  // 🔥 DIRETRIZ 10: Log com timestamp e telefone
  log('WARNING', `🚫 [${timestamp}] Bot bloqueado para: ${phone} (atendimento manual)`);
}

/**
 * 🔥 LIBERA BOT: Desativa atendimento manual (Diretriz 3)
 * ⚠️ CRÍTICO: Esta função NUNCA deve tocar no socket
 * @param {string} jid - JID do WhatsApp
 * @returns {Promise<void>} Sempre retorna Promise para compatibilidade
 */
export async function unblockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  // 🔥 DIRETRIZ 3: Remove do manualAttendanceCache (fonte única)
  manualAttendanceCache.del(phone);
  
  // Sincroniza userCache
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = null;
    userCache.set(phone, user);
  }
  
  // 🔥 DIRETRIZ 10: Log com timestamp e telefone
  log('SUCCESS', `✅ [${timestamp}] Bot liberado para: ${phone} (automático novamente)`);
}

/**
 * 🔥 VERIFICA BLOQUEIO: Consulta status de bloqueio (Diretriz 4)
 * 🔥 DIRETRIZ 5: Verifica expiração automática
 * @param {string} jid - JID do WhatsApp
 * @returns {Promise<boolean>} Retorna Promise para compatibilidade com async/await
 */
export async function isBotBlockedForUser(jid) {
  const phone = extractPhoneNumber(jid);
  
  // 🔥 DIRETRIZ 3: Verifica no manualAttendanceCache (fonte única)
  const manualAttendance = manualAttendanceCache.get(phone);
  
  if (!manualAttendance) {
    return false; // Não está bloqueado
  }
  
  // 🔥 DIRETRIZ 5: Verifica se bloqueio expirou
  if (isBlockExpired(manualAttendance.blockedAt)) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    // 🔥 DIRETRIZ 10: Log com timestamp
    log('INFO', `⏰ [${timestamp}] Bloqueio expirado e removido para: ${phone}`);
    
    // Desbloqueia automaticamente
    await unblockBotForUser(jid);
    
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
 * 🔥 CLEANUP PERIÓDICO: Remove bloqueios expirados (Diretriz 5)
 * Chamada a cada 5 minutos pelo index.js
 * @returns {Promise<number>} Quantidade de bloqueios removidos
 */
export async function cleanExpiredBlocks() {
  const keys = manualAttendanceCache.keys();
  let cleaned = 0;
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  for (const phone of keys) {
    const attendance = manualAttendanceCache.get(phone);
    
    if (attendance && isBlockExpired(attendance.blockedAt)) {
      // Remove do cache principal
      manualAttendanceCache.del(phone);
      
      // Sincroniza userCache
      const user = userCache.get(phone);
      if (user) {
        user.blockedAt = null;
        userCache.set(phone, user);
      }
      
      cleaned++;
      
      // 🔥 DIRETRIZ 10: Log com timestamp e telefone
      log('INFO', `🧹 [${timestamp}] Bloqueio expirado removido: ${phone}`);
    }
  }
  
  if (cleaned > 0) {
    // 🔥 DIRETRIZ 7: Log descritivo sem interromper fluxo
    log('SUCCESS', `✅ [${timestamp}] ${cleaned} bloqueio(s) expirado(s) removido(s)`);
  } else if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🧹 [${timestamp}] Cleanup executado: nenhum bloqueio expirado encontrado`);
  }
  
  return cleaned;
}

/**
 * ============================================
 * ESTATÍSTICAS
 * ============================================
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
  
  // 🔥 DIRETRIZ 5: Conta apenas bloqueios NÃO expirados
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
    
    // 🔥 DIRETRIZ 3: Sincroniza blockedAt
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
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  userCache.del(phone);
  manualAttendanceCache.del(phone);
  
  log('INFO', `🗑️ [${timestamp}] Cache limpo para: ${phone}`);
}

/**
 * Limpa todo o cache
 */
export function clearAllCache() {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  
  userCache.flushAll();
  manualAttendanceCache.flushAll();
  
  log('WARNING', `🗑️ [${timestamp}] Todo o cache foi limpo!`);
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
 * 🔥 SALVA HISTÓRICO: Armazena mensagens trocadas
 * @param {string} jid - JID do WhatsApp
 * @param {Array} messages - Array de mensagens [{role, content}]
 */
export function saveConversationHistory(jid, messages) {
  const phone = extractPhoneNumber(jid);
  const key = `history_${phone}`;
  const existing = userCache.get(key) || [];
  
  // Se messages for array de objetos {role, content}
  if (Array.isArray(messages)) {
    messages.forEach(msg => {
      existing.push({
        timestamp: new Date().toISOString(),
        role: msg.role || 'user',
        content: msg.content || msg
      });
    });
  } else {
    // Fallback para string simples
    existing.push({
      timestamp: new Date().toISOString(),
      role: 'user',
      content: messages
    });
  }
  
  userCache.set(key, existing);
  
  if (process.env.DEBUG_MODE === 'true') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    log('INFO', `💬 [${timestamp}] Histórico salvo para ${phone}`);
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