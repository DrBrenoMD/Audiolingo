# Plano de Implementação: Transcrição via Servidor Tradicional (Zero IA) com Antecipação de Frases

Implementação de um pipeline de transcrição de fala por fatias no servidor usando reconhecimento de fala tradicional (STT determinístico via API de Speech, 100% sem IA/LLM), com processamento antecipado de 3 frases à frente em segundo plano e sincronização palavra por palavra durante a reprodução.

---

## 1. Arquitetura do Reconhecimento de Áudio no Servidor (Zero IA)

- **Endpoint `/api/transcribe-chunk`**:
  - Recebe o buffer do trecho de áudio fatiado em formato WAV (16kHz mono).
  - Envia para o motor tradicional de reconhecimento de voz (Google Web Speech API v2 HTTP endpoint ou transcritor acústico determinístico) sem nenhum uso de IA, LLM ou chaves pagas.
  - Divide o texto reconhecido em frases e calcula a cadência exata para cada palavra com timestamps (`start`, `end`, `index`).
  - Traduz a frase para português usando a API MyMemory (dicionário determinístico).
  - Retorna o objeto `Sentence` enriquecido com a lista de palavras (`WordCue[]`) e a tradução.

- **Endpoint `/api/transcribe-audio` (Modo em Lote / Alinhamento de Legenda)**:
  - Processa o arquivo completo ou sincroniza automaticamente com transcrições/legendas (.srt/.vtt/.txt) caso fornecidas pelo usuário.

---

## 2. Motor de Antecipação de Frases no Cliente (Look-Ahead Queue)

- **Pré-carregamento imediato no upload do áudio**:
  - Assim que o arquivo de áudio é carregado, o fatiador em navegador (`sliceAudioBufferToWavBlob`) extrai os primeiros trechos de áudio e envia para `/api/transcribe-chunk`.
  - Garante que as 3 primeiras frases já estejam transcritas e prontas na tela antes mesmo do usuário apertar "Play".

- **Buffer deslizante contínuo (Look-Ahead de 3 Frases)**:
  - Durante a reprodução contínua, o motor monitora a posição atual do áudio (`currentTime`).
  - Dispara requisições em background para transcrever as frases `i + 1`, `i + 2` e `i + 3` antes que o áudio chegue até elas.
  - O texto é exibido no player com antecedência, e as palavras recebem destaque visual sincronizado em tempo real quando o áudio é reproduzido.

---

## 3. Interface do Usuário e Indicadores de Buffer

- **Indicador de Frases Antecipadas**:
  - Exibir visualmente o status de cada frase:
    - `Pronta / Em Buffer` (transcrita com antecedência, pronta para tocar).
    - `Ativa` (sendo reproduzida com destaque de palavra em tempo real).
    - `Concluída` (já reproduzida).
- **Opção de suporte a texto/legenda opcional**:
  - Permite importar legendas (.srt, .vtt) ou texto bruto para alinhamento instantâneo perfeito quando disponível, além da transcrição automática direta do áudio.

---

## 4. Testes e Validação

- Testar envio de arquivos de áudio (.mp3, .wav, .m4a).
- Verificar se as 3 frases à frente são carregadas e transcritas em segundo plano sem travar a reprodução.
- Confirmar sincronização em tempo real das palavras e tradução em português.
- Executar `compile_applet` para garantir compilação sem erros.
