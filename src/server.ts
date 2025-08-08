import express from 'express'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { WPPConnectProvider as Provider } from '@builderbot/provider-wppconnect'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXPRESS_PORT = 3000
const BOT_PORT = process.env.PORT ?? 3008

const app = express()
app.use(express.json())

app.post('/recibirreclamo', (req, res) => {
  const data = req.body

  const requiredKeys = ['NroCuenta', 'Telefono', 'Categoria', 'Tipo', 'Referencia', 'Descripcion']
  const missing = requiredKeys.filter(key => !(key in data) || data[key] === '' || data[key] === null)

  if (missing.length > 0) {
    return res.status(400).json({ error: `Faltan campos obligatorios: ${missing.join(', ')}` })
  }

  const tiposValidos = ['Comercial', 'Operativo']
  if (!tiposValidos.includes(data.Tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Debe ser uno de: ${tiposValidos.join(', ')}` })
  }

  const dataDir = path.join(__dirname, 'data')
  const filePath = path.join(dataDir, 'reclamo.json')

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir)
  }

  let reclamos: any[] = []
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    try {
      reclamos = JSON.parse(fileContent)
      if (!Array.isArray(reclamos)) reclamos = []
    } catch {
      reclamos = []
    }
  }

  reclamos.push(data)

  fs.writeFileSync(filePath, JSON.stringify(reclamos, null, 2))

  return res.json({ status: 'ok', message: 'Reclamo recibido correctamente' })
})


const reclamoFlow = addKeyword('reclamo')
  .addAnswer('Un momento, estoy consultando tu reclamo...')
  .addAction(async (ctx, { flowDynamic }) => {
    try {
      const filePath = path.join(process.cwd(), 'src', 'data', 'reclamo.json');
      const jsonData = await fsPromises.readFile(filePath, 'utf-8');
      const reclamos = JSON.parse(jsonData);

      if (Array.isArray(reclamos) && reclamos.length > 0) {
        const ultimo = reclamos[reclamos.length - 1];
        const mensajes = [
          { body: '*Último Reclamo recibido:*' },
          
          { body: `- NroCuenta: ${ultimo.NroCuenta}` },
          { body: `- Telefono: ${ultimo.Telefono}` },
          { body: `- Categoria: ${ultimo.Categoria}` },
          { body: `- Tipo: ${ultimo.Tipo}` },
          { body: `- Referencia: ${ultimo.Referencia}` },
          { body: `- Descripción: ${ultimo.Descripcion}` }
        ];
        await flowDynamic(mensajes);
      } else {
        await flowDynamic([{ body: 'No hay reclamos registrados aún.' }]);
      }
    } catch (error) {
      console.error('Error leyendo reclamo.json:', error);
      await flowDynamic([{ body: 'Hubo un problema al procesar tu reclamo. Por favor, intenta más tarde.' }]);
    }
  });

const adapterFlow = createFlow([reclamoFlow])
const adapterProvider = createProvider(Provider)
const adapterDB = new Database()

async function startBot() {
  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  })

  adapterProvider.server.post(
    '/v1/messages',
    handleCtx(async (bot, req, res) => {
      const { number, message, urlMedia } = req.body
      await bot.sendMessage(number, message, { media: urlMedia ?? null })
      return res.end('sended')
    })
  )

  httpServer(+BOT_PORT)
}

const server = app.listen(EXPRESS_PORT, '0.0.0.0', () => {
  console.log(`API Express activa en http://0.0.0.0:${EXPRESS_PORT}`)
})

startBot()
  .then(() => console.log(`Bot iniciado y escuchando en puerto ${BOT_PORT}`))
  .catch((err) => {
    console.error('Error iniciando el bot:', err)
    server.close()
  })
