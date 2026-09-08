# Capimara

Página estática da Capimara 3D, preparada para GitHub Pages, com conversa por
microfone, respostas automáticas, movimento da boca, piscadas e aceno.

A interface usa caminhos relativos para funcionar em um site de projeto,
como `https://usuario.github.io/capimara/`. O áudio é reproduzido inteiro
pelo player nativo do navegador, preservando a voz aprovada.

O endereço do serviço de conversa fica em `site/config.json`. Esse serviço
implementa `/api/status` e `/api/talk` e mantém as chaves da
Orca e da ElevenLabs exclusivamente no servidor. GitHub Pages publica apenas
os arquivos estáticos; não executa o servidor Python.

Os modelos de detecção de fala, o avatar e as bibliotecas do navegador são
servidos junto da página. Licenças e origens das dependências ficam em
`assets/vendor/` e `assets/vendor/vad/sources.json`.

O reconhecimento usa Whisper Base quantizado no navegador, em um Web Worker,
com aceleração WebGPU quando disponível. A alternativa WebAssembly usa o
Whisper Tiny para reduzir a espera em aparelhos sem essa aceleração. Na primeira
conversa, os pesos são baixados do Hugging Face e armazenados no cache do
navegador. Transformers.js 4.2.0 é importado de sua distribuição oficial no
jsDelivr. O modelo é preparado antes de abrir a escuta. Áudio do microfone
fica no aparelho; somente o texto reconhecido segue para o servidor.

O serviço de APIs é `https://augustolucasg-capimara-api.hf.space`.
As chaves dos provedores ficam nos Secrets desse serviço. O acesso à conversa
usa um link de convite com um código em seu fragmento; esse código não faz
parte do repositório e é guardado apenas na sessão da aba ao abrir o link.
Sem convite, o avatar pode ser visto e a página oferece a entrada por código.

Para iniciar a conversa, clique em **Conversar por voz** uma vez e permita
o acesso ao microfone. Depois disso, a fala é enviada automaticamente ao
terminar uma frase, a resposta toca e a escuta reabre.
