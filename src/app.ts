import fs from 'fs/promises'
import path from 'path'
import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { WPPConnectProvider as Provider } from '@builderbot/provider-wppconnect'

const PORT = process.env.PORT ?? 3008

const reclamoFlow = addKeyword<Provider, Database>('reclamo')
  .addAnswer('Un momento, estoy consultando tu reclamo...') // mensaje previo opcional
  .addAction(async (ctx) => {
    try {
      const filePath = path.join(process.cwd(), 'src', 'data', 'reclamo.json')
      const jsonData = await fs.readFile(filePath, 'utf-8')
      const reclamo = JSON.parse(jsonData)

      const mensaje = `
*Reclamo recibido:*

- NroCuenta: ${reclamo.NroCuenta}
- NroServicioEJESA: ${reclamo.NroServicioEJESA || 'No disponible'}
- Telefono: ${reclamo.Telefono}
- Categoria: ${reclamo.Categoria}
- Tipo: ${reclamo.Tipo}
- Referencia: ${reclamo.Referencia}
- Descripcion: ${reclamo.Descripcion}
      `.trim()

      await ctx.sendMessage(mensaje)
    } catch (error) {
      console.error('Error leyendo reclamo.json:', error)
      await ctx.sendMessage('Lo siento, no pude obtener los datos del reclamo.')
    }
  })



export async function main() {
  const adapterFlow = createFlow([reclamoFlow])

  const adapterProvider = createProvider(Provider)
  const adapterDB = new Database()

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

  httpServer(+PORT)
}
