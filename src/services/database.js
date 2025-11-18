import NodeCache from 'node-cache';
import { daysDifference, log, extractPhoneNumber } from '../utils/helpers.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 💾 CACHE DE USUÁRIOS
 */
const userCache = new NodeCache({ 
  stdTTL: 0, 
  checkperiod: 600
});

/**
 * 🔥 CACHE DE BLOQUEIO - FONTE ÚNICA DE VERDADE
 * 🔥 DIRETRIZ 3: Isolamento total de bloqueio
 */
const manualAttendanceCache = new NodeCache({ 
  stdTTL: 0 
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
 * ✨ NOVO: Inclui campos de prospecção
 */
export async function saveUser(jid, data = {}) {
  const phone = extractPhoneNumber(jid);
  const existing = userCache.get(phone);
  
  // 🔥 Sincroniza blockedAt do manualAttendanceCache
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
    blockedAt: blockedAt,
    
    // ✨ NOVOS CAMPOS DE PROSPECÇÃO
    ownerMessageCount: data.ownerMessageCount !== undefined 
      ? data.ownerMessageCount 
      : existing?.ownerMessageCount || 0,
    isOwnerProspecting: data.isOwnerProspecting !== undefined 
      ? data.isOwnerProspecting 
      : existing?.isOwnerProspecting || false,
    interlocutorType: data.interlocutorType || existing?.interlocutorType || null,
    businessSegment: data.businessSegment || existing?.businessSegment || null,
    lastResponseTime: data.lastResponseTime || existing?.lastResponseTime || null,
    prospectionStage: data.prospectionStage || existing?.prospectionStage || null
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
  
  const manualAttendance = manualAttendanceCache.get(phone);
  const blockedAt = manualAttendance?.blockedAt 
    ? normalizeDate(manualAttendance.blockedAt)
    : null;
  
  const userData = {
    ...existing,
    ...data,
    messageCount: data.messageCount !== undefined ? data.messageCount : existing.messageCount,
    blockedAt: blockedAt
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
  
  // 🔥 Sincroniza blockedAt do manualAttendanceCache
  const manualAttendance = manualAttendanceCache.get(phone);
  const blockedAt = manualAttendance?.blockedAt 
    ? normalizeDate(manualAttendance.blockedAt)
    : null;
  
  user.blockedAt = blockedAt;
  
  // 🔥 Verifica expiração automática
  if (blockedAt && isBlockExpired(blockedAt)) {
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
 * ✨ NOVO: Valida ownerMessageCount >= 2 antes de bloquear
 */
export async function blockBotForUser(jid, force = false) {
  const phone = extractPhoneNumber(jid);
  const user = await getUser(jid);
  
  // ✨ VALIDAÇÃO: Só bloqueia se owner enviou >= 2 mensagens OU força bloqueio
  if (!force && user && user.ownerMessageCount < 2) {
    log('INFO', `⏸️ Bloqueio ignorado: owner enviou apenas ${user.ownerMessageCount} mensagem(ns) para ${phone}`);
    return false;
  }
  
  const blockedAt = new Date();
  
  // 🔥 manualAttendanceCache é a FONTE ÚNICA
  manualAttendanceCache.set(phone, {
    blockedAt: blockedAt,
    blockedBy: process.env.OWNER_NAME || 'Roberto'
  });
  
  // Sincroniza userCache
  if (user) {
    user.blockedAt = blockedAt;
    userCache.set(phone, user);
  }
  
  log('WARNING', `🔒 Bot bloqueado para: ${phone} (ownerMessages: ${user?.ownerMessageCount || 0})`);
  return true;
}

/**
 * 🔥 LIBERA BOT (Diretriz 3)
 * ⚠️ CRÍTICO: NUNCA toca no socket
 * ✨ NOVO: Reseta contador de mensagens do owner
 */
export async function unblockBotForUser(jid) {
  const phone = extractPhoneNumber(jid);
  
  // 🔥 Remove do manualAttendanceCache
  manualAttendanceCache.del(phone);
  
  // Sincroniza userCache e reseta contador
  const user = userCache.get(phone);
  if (user) {
    user.blockedAt = null;
    user.ownerMessageCount = 0; // ✨ Reseta contador
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
  
  // 🔥 Verifica no manualAttendanceCache (fonte única)
  const manualAttendance = manualAttendanceCache.get(phone);
  
  if (!manualAttendance) {
    return false;
  }
  
  // 🔥 Verifica expiração
  if (isBlockExpired(manualAttendance.blockedAt)) {
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
  const keys = manualAttendanceCache.keys();
  return keys.map(key => ({
    phone: key,
    ...manualAttendanceCache.get(key)
  }));
}

/**
 * ============================================
 * ✨ NOVAS FUNÇÕES DE PROSPECÇÃO
 * ============================================
 */

/**
 * ✨ INCREMENTA CONTADOR DE MENSAGENS DO OWNER
 * Usado para decidir quando bloquear IA (após 2ª mensagem)
 */
export async function incrementOwnerMessageCount(jid) {
  const phone = extractPhoneNumber(jid);
  const user = await getUser(jid);
  
  if (!user) {
    log('WARNING', `⚠️ Tentativa de incrementar contador para usuário inexistente: ${phone}`);
    return 0;
  }
  
  const newCount = (user.ownerMessageCount || 0) + 1;
  
  await updateUser(jid, {
    ownerMessageCount: newCount
  });
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `📊 Owner message count para ${phone}: ${newCount}`);
  }
  
  return newCount;
}

/**
 * ✨ REGISTRA TEMPO DE RESPOSTA
 * Usado para detectar chatbot (respostas < 5seg) vs humano (> 30seg)
 */
export async function recordResponseTime(jid, timestamp = null) {
  const phone = extractPhoneNumber(jid);
  const user = await getUser(jid);
  
  if (!user) {
    log('WARNING', `⚠️ Tentativa de registrar tempo para usuário inexistente: ${phone}`);
    return null;
  }
  
  const currentTime = timestamp || new Date();
  const previousTime = user.lastResponseTime;
  
  // Calcula delta se houver tempo anterior
  let responseTimeSeconds = null;
  if (previousTime) {
    const delta = currentTime - new Date(previousTime);
    responseTimeSeconds = Math.floor(delta / 1000);
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `⏱️ Tempo de resposta para ${phone}: ${responseTimeSeconds}s`);
    }
  }
  
  // Atualiza timestamp
  await updateUser(jid, {
    lastResponseTime: currentTime
  });
  
  return responseTimeSeconds;
}

/**
 * ✨ MARCA INÍCIO DE PROSPECÇÃO PELO OWNER
 */
export async function markOwnerProspecting(jid, isProspecting = true) {
  const phone = extractPhoneNumber(jid);
  
  await updateUser(jid, {
    isOwnerProspecting: isProspecting,
    ownerMessageCount: 0 // Reseta contador ao iniciar prospecção
  });
  
  if (isProspecting) {
    log('SUCCESS', `🎯 Prospecção iniciada pelo owner: ${phone}`);
  } else {
    log('INFO', `📴 Prospecção desativada para: ${phone}`);
  }
}

/**
 * ✨ ATUALIZA INFORMAÇÕES DE PROSPECÇÃO
 */
export async function updateProspectionInfo(jid, info = {}) {
  const phone = extractPhoneNumber(jid);
  const user = await getUser(jid);
  
  if (!user) {
    log('WARNING', `⚠️ Tentativa de atualizar prospecção para usuário inexistente: ${phone}`);
    return null;
  }
  
  const updates = {};
  
  if (info.interlocutorType) {
    updates.interlocutorType = info.interlocutorType;
    log('INFO', `👤 Interlocutor identificado para ${phone}: ${info.interlocutorType}`);
  }
  
  if (info.businessSegment) {
    updates.businessSegment = info.businessSegment;
    log('INFO', `🏢 Segmento identificado para ${phone}: ${info.businessSegment}`);
  }
  
  if (info.prospectionStage) {
    updates.prospectionStage = info.prospectionStage;
    log('INFO', `📊 Estágio de prospecção para ${phone}: ${info.prospectionStage}`);
  }
  
  return await updateUser(jid, updates);
}

/**
 * ✨ OBTÉM ESTATÍSTICAS DE PROSPECÇÃO
 */
export function getProspectionStats() {
  const allUsers = userCache.keys();
  
  let activeProspections = 0;
  let stageStats = {
    qualification: 0,
    discovery: 0,
    presentation: 0,
    demonstration: 0,
    handoff: 0
  };
  let segmentStats = {};
  let interlocutorStats = {
    chatbot: 0,
    atendente: 0,
    decisor: 0,
    unknown: 0
  };
  
  allUsers.forEach(phone => {
    const user = userCache.get(phone);
    
    if (user.isOwnerProspecting) {
      activeProspections++;
    }
    
    if (user.prospectionStage && stageStats[user.prospectionStage] !== undefined) {
      stageStats[user.prospectionStage]++;
    }
    
    if (user.businessSegment) {
      segmentStats[user.businessSegment] = (segmentStats[user.businessSegment] || 0) + 1;
    }
    
    if (user.interlocutorType) {
      const type = user.interlocutorType;
      if (interlocutorStats[type] !== undefined) {
        interlocutorStats[type]++;
      }
    } else if (user.isOwnerProspecting) {
      interlocutorStats.unknown++;
    }
  });
  
  return {
    activeProspections,
    stageStats,
    segmentStats,
    interlocutorStats
  };
}

/**
 * ✨ LISTA CONVERSAS DO OWNER
 */
export function listOwnerConversations() {
  const allUsers = userCache.keys();
  const ownerConversations = [];
  
  allUsers.forEach(phone => {
    const user = userCache.get(phone);
    
    if (user.ownerMessageCount > 0 || user.isOwnerProspecting) {
      const manualAttendance = manualAttendanceCache.get(phone);
      const isBlocked = manualAttendance && !isBlockExpired(manualAttendance.blockedAt);
      
      ownerConversations.push({
        phone: user.phone,
        name: user.name,
        ownerMessageCount: user.ownerMessageCount,
        isOwnerProspecting: user.isOwnerProspecting,
        isBlocked: isBlocked,
        blockedAt: isBlocked ? manualAttendance.blockedAt : null,
        interlocutorType: user.interlocutorType,
        businessSegment: user.businessSegment,
        prospectionStage: user.prospectionStage
      });
    }
  });
  
  return ownerConversations;
}

/**
 * 🔥 CLEANUP PERIÓDICO (Diretriz 5)
 * Chamado a cada 5 minutos pelo index.js
 */
export async function cleanExpiredBlocks() {
  const keys = manualAttendanceCache.keys();
  let cleaned = 0;
  
  for (const phone of keys) {
    const attendance = manualAttendanceCache.get(phone);
    
    if (attendance && isBlockExpired(attendance.blockedAt)) {
      manualAttendanceCache.del(phone);
      
      const user = userCache.get(phone);
      if (user) {
        user.blockedAt = null;
        userCache.set(phone, user);
      }
      
      cleaned++;
      log('INFO', `🧹 Bloqueio expirado removido: ${phone}`);
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
  });
  
  // 🔥 Conta apenas bloqueios NÃO expirados
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

export function getAllUsers() {
  const keys = userCache.keys();
  return keys.map(key => {
    const user = userCache.get(key);
    
    const manualAttendance = manualAttendanceCache.get(key);
    if (manualAttendance?.blockedAt) {
      user.blockedAt = normalizeDate(manualAttendance.blockedAt);
    }
    
    return user;
  });
}

export function clearUser(jid) {
  const phone = extractPhoneNumber(jid);
  userCache.del(phone);
  manualAttendanceCache.del(phone);
  log('INFO', `🗑️ Cache limpo para: ${phone}`);
}

export function clearAllCache() {
  userCache.flushAll();
  manualAttendanceCache.flushAll();
  log('WARNING', '🗑️ Todo o cache limpo!');
}

export function exportData() {
  return {
    users: getAllUsers(),
    blockedUsers: getBlockedUsers(),
    stats: getStats(),
    prospectionStats: getProspectionStats(),
    ownerConversations: listOwnerConversations(),
    exportedAt: new Date().toISOString()
  };
}

export function printStats() {
  const stats = getStats();
  const prospection = getProspectionStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS DO BOT');
  console.log('📊 ╚═══════════════════════════════════════╝');
  console.log(`👥 Total de usuários: ${stats.totalUsers}`);
  console.log(`🎯 Novos leads: ${stats.newLeads}`);
  console.log(`🔄 Clientes recorrentes: ${stats.returningClients}`);
  console.log(`🚫 Em atendimento manual: ${stats.usersInManualAttendance}`);
  
  console.log('\n📊 ╔═══════════════════════════════════════╗');
  console.log('📊 PROSPECÇÃO ATIVA');
  console.log('📊 ╚═══════════════════════════════════════╝');
  console.log(`🎯 Prospecções ativas: ${prospection.activeProspections}`);
  console.log(`📊 Por estágio:`);
  console.log(`   • Qualificação: ${prospection.stageStats.qualification}`);
  console.log(`   • Descoberta: ${prospection.stageStats.discovery}`);
  console.log(`   • Apresentação: ${prospection.stageStats.presentation}`);
  console.log(`   • Demonstração: ${prospection.stageStats.demonstration}`);
  console.log(`   • Transferência: ${prospection.stageStats.handoff}`);
  
  if (Object.keys(prospection.segmentStats).length > 0) {
    console.log(`\n🏢 Por segmento:`);
    Object.entries(prospection.segmentStats).forEach(([segment, count]) => {
      console.log(`   • ${segment}: ${count}`);
    });
  }
  
  console.log(`\n👤 Por tipo de interlocutor:`);
  console.log(`   • Chatbot: ${prospection.interlocutorStats.chatbot}`);
  console.log(`   • Atendente: ${prospection.interlocutorStats.atendente}`);
  console.log(`   • Decisor: ${prospection.interlocutorStats.decisor}`);
  console.log(`   • Desconhecido: ${prospection.interlocutorStats.unknown}`);
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
  saveConversationHistory,
  // ✨ Novas funções de prospecção
  incrementOwnerMessageCount,
  recordResponseTime,
  markOwnerProspecting,
  updateProspectionInfo,
  getProspectionStats,
  listOwnerConversations
};