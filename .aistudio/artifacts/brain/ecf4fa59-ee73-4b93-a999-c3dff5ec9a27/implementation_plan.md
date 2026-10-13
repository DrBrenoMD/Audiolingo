# Plano de Implementação: Arquitetura de Transcrição Tradicional 100% Sem IA (Zero AI / Standalone)

## 1. Visão Geral e Diagnóstico
O software apresentou falhas ao ser executado fora do ambiente do Google AI Studio porque dependia de chaves de API de nuvem e SDKs de Inteligência Artificial (`@google/genai`, chaves do Gemini, Groq ou OpenAI). Sem essas chaves ou conexões, o sistema falhava ou gerava mensagens de erro/placeholders.

Atendendo à solicitação do usuário, **todos os sistemas, SDKs e modelos de IA serão removidos**. A transcrição e o estudo de audiolivros funcionarão de forma 100% autônoma, local e gratuita utilizando:
1. **Web Speech API Nativa do Navegador** (`window.SpeechRecognition` / `webkitSpeechRecognition`): reconhecimento de voz executado diretamente no dispositivo do usuário, sem custos, sem chaves e sem dependências externas.
2. **Alinhador Acústico de Cadência & Parser Universal de Legendas/Textos** (`.srt`, `.vtt`, `.txt`, `.epub`, `.pdf`): alinhamento elástico determinístico baseado em cadência de fala, contagem silábica e pontuação, gerando sincronia palavra por palavra instantânea com 0ms de latência.
3. **APIs Tradicionais Abertas para Dicionário e Tradução** (Free Dictionary API + MyMemory API + Dicionário em memória local para resposta em 0ms).
4. **Avaliador Fonético e de Pronúncia Algorítmico** (Distância de Levenshtein + Regras fonéticas articulatórias tradicionais, sem IA).

---

## 2. Mudanças Estruturais e Arquitetura

### A. Backend (`server.ts`)
* **Remoção Completa de IA:**
  * Remover imports e inicialização do `@google/genai` e de qualquer chamada a modelos de IA generativa.
  * Remover chamadas e verificações de `GROQ_API_KEY`, `OPENAI_API_KEY` e `GEMINI_API_KEY`.
* **Rotas de Transcrição Tradicionais:**
  * `/api/transcribe-chunk` e `/api/transcribe-audio`: operam de modo determinístico. Quando texto for fornecido (via e-book ou legenda), realizam a segmentação e cálculo de cadência temporal; caso apenas áudio seja enviado, orientam e acionam o pipeline da **Web Speech API nativa** no cliente.
* **Preservação de Recursos Não-IA:**
  * Manter Free Dictionary API (`api.dictionaryapi.dev`) e tradução pública MyMemory com cache de alta performance.
  * Manter motor de avaliação fonética baseado em Levenshtein (`/api/speaking-evaluate`).
  * Manter verificador gramatical de regras abertas LanguageTool (`/api/writing-evaluate`).

### B. Módulo de Transcrição no Navegador (`src/utils/liveTranscription.ts` & `src/utils/chunkAudioTranscriber.ts`)
* Integrar `LiveTranscriptionService` com escuta do elemento de áudio em reprodução usando a Web Speech API nativa do navegador (`webkitSpeechRecognition`).
* Adicionar captura de áudio direto da tag `<audio>` via `AudioContext` / `MediaStreamAudioDestinationNode` permitindo que o navegador transcreva a fala do audiolivro em tempo real enquanto ele toca.
* Sincronizar os trechos reconhecidos com os intervalos de tempo (`start` e `end`) do player.

### C. Importação e Alinhamento Universal (`src/utils/textExtractor.ts` & `src/utils/fuzzyAligner.ts`)
* Ao importar um audiolivro com arquivo de texto ou legenda (`.srt`, `.vtt`, `.txt`, `.epub`, `.pdf`), o sistema extrai o texto original do autor e gera a sincronização elástica com o áudio baseada em duração e cadência de leitura.
* Suporte nativo completo a arquivos `.srt` e `.vtt` com timestamps pré-definidos exatos de cada frase e palavra.

### D. Interface do Player e Galeria (`AudiobookPlayer.tsx` & `MediaManager.tsx`)
* Eliminar completamente qualquer texto residual ou mensagem mencionando "Audiobook narration segment" ou "Configure GROQ_API_KEY".
* Exibir badge indicativo de motor tradicional: *"Reconhecimento Nativo Web Speech (Sem IA)"* ou *"Sincronizado via Legenda/Texto"*.
* Garantir que a Galeria permaneça como página inicial com fluxo intuitivo para carregar áudio + texto ou usar transcrição nativa do navegador.

---

## 3. Plano de Verificação e Testes
1. **Execução sem chaves de API:** Testar inicialização sem nenhuma variável de ambiente (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`) para garantir funcionamento 100% autônomo.
2. **Compilação e Linter:** Executar `lint_applet` (`tsc --noEmit`) e `compile_applet` para assegurar ausência de erros de sintaxe ou tipos.
3. **Teste de Transcrição no Navegador:** Validar que a Web Speech API inicia e captura a fala do áudio em reprodução.
4. **Teste de Alinhamento de Legendas e Texto:** Validar que arquivos `.srt`, `.txt` e `.epub` são segmentados e sincronizados com destaque de palavras.
