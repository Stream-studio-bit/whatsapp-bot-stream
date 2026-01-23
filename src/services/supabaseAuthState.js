import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys'

export async function useSupabaseAuthState(supabase, sessionId) {

  // ===== CACHE EM MEMÓRIA (CRÍTICO) =====
  const keyCache = new Map()

  const readCreds = async () => {
    const { data } = await supabase
      .from('whatsapp_auth')
      .select('value')
      .eq('session_id', sessionId)
      .eq('type', 'creds')
      .eq('key_id', 'creds')
      .single()

    return data?.value
      ? JSON.parse(JSON.stringify(data.value), BufferJSON.reviver)
      : null
  }

  const writeCreds = async (creds) => {
    await supabase
      .from('whatsapp_auth')
      .upsert({
        session_id: sessionId,
        type: 'creds',
        key_id: 'creds',
        value: JSON.parse(JSON.stringify(creds, BufferJSON.replacer))
      })
  }

  let creds = await readCreds()
  if (!creds) {
    creds = initAuthCreds()
    await writeCreds(creds)
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}

          for (const id of ids) {
            const cacheKey = `${type}:${id}`
            if (keyCache.has(cacheKey)) {
              data[id] = keyCache.get(cacheKey)
              continue
            }

            const { data: row } = await supabase
              .from('whatsapp_auth')
              .select('value')
              .eq('session_id', sessionId)
              .eq('type', type)
              .eq('key_id', id)
              .single()

            if (row?.value) {
              const value = JSON.parse(JSON.stringify(row.value), BufferJSON.reviver)
              keyCache.set(cacheKey, value)
              data[id] = value
            }
          }

          return data
        },

        set: async (data) => {
          const rows = []

          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id]
              const cacheKey = `${type}:${id}`

              if (value) {
                keyCache.set(cacheKey, value)
                rows.push({
                  session_id: sessionId,
                  type,
                  key_id: id,
                  value: JSON.parse(JSON.stringify(value, BufferJSON.replacer))
                })
              } else {
                keyCache.delete(cacheKey)
                await supabase
                  .from('whatsapp_auth')
                  .delete()
                  .eq('session_id', sessionId)
                  .eq('type', type)
                  .eq('key_id', id)
              }
            }
          }

          if (rows.length) {
            await supabase
              .from('whatsapp_auth')
              .upsert(rows)
          }
        }
      }
    },

    saveCreds: async () => {
      await writeCreds(creds)
    }
  }
}
