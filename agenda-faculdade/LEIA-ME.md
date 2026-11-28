# Agenda da Faculdade: Blackboard para Google Agenda

Script do Google Apps Script que copia as **aulas** e as **entregas** do Blackboard para uma agenda separada no Google Agenda, chamada "Faculdade (Blackboard)", com lembretes no celular. Ele roda sozinho a cada hora, na sua conta Google. Não precisa de servidor nem de instalação no computador.

Lembretes padrão (você pode mudar em `CONFIG`):
- **Entregas:** 2 dias, 1 dia e 2 horas antes do prazo (em vermelho).
- **Aulas:** 30 minutos antes (em azul).

## 1. Copiar o link do calendário do Blackboard

Os nomes dos menus mudam conforme a versão do Blackboard da sua faculdade.

- **Blackboard Ultra:** menu lateral **Calendário** > ícone de engrenagem ou de compartilhar > **Compartilhar calendário** / **Obter link do calendário externo** > copie o link.
- **Blackboard Original:** **Calendário** > **Obter link do calendário externo** > copie o link.

Se o link começar com `webcal://`, troque o início por `https://`.
Esse link funciona como uma senha: não o envie para ninguém e não o coloque no código.

## 2. Criar o projeto no Google Apps Script

1. Acesse https://script.google.com e clique em **Novo projeto**.
2. Dê o nome "Agenda Faculdade", clicando em "Projeto sem título" no topo.
3. Apague o conteúdo de `Código.gs` e cole todo o conteúdo de [`Codigo.gs`](Codigo.gs).
4. Clique na engrenagem (**Configurações do projeto**):
   - Marque **Mostrar o arquivo de manifesto "appsscript.json" no editor**.
   - Em **Propriedades do script**, clique em **Adicionar propriedade do script**:
     - Propriedade: `BLACKBOARD_ICS_URL`
     - Valor: o link copiado no passo 1.
   - Clique em **Salvar propriedades do script**.
5. Volte ao **Editor**, abra `appsscript.json` e substitua o conteúdo pelo de [`appsscript.json`](appsscript.json). Isso garante o fuso de São Paulo.
6. Salve com Ctrl+S.

## 3. Ativar

1. No topo do editor, escolha a função **instalar** e clique em **Executar**.
2. O Google vai pedir autorização. Escolha sua conta. Se aparecer "O Google não verificou este app", clique em **Avançado** > **Acessar Agenda Faculdade (não seguro)**. O aviso aparece porque o script é seu e não passou pela verificação do Google, que é feita para apps públicos.
3. Confira o **Registro de execução**. Deve aparecer algo como "Blackboard: 12 criados, 0 atualizados...".
4. Abra o Google Agenda: a agenda "Faculdade (Blackboard)" aparece na lista do lado esquerdo.

## 3.1. Ver a agenda no celular Samsung

Use a mesma conta Google do script. Os nomes dos menus mudam um pouco conforme a versão do One UI.

1. **Conta sincronizando:** **Configurações** > **Contas e backup** > **Gerenciar contas** > sua conta Google > **Sincronização de conta**. Deixe **Calendário** ligado.
2. **Agenda visível:** abra o app **Calendário** (Samsung) > menu de três linhas > **Gerenciar calendários** (ou o ícone de engrenagem) e marque **Faculdade (Blackboard)** dentro da sua conta Google.
3. **Notificações:** **Configurações** > **Notificações** > **Notificações do app** > **Calendário** (ou **Google Agenda**, se você usa esse app) e deixe ligadas. Em **Configurações** > **Aplicativos** > **Calendário** > **Bateria**, escolha **Sem restrições** para o Android não adiar os lembretes.
4. **Teste:** na primeira vez, force a sincronização em **Sincronização de conta** > três pontos > **Sincronizar agora**. Os eventos podem levar alguns minutos para chegar.

Os lembretes (2 dias, 1 dia, 2 horas e 30 minutos antes) vêm junto com cada evento, sem precisar configurar nada no celular.

## 4. Se as aulas não aparecerem

O Blackboard só manda os horários das aulas se o professor os cadastrou na disciplina. Se aparecerem só as entregas, preencha a grade no começo do código:

```js
const GRADE_AULAS = [
  { materia: 'Matéria Exemplo I', dia: 'segunda', inicio: '19:00', fim: '20:40',
    sala: 'Bloco B, sala 203', inicioSemestre: '01/02/2027', fimSemestre: '30/06/2027' },
  { materia: 'Matéria Exemplo II', dia: 'quarta', inicio: '19:00', fim: '20:40',
    sala: 'Bloco A, sala 101', inicioSemestre: '01/02/2027', fimSemestre: '30/06/2027' },
];
```

Se alguma matéria tiver duas aulas na semana, crie uma linha para cada dia. Depois salve e execute **sincronizar**.
Se o Blackboard trouxer algumas aulas e você também usar a grade, mude `IMPORTAR_AULAS_DO_BLACKBOARD` para `false` para não duplicar.

## Como funciona a sincronização

- **Entrega nova no Blackboard:** aparece na agenda em até 1 hora.
- **Prazo alterado:** o evento é atualizado.
- **Entrega removida:** o evento futuro é apagado. Eventos que já passaram ficam como histórico.
- **Blackboard fora do ar ou link inválido:** nada é apagado. O Google envia um e-mail avisando que a execução falhou.
- Eventos que você criar à mão na agenda "Faculdade (Blackboard)" não são alterados pelo script.

## Funções disponíveis

| Função | O que faz |
|---|---|
| `instalar` | Cria o agendamento de hora em hora e sincroniza na hora. |
| `sincronizar` | Sincroniza agora, sem esperar o agendamento. |
| `desinstalar` | Para a sincronização automática. A agenda e os eventos continuam. |

Para apagar tudo: execute `desinstalar` e depois, no Google Agenda, exclua a agenda "Faculdade (Blackboard)" em **Configurações** > nome da agenda > **Remover agenda**.
