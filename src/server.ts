import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3000

app.use(express.json())

app.post('/recibirreclamo', (req, res) => {
  const data = req.body

  const requiredKeys = ['NroCuenta', 'Telefono', 'Categoria', 'Tipo', 'Referencia', 'Descripcion']
  const optionalKeys = ['NroServicioEJESA']

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

  let reclamos = []
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API activa en http://0.0.0.0:${PORT}`)
})

