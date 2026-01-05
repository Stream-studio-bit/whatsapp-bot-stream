# Use Node.js 20 Alpine (leve)
FROM node:20-alpine

# Metadados
LABEL maintainer="Stream Studio"
LABEL description="Bot WhatsApp - Baileys + Groq + Supabase"

# Diretório de trabalho
WORKDIR /app

# Instala dependências do sistema (necessárias para Baileys)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copia package files
COPY package*.json ./

# Instala dependências
RUN npm ci --only=production

# Copia código fonte
COPY . .

# Cria diretório para cache/temp
RUN mkdir -p /app/temp

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Expõe porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["node", "src/index.js"]