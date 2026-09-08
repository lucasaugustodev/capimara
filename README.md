# Capimara

Página estática da Capimara 3D, preparada para GitHub Pages, com conversa por
microfone, respostas automáticas, movimento da boca, piscadas e aceno.
A tela fica focada na personagem e nos controles de voz, sem chat escrito
nem transcrições visíveis. O histórico em memória mantém o contexto da conversa.

A interface usa caminhos relativos para funcionar em um site de projeto,
como `https://usuario.github.io/capimara/`. O áudio é reproduzido inteiro
pelo player nativo do navegador, preservando a voz aprovada.

O endereço do serviço de conversa fica em `site/config.json`. Esse serviço
implementa `/api/status`, `/api/transcribe` e `/api/talk` e mantém as chaves da
Orca e da ElevenLabs exclusivamente no servidor. GitHub Pages publica apenas
os arquivos estáticos; não executa o servidor Python.

Os modelos de detecção de fala, o avatar e as bibliotecas do navegador são
servidos junto da página. Licenças e origens das dependências ficam em
`assets/vendor/` e `assets/vendor/vad/sources.json`.

O reconhecimento usa ElevenLabs Scribe v2, configurado para português. Ao
terminar uma frase, a página envia seu WAV de microfone para `/api/transcribe`.
O serviço valida o formato e o tamanho e encaminha PCM16 para a ElevenLabs;
somente o texto reconhecido segue para a Orca. O áudio é processado pela
ElevenLabs conforme as configurações de retenção da conta, sem gravação em
disco pelo nosso servidor. Cancelar a conversa também cancela o envio pendente.

Ao abrir a página, apenas os arquivos de detecção de fala são pré-carregados,
com um indicador de preparação; não é necessário baixar o Whisper. O microfone
só é solicitado após tocar em Conversar por voz.

O serviço de APIs é `https://augustolucasg-capimara-api.hf.space`.
As chaves dos provedores ficam nos Secrets desse serviço. Qualquer dispositivo
pode abrir o link normal e conversar, sem convite, conta ou código de acesso.
O servidor mantém os limites de uso da demonstração.

Para iniciar a conversa, clique em **Conversar por voz** uma vez e permita
o acesso ao microfone. Depois disso, a fala é enviada automaticamente ao
terminar uma frase, a resposta toca e a escuta reabre.
