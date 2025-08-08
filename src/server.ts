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
  try {
    console.log('POST /recibirreclamo - Body recibido:', req.body)

    const data = req.body

    const requiredKeys = ['NroCuenta', 'Telefono', 'Categoria', 'Tipo', 'Referencia', 'Descripcion']
    const missing = requiredKeys.filter(key => !(key in data) || data[key] === '' || data[key] === null)

    if (missing.length > 0) {
      console.warn('Faltan campos obligatorios:', missing)
      return res.status(400).json({ error: `Faltan campos obligatorios: ${missing.join(', ')}` })
    }

    const tiposValidos = ['Comercial', 'Operativo']
    if (!tiposValidos.includes(data.Tipo)) {
      console.warn('Tipo inválido recibido:', data.Tipo)
      return res.status(400).json({ error: `Tipo inválido. Debe ser uno de: ${tiposValidos.join(', ')}` })
    }

    const dataDir = path.join(__dirname, 'data')
    const filePath = path.join(dataDir, 'reclamo.json')

    if (!fs.existsSync(dataDir)) {
      console.log('Carpeta data no existe, creando...')
      fs.mkdirSync(dataDir)
    }

    let reclamos = []
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      try {
        reclamos = JSON.parse(fileContent)
        if (!Array.isArray(reclamos)) reclamos = []
      } catch (parseError) {
        console.error('Error parseando reclamo.json:', parseError)
        reclamos = []
      }
    }

    reclamos.push(data)

    fs.writeFileSync(filePath, JSON.stringify(reclamos, null, 2))
    console.log('Reclamo guardado correctamente:', data)

    return res.json({ status: 'ok', message: 'Reclamo recibido correctamente' })
  } catch (err) {
    console.error('Error interno en /recibirreclamo:', err)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

const reclamoFlow = addKeyword('reclamo')
  .addAnswer('Un momento, estoy consultando tu reclamo...')
  .addAction(async (ctx, { flowDynamic }) => {
    try {
      const filePath = path.join(process.cwd(), 'src', 'data', 'reclamo.json')
      console.log('Leyendo archivo reclamo.json en:', filePath)
      const jsonData = await fsPromises.readFile(filePath, 'utf-8')
      const reclamos = JSON.parse(jsonData)
      console.log('Reclamos cargados:', reclamos.length)

      if (Array.isArray(reclamos) && reclamos.length > 0) {
        const ultimo = reclamos[reclamos.length - 1]
        console.log('Último reclamo:', ultimo)
        const mensajes = [
          { body: '*Último Reclamo recibido:*' },
          { body: `- NroCuenta: ${ultimo.NroCuenta}` },
          { body: `- Telefono: ${ultimo.Telefono}` },
          { body: `- Categoria: ${ultimo.Categoria}` },
          { body: `- Tipo: ${ultimo.Tipo}` },
          { body: `- Referencia: ${ultimo.Referencia}` },
          { body: `- Descripción: ${ultimo.Descripcion}` }
        ]
        await flowDynamic(mensajes)
      } else {
        console.log('No hay reclamos registrados aún.')
        await flowDynamic([{ body: 'No hay reclamos registrados aún.' }])
      }
    } catch (error) {
      console.error('Error leyendo reclamo.json:', error)
      await flowDynamic([{ body: 'Hubo un problema al procesar tu reclamo. Por favor, intenta más tarde.' }])
    }
  })

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
      try {
        console.log('POST /v1/messages recibido:', req.body)

        const { number, message, urlMedia } = req.body

        if (!number || !message) {
          console.warn('Faltan number o message en el body:', req.body)
          return res.status(400).json({ error: 'Faltan number o message' })
        }

        await bot.sendMessage(number, message, { media: urlMedia ?? null })
        console.log(`Mensaje enviado a ${number}`)

        return res.status(200).send('sended')
      } catch (error) {
        console.error('Error enviando mensaje:', error)
        return res.status(500).json({ error: 'Error interno al enviar mensaje' })
      }
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
