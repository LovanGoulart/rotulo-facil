# Rótulo Fácil

PWA em português para estimar consumo elétrico e montar uma refeição a partir de rótulos fotografados.

## Executar no Windows (PowerShell)

Extraia o ZIP e abra o terminal na pasta que contém main.py. Use Python 3.10 ou superior.

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:OPENAI_API_KEY = Read-Host "Chave da API OpenAI" -MaskInput
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

A opção -MaskInput requer PowerShell 7.1+. No Windows PowerShell 5.1, substitua a linha da chave por:

```powershell
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host "Chave da API OpenAI" -AsSecureString)).Password
```

## Executar no Linux ou macOS (Bash)

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
read -rsp 'Chave da API OpenAI: ' OPENAI_API_KEY
export OPENAI_API_KEY
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Abra http://127.0.0.1:8000 no computador. Crie a chave no painel da plataforma OpenAI e habilite faturamento e acesso ao gpt-4o no projeto. A chave fica no servidor. O backend usa HTTPS diretamente na API oficial de Chat Completions.

## Uso e instalação no celular

Abra o endereço HTTPS publicado no celular. No Chrome para Android use o menu e “Instalar aplicativo” ou “Adicionar à tela inicial”. No Safari do iPhone use Compartilhar → Adicionar à Tela de Início. O endereço 127.0.0.1 do celular aponta para o próprio telefone.

Escolha o módulo, tire uma foto ou abra a galeria, confira a prévia e toque em Analisar foto. Em energia, selecione a UF e, se souber, informe o preço por kWh da fatura. Em nutrição, cada inclusão soma uma porção inteira da coluna lida. Confira o resultado com a embalagem antes de adicioná-lo. A refeição fica salva nesse navegador. Apagar os dados do site remove a refeição.

Após a primeira carga online, a interface e a refeição podem ser abertas offline. A leitura via IA exige internet, assim como o primeiro carregamento do html2canvas via CDN. O botão de envio abre o seletor do sistema para escolher WhatsApp. Em navegadores sem compartilhamento de arquivos o app abre o WhatsApp com texto.

## Como interpretar os valores

A média residencial estadual inclui tributos e bandeiras, com base nos 12 meses até maio de 2026. Fonte: ARSP, boletim julho–setembro de 2026, página 19, publicado em 16/11/2026. Valores originais em R$/MWh são divididos por 1.000. Para atualizar, substitua o objeto rates e a data em static/app.js a cada boletim. A média não inclui as particularidades de cada conta.

https://arsp.es.gov.br/boletimenergetico

Minuto e hora representam tempo de uso. Dia usa as horas selecionadas, mês usa 30 dias e ano usa 365. Pela potência nominal, kWh = W × horas / 1.000. Com consumo mensal e regime de referência conhecido, o app estima uma potência média dividindo os kWh por 30 e pelas horas diárias da referência. Na falta de regime documentado, prioriza o consumo mensal para uso contínuo ou quando só houver kWh/mês e informa a hipótese de 24 h/dia. Alterar o tempo escala a estimativa linearmente. Ciclos, temperatura e carga afetam o consumo real.

A descrição de horário e os acompanhamentos são sugestões gerais de IA. A porção é a referência impressa. A escala calórica é ilustrativa por porção, definida no aplicativo, sem finalidade clínica.

## Operação em produção

Sirva na raiz de um domínio HTTPS. Execute Uvicorn sob um supervisor com reinício automático, atrás de proxy reverso com TLS. Encaminhe as rotas /api/* e as estáticas para a mesma aplicação. Limite o corpo no proxy a 3 MiB e aplique limites por cliente às rotas POST antes de expor uma chave paga. Configure um limite de gastos/alertas no projeto OpenAI conforme os controles disponíveis. O backend limita por processo a quatro leituras simultâneas e trinta chamadas por minuto. Ao usar vários workers, os limites se multiplicam. Restrinja o acesso no proxy se o aplicativo for privado.

Mantenha a chave em segredo no serviço de hospedagem. Use CORS_ORIGINS somente para frontends em outra origem, com origens HTTPS separadas por vírgulas. O frontend incluído usa a mesma origem. A aplicação envia as fotos ao provedor somente ao confirmar e não grava arquivos de fotos no servidor. Evite registrar corpos HTTP no proxy. Incremente a versão CACHE em static/sw.js em cada publicação com mudança nos arquivos do PWA.

Os endpoints POST /api/energia e /api/nutricao recebem a imagem como corpo binário JPEG, PNG ou WebP de até 3 MiB, com Content-Type correspondente. Retornam JSON ou uma mensagem em detail. Para validar a implantação, teste uma etiqueta real de cada tipo, instalação no dispositivo e envio pelo WhatsApp com sua conta. O serviço precisa alcançar api.openai.com e o navegador deve alcançar cdn.jsdelivr.net.
