// Preload mínimo — a UI roda como SPA servida pelo motor local; não precisamos
// expor APIs nativas além do básico. Mantido para isolamento de contexto.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('gerador3d', {
  desktop: true,
  version: '0.1.0',
})
