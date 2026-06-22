# Gerador3D — princípios de trabalho (sempre seguir)

Estas diretrizes foram fixadas pelo dono do projeto e **valem para toda tarefa**,
sem precisar repetir. Em caso de conflito, priorize-as.

## Filosofia central
- **Criar geometria, não deformar.** O objetivo é *fabricar* a anatomia que falta
  (interior da boca, dentes, língua, globos oculares, pálpebras, etc.), não apenas
  empurrar a superfície existente. Deformação só como complemento, nunca como
  substituto da estrutura real.
- **Evolução geracional precisa, completa e detalhista.** Cada parte do rosto deve
  ser tratada com fidelidade anatômica: estruturas e detalhes corretos.
- **Foco humano primeiro, criaturas depois.** Modelar com base na anatomia humana e,
  ao final de cada etapa, adaptar para criaturas. **Se encontrar código/modelos de
  criaturas durante a pesquisa, trazer e registrar de imediato.**

## Como trabalhar (obrigatório em toda tarefa)
- **Cautela e precisão.** Mudanças conservadoras, verificáveis e reversíveis.
  Nada de "achismo" — medir, testar, confirmar.
- **Pesquisar repositórios abertos e conhecimento online.** Antes de implementar algo
  não-trivial, procurar projetos/papers/código abertos que ajudem (ex.: ICT-FaceKit,
  FLAME, MediaPipe, Unreal Digital Human, VRoid, three.js). Citar as fontes ao dono.
- **Buscar código que possa auxiliar** e adaptar (respeitando licenças) em vez de
  reinventar.
- **Prever e prevenir erros, falhas e bugs.** Antecipar casos-limite (malhas seladas,
  sem normais, escala/orientação variável, NaN, modelos sem olhos/boca) e tratá-los
  antes que quebrem. Validar com teste de fumaça (geometria sem NaN, morphs presentes)
  e `npm run build` antes de entregar.
- **Honestidade técnica.** Dizer com clareza o que está completo, o que é aproximação
  e o que ainda falta. Sem marketing.

## Mecânica do projeto (referência rápida)
- Frontend em `frontend/` (Vite + React + three.js). Build/typecheck: `npm run build`
  (roda `tsc --noEmit && vite build`). Sem vitest — usar smoke test via esbuild quando
  precisar exercitar lógica de geometria em Node.
- Rig facial: `frontend/src/lib/procedural-face-rig.ts` (morphs ARKit + `computeFaceFrame`),
  `frontend/src/lib/mouth-interior.ts` (interior da boca: cavidade+dentes+língua),
  `frontend/src/lib/eye-anatomy.ts` (olhos: globo+íris+pupila+pálpebras que fecham via
  `eyeBlinkLeft/Right`). Geometria nova segue esse padrão: construir no referencial da face
  (`computeFaceFrame`), adicionar como filho da malha do rosto, com morphs ARKit nomeados
  (dirigidos ao vivo por `applyFaceToGlbMorphs`; preview varre a subárvore do rosto).
- Convenção ARKit com `Left`/`Right` (não `_L`/`_R`) no nosso código, pois é o que o driver
  ao vivo e o exportador usam.
- Versão do app em `desktop/package.json`. Release desktop dispara por push na `main`
  (ou tag `desktop-v*`) — **publicar só com autorização explícita do dono**.
- Desenvolvimento no branch indicado pela tarefa; **nunca** publicar/empurrar para `main`
  sem autorização explícita.

## Referências abertas úteis (rosto/olhos)
- **ICT-FaceKit** (USC): modelo morfável + olhos (esclera, íris, mesh de oclusão estilo
  Unreal Digital Human), nomes ARKit. Pálpebras via blendshapes de abertura
  (aberto↔meio-fechado↔fechado) e olhar (frente↔cima/baixo/esq/dir).
- **FLAME** (Max Planck): cabeça humana paramétrica com expressões.
- **MediaPipe FaceLandmarker**: 52 blendshapes ARKit ao vivo (já usado no Studio).
- Para criaturas: sem solução "1 clique" — caminho procedural (o que fazemos aqui).
