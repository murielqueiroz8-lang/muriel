/**
 * Agenda da Faculdade: Blackboard -> Google Agenda
 *
 * O que faz:
 *  - Lê o calendário do Blackboard (link .ics) e copia aulas e entregas
 *    para uma agenda separada no Google Agenda, com lembretes.
 *  - Opcionalmente cria as aulas a partir de uma grade horária digitada
 *    abaixo (GRADE_AULAS), para quando o professor não cadastrou os
 *    horários no Blackboard.
 *  - Roda sozinho a cada hora depois de executar a função "instalar".
 *
 * O link do Blackboard NÃO fica neste arquivo. Ele fica em
 * Configurações do projeto > Propriedades do script, com o nome
 * BLACKBOARD_ICS_URL. Esse link funciona como uma senha: não compartilhe.
 */

// ---------------------------------------------------------------------------
// CONFIGURAÇÕES (pode alterar)
// ---------------------------------------------------------------------------
const CONFIG = {
  NOME_AGENDA: 'Faculdade (Blackboard)', // agenda criada pelo script
  FUSO: 'America/Sao_Paulo',
  DIAS_PASSADOS: 1,     // sincroniza a partir de ontem
  DIAS_FUTUROS: 180,    // até 180 dias à frente

  // Lembretes em minutos antes do evento (no máximo 5 por evento,
  // cada um entre 0 e 40320 minutos, que são 4 semanas).
  LEMBRETES_ENTREGA_MIN: [2880, 1440, 120], // 2 dias, 1 dia e 2 horas antes
  LEMBRETES_AULA_MIN: [30],                 // 30 minutos antes

  // Eventos do Blackboard com duração até este valor são tratados como entrega.
  DURACAO_MAX_ENTREGA_MIN: 1,

  // Se você preencher GRADE_AULAS e o Blackboard também mandar as aulas,
  // mude para false para não duplicar.
  IMPORTAR_AULAS_DO_BLACKBOARD: true,

  PREFIXO_ENTREGA: 'Entrega: ',
  COR_ENTREGA: CalendarApp.EventColor.RED,
  COR_AULA: CalendarApp.EventColor.BLUE
};

// Grade horária manual (opcional). Deixe vazia [] se o Blackboard já
// traz os horários das aulas. Dias aceitos: segunda, terça, quarta,
// quinta, sexta, sábado, domingo. Datas no formato dd/mm/aaaa.
const GRADE_AULAS = [
  // { materia: 'Matéria Exemplo I', dia: 'segunda', inicio: '19:00', fim: '20:40',
  //   sala: 'Bloco B, sala 203', inicioSemestre: '01/02/2027', fimSemestre: '30/06/2027' },
];

// ---------------------------------------------------------------------------
// FUNÇÕES PARA EXECUTAR NO EDITOR
// ---------------------------------------------------------------------------

/** Cria o agendamento de hora em hora e já faz a primeira sincronização. */
function instalar() {
  desinstalar();
  ScriptApp.newTrigger('sincronizar').timeBased().everyHours(1).create();
  console.log('Agendamento criado: a sincronização vai rodar a cada hora.');
  sincronizar();
}

/** Remove o agendamento automático (não apaga a agenda nem os eventos). */
function desinstalar() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizar')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/** Sincroniza agora. Também é a função chamada pelo agendamento. */
function sincronizar() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) {
    console.log('Outra sincronização já está em andamento. Ignorando esta.');
    return;
  }
  try {
    validarConfig_();
    const inicioExecucao = Date.now();
    const agenda = obterAgenda_();

    const url = PropertiesService.getScriptProperties().getProperty('BLACKBOARD_ICS_URL');
    if (url) {
      const texto = baixarIcs_(url.trim());
      const agora = new Date();
      const inicioJanela = new Date(agora.getTime() - CONFIG.DIAS_PASSADOS * 86400000);
      const fimJanela = new Date(agora.getTime() + CONFIG.DIAS_FUTUROS * 86400000);
      const ocorrencias = montarOcorrencias_(lerIcs_(texto), inicioJanela, fimJanela);
      sincronizarFeed_(agenda, ocorrencias, inicioJanela, fimJanela, inicioExecucao);
    } else if (GRADE_AULAS.length === 0) {
      throw new Error('Falta o link do Blackboard. Cadastre a propriedade BLACKBOARD_ICS_URL ' +
        'em Configurações do projeto > Propriedades do script.');
    }

    sincronizarGrade_(agenda);
  } finally {
    trava.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// LEITURA DO BLACKBOARD (.ics)
// ---------------------------------------------------------------------------

function baixarIcs_(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('O link do Blackboard precisa começar com https://');
  }
  // Alguns links vêm como webcal://, mas aqui já exigimos https.
  const resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const codigo = resposta.getResponseCode();
  const texto = resposta.getContentText('UTF-8');
  if (codigo !== 200) {
    throw new Error('O Blackboard respondeu com erro ' + codigo +
      '. Confira se o link do calendário ainda é válido (ele muda se você gerar um novo).');
  }
  if (texto.indexOf('BEGIN:VCALENDAR') === -1) {
    throw new Error('O link não devolveu um calendário .ics. Confira se copiou o link certo.');
  }
  return texto;
}

/** Converte o texto .ics em uma lista de eventos { NOME: [{valor, params}] }. */
function lerIcs_(texto) {
  const linhas = texto.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const eventos = [];
  let atual = null;
  let profundidade = 0; // ignora blocos internos, como VALARM
  linhas.forEach(linha => {
    if (linha === 'BEGIN:VEVENT') { atual = {}; profundidade = 0; return; }
    if (linha === 'END:VEVENT') { if (atual) eventos.push(atual); atual = null; return; }
    if (!atual) return;
    if (/^BEGIN:/.test(linha)) { profundidade++; return; }
    if (/^END:/.test(linha)) { profundidade = Math.max(0, profundidade - 1); return; }
    if (profundidade > 0) return;
    const i = indiceDoisPontos_(linha);
    if (i < 0) return;
    const partes = linha.slice(0, i).split(';');
    const nome = partes[0].toUpperCase();
    const params = {};
    partes.slice(1).forEach(p => {
      const j = p.indexOf('=');
      if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, '');
    });
    (atual[nome] = atual[nome] || []).push({ valor: linha.slice(i + 1), params: params });
  });
  return eventos;
}

/** Primeiro ":" fora de aspas (o TZID pode vir entre aspas). */
function indiceDoisPontos_(linha) {
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') aspas = !aspas;
    else if (c === ':' && !aspas) return i;
  }
  return -1;
}

function textoIcs_(campo) {
  if (!campo) return '';
  return campo[0].valor
    .replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
    .trim();
}

/** Lê DTSTART/DTEND/EXDATE. Retorna { data: Date, diaInteiro: bool } ou null. */
function lerDataIcs_(valor, params) {
  const v = String(valor || '').trim();
  try {
    if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
      return { data: Utilities.parseDate(v.slice(0, 8), CONFIG.FUSO, 'yyyyMMdd'), diaInteiro: true };
    }
    if (/^\d{8}T\d{6}Z$/i.test(v)) {
      return { data: Utilities.parseDate(v.slice(0, 15), 'UTC', "yyyyMMdd'T'HHmmss"), diaInteiro: false };
    }
    if (/^\d{8}T\d{4,6}$/.test(v)) {
      const fuso = fusoValido_(params.TZID);
      const texto = v.length === 13 ? v + '00' : v;
      return { data: Utilities.parseDate(texto, fuso, "yyyyMMdd'T'HHmmss"), diaInteiro: false };
    }
  } catch (e) {
    console.warn('Data inválida no calendário: ' + v);
  }
  return null;
}

function fusoValido_(tzid) {
  if (!tzid) return CONFIG.FUSO;
  // Aceita apenas nomes no formato Região/Cidade; os demais usam o fuso padrão.
  return /^[A-Za-z_]+\/[A-Za-z_\/+\-]+$/.test(tzid) ? tzid : CONFIG.FUSO;
}

/**
 * Transforma os eventos lidos em ocorrências prontas para a agenda,
 * expandindo repetições semanais/diárias simples (RRULE) dentro da janela.
 */
function montarOcorrencias_(eventos, inicioJanela, fimJanela) {
  const lista = [];
  eventos.forEach(ev => {
    if (textoIcs_(ev.STATUS).toUpperCase() === 'CANCELLED') return;
    const inicio = ev.DTSTART ? lerDataIcs_(ev.DTSTART[0].valor, ev.DTSTART[0].params) : null;
    if (!inicio) return;
    const fim = ev.DTEND ? lerDataIcs_(ev.DTEND[0].valor, ev.DTEND[0].params) : null;
    let duracaoMs = fim ? fim.data.getTime() - inicio.data.getTime() : 0;
    if (inicio.diaInteiro && duracaoMs <= 0) duracaoMs = 86400000;
    if (duracaoMs < 0) duracaoMs = 0;

    const titulo = textoIcs_(ev.SUMMARY) || '(sem título)';
    const ehEntrega = !inicio.diaInteiro && duracaoMs <= CONFIG.DURACAO_MAX_ENTREGA_MIN * 60000;
    if (!ehEntrega && !CONFIG.IMPORTAR_AULAS_DO_BLACKBOARD) return;

    const uid = textoIcs_(ev.UID) || (titulo + '|' + inicio.data.getTime());
    const base = {
      uid: uid,
      titulo: ehEntrega ? CONFIG.PREFIXO_ENTREGA + titulo : titulo,
      descricao: textoIcs_(ev.DESCRIPTION),
      local: textoIcs_(ev.LOCATION),
      tipo: ehEntrega ? 'entrega' : 'aula',
      diaInteiro: inicio.diaInteiro,
      duracaoMs: ehEntrega ? 60000 : duracaoMs // entrega: evento de 1 min no horário do prazo
    };

    const inicios = ev.RRULE
      ? expandirRepeticao_(inicio.data, textoIcs_(ev.RRULE), datasExcluidas_(ev), fimJanela)
      : [inicio.data];

    inicios.forEach(d => {
      const fimOcorrencia = new Date(d.getTime() + base.duracaoMs);
      if (fimOcorrencia < inicioJanela || d > fimJanela) return;
      lista.push(Object.assign({}, base, {
        chave: ev.RRULE ? uid + '|' + d.getTime() : uid,
        inicio: d,
        fim: fimOcorrencia
      }));
    });
  });
  return lista;
}

function datasExcluidas_(ev) {
  const excluidas = {};
  (ev.EXDATE || []).forEach(campo => {
    campo.valor.split(',').forEach(v => {
      const d = lerDataIcs_(v, campo.params);
      if (d) excluidas[d.data.getTime()] = true;
    });
  });
  return excluidas;
}

/** Suporta FREQ=DAILY/WEEKLY com INTERVAL, BYDAY, UNTIL e COUNT. */
function expandirRepeticao_(inicio, rrule, excluidas, fimJanela) {
  const regra = {};
  rrule.split(';').forEach(p => { const [k, v] = p.split('='); if (k) regra[k.toUpperCase()] = v || ''; });
  const freq = regra.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY') {
    console.warn('Repetição não suportada (' + rrule + '). Importando só a primeira ocorrência.');
    return [inicio];
  }
  const intervalo = Math.max(1, parseInt(regra.INTERVAL || '1', 10));
  const limiteQtd = regra.COUNT ? parseInt(regra.COUNT, 10) : Infinity;
  let ate = fimJanela;
  if (regra.UNTIL) {
    const u = lerDataIcs_(regra.UNTIL, {});
    if (u) ate = new Date(Math.min(fimJanela.getTime(),
      u.diaInteiro ? u.data.getTime() + 86400000 - 1 : u.data.getTime()));
  }
  const mapaDias = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const diasSemana = regra.BYDAY
    ? regra.BYDAY.split(',').map(d => mapaDias[d.replace(/[^A-Z]/g, '')]).filter(n => n !== undefined)
    : [diaSemana_(inicio)];
  const semanaInicio = inicioDaSemana_(inicio);

  const resultado = [];
  let contador = 0;
  for (let n = 0; n < 3660; n++) { // no máximo ~10 anos de dias
    const d = somarDias_(inicio, n);
    if (d > ate || contador >= limiteQtd) break;
    let valido;
    if (freq === 'DAILY') {
      valido = n % intervalo === 0;
    } else {
      const semanas = Math.round((inicioDaSemana_(d).getTime() - semanaInicio.getTime()) / (7 * 86400000));
      valido = semanas % intervalo === 0 && diasSemana.indexOf(diaSemana_(d)) !== -1;
    }
    if (!valido) continue;
    contador++; // COUNT inclui as datas excluídas, conforme a especificação
    if (!excluidas[d.getTime()]) resultado.push(d);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// GRAVAÇÃO NO GOOGLE AGENDA
// ---------------------------------------------------------------------------

function obterAgenda_() {
  const existentes = CalendarApp.getCalendarsByName(CONFIG.NOME_AGENDA);
  if (existentes.length > 0) return existentes[0];
  const agenda = CalendarApp.createCalendar(CONFIG.NOME_AGENDA, { timeZone: CONFIG.FUSO });
  console.log('Agenda criada: ' + CONFIG.NOME_AGENDA);
  return agenda;
}

function sincronizarFeed_(agenda, ocorrencias, inicioJanela, fimJanela, inicioExecucao) {
  const existentes = {};
  agenda.getEvents(inicioJanela, fimJanela).forEach(ev => {
    const chave = ev.getTag('bbChave');
    if (!chave) return; // eventos da grade manual ou criados por você não são tocados
    if (existentes[chave]) { ev.deleteEvent(); return; } // remove duplicado antigo
    existentes[chave] = ev;
  });

  let criados = 0, atualizados = 0, removidos = 0, iguais = 0;
  const vistos = {};
  for (let i = 0; i < ocorrencias.length; i++) {
    if (tempoEsgotado_(inicioExecucao)) {
      console.warn('Tempo de execução quase no limite. O restante será feito na próxima hora.');
      return;
    }
    const oc = ocorrencias[i];
    if (vistos[oc.chave]) continue;
    vistos[oc.chave] = true;
    const assinatura = gerarHash_(JSON.stringify([oc.titulo, oc.descricao, oc.local, oc.inicio.getTime(),
      oc.fim.getTime(), oc.diaInteiro, lembretesDo_(oc.tipo)]));
    const atual = existentes[oc.chave];
    if (atual && atual.getTag('bbHash') === assinatura) { iguais++; continue; }
    if (atual) { atual.deleteEvent(); atualizados++; } else { criados++; }
    criarEvento_(agenda, oc, assinatura);
    Utilities.sleep(250); // evita o limite de criação rápida do Google
  }

  // Remove eventos futuros que sumiram do Blackboard (ex.: entrega cancelada).
  // Proteção: se o calendário veio vazio, não apaga nada.
  if (ocorrencias.length > 0) {
    const agora = new Date();
    Object.keys(existentes).forEach(chave => {
      if (vistos[chave]) return;
      const ev = existentes[chave];
      if (ev.getEndTime() >= agora) { ev.deleteEvent(); removidos++; Utilities.sleep(250); }
    });
  }
  console.log('Blackboard: ' + criados + ' criados, ' + atualizados + ' atualizados, ' +
    removidos + ' removidos, ' + iguais + ' sem alteração.');
}

function criarEvento_(agenda, oc, assinatura) {
  const opcoes = { description: oc.descricao, location: oc.local };
  let ev;
  if (oc.diaInteiro) {
    const dias = Math.max(1, Math.round(oc.duracaoMs / 86400000));
    ev = dias > 1
      ? agenda.createAllDayEvent(oc.titulo, oc.inicio, somarDias_(oc.inicio, dias), opcoes)
      : agenda.createAllDayEvent(oc.titulo, oc.inicio, opcoes);
  } else {
    ev = agenda.createEvent(oc.titulo, oc.inicio, oc.fim, opcoes);
  }
  aplicarLembretes_(ev, lembretesDo_(oc.tipo));
  ev.setColor(oc.tipo === 'entrega' ? CONFIG.COR_ENTREGA : CONFIG.COR_AULA);
  ev.setTag('bbChave', oc.chave);
  ev.setTag('bbHash', assinatura);
}

function sincronizarGrade_(agenda) {
  const props = PropertiesService.getScriptProperties();
  const hash = gerarHash_(JSON.stringify([GRADE_AULAS, CONFIG.LEMBRETES_AULA_MIN, CONFIG.FUSO]));
  if (props.getProperty('GRADE_HASH') === hash) return; // grade não mudou

  // Apaga as séries criadas antes e recria a partir da grade atual.
  JSON.parse(props.getProperty('GRADE_IDS') || '[]').forEach(id => {
    try {
      const serie = agenda.getEventSeriesById(id);
      if (serie) serie.deleteEventSeries();
    } catch (e) { /* série já apagada manualmente */ }
  });

  const novosIds = [];
  GRADE_AULAS.forEach((aula, i) => {
    const primeiroDia = primeiraData_(aula.inicioSemestre, aula.dia, i);
    const inicio = Utilities.parseDate(primeiroDia + ' ' + aula.inicio, CONFIG.FUSO, 'dd/MM/yyyy HH:mm');
    const fim = Utilities.parseDate(primeiroDia + ' ' + aula.fim, CONFIG.FUSO, 'dd/MM/yyyy HH:mm');
    const fimSemestre = Utilities.parseDate(aula.fimSemestre + ' 23:59', CONFIG.FUSO, 'dd/MM/yyyy HH:mm');
    const repeticao = CalendarApp.newRecurrence().addWeeklyRule().until(fimSemestre);
    const serie = agenda.createEventSeries(aula.materia.trim(), inicio, fim, repeticao,
      { location: (aula.sala || '').trim() });
    aplicarLembretes_(serie, CONFIG.LEMBRETES_AULA_MIN);
    serie.setColor(CONFIG.COR_AULA);
    novosIds.push(serie.getId());
    Utilities.sleep(250);
  });

  props.setProperty('GRADE_IDS', JSON.stringify(novosIds));
  props.setProperty('GRADE_HASH', hash);
  console.log('Grade manual: ' + novosIds.length + ' matéria(s) criada(s).');
}

// ---------------------------------------------------------------------------
// VALIDAÇÕES E AUXILIARES
// ---------------------------------------------------------------------------

function validarConfig_() {
  [['LEMBRETES_ENTREGA_MIN', CONFIG.LEMBRETES_ENTREGA_MIN], ['LEMBRETES_AULA_MIN', CONFIG.LEMBRETES_AULA_MIN]]
    .forEach(([nome, lista]) => {
      if (!Array.isArray(lista) || lista.length > 5) {
        throw new Error(nome + ' deve ser uma lista com até 5 valores.');
      }
      lista.forEach(m => {
        if (typeof m !== 'number' || m < 0 || m > 40320 || Math.floor(m) !== m) {
          throw new Error(nome + ': o valor ' + m + ' é inválido. Use minutos inteiros de 0 a 40320.');
        }
      });
    });

  GRADE_AULAS.forEach((a, i) => {
    const n = 'Grade, item ' + (i + 1) + ': ';
    if (!a.materia || !String(a.materia).trim()) throw new Error(n + 'falta o nome da matéria.');
    if (numeroDia_(a.dia) === null) throw new Error(n + 'dia "' + a.dia + '" inválido. Use segunda, terça, ..., domingo.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.inicio || '')) throw new Error(n + 'início deve estar no formato HH:MM (ex.: 19:00).');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.fim || '')) throw new Error(n + 'fim deve estar no formato HH:MM (ex.: 20:40).');
    if (a.fim <= a.inicio) throw new Error(n + 'o horário de fim deve ser depois do início.');
    const ini = dataBr_(a.inicioSemestre), fim = dataBr_(a.fimSemestre);
    if (!ini) throw new Error(n + 'inicioSemestre deve ser uma data válida no formato dd/mm/aaaa.');
    if (!fim) throw new Error(n + 'fimSemestre deve ser uma data válida no formato dd/mm/aaaa.');
    if (fim < ini) throw new Error(n + 'fimSemestre é anterior ao inicioSemestre.');
  });
}

/** Valida dd/mm/aaaa (inclusive 29/02 e dias 30/31) e devolve [a, m, d] comparável. */
function dataBr_(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || '').trim());
  if (!m) return null;
  const d = +m[1], mes = +m[2], a = +m[3];
  const diasNoMes = new Date(a, mes, 0).getDate();
  if (mes < 1 || mes > 12 || d < 1 || d > diasNoMes) return null;
  return a * 10000 + mes * 100 + d;
}

function numeroDia_(texto) {
  const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/-?feira/, '').trim();
  const mapa = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  return mapa.hasOwnProperty(t) ? mapa[t] : null;
}

/** Primeira data (dd/MM/yyyy) a partir de inicioSemestre que cai no dia da semana pedido. */
function primeiraData_(inicioSemestre, dia, indice) {
  const alvo = numeroDia_(dia);
  const base = Utilities.parseDate(inicioSemestre.trim() + ' 12:00', CONFIG.FUSO, 'dd/MM/yyyy HH:mm');
  for (let n = 0; n < 7; n++) {
    const d = somarDias_(base, n);
    if (diaSemana_(d) === alvo) return Utilities.formatDate(d, CONFIG.FUSO, 'dd/MM/yyyy');
  }
  throw new Error('Grade, item ' + (indice + 1) + ': não foi possível calcular a primeira aula.');
}

function lembretesDo_(tipo) {
  return tipo === 'entrega' ? CONFIG.LEMBRETES_ENTREGA_MIN : CONFIG.LEMBRETES_AULA_MIN;
}

function aplicarLembretes_(evOuSerie, minutos) {
  evOuSerie.removeAllReminders();
  minutos.forEach(m => evOuSerie.addPopupReminder(m));
}

/** Dia da semana (0 = domingo) no fuso configurado. */
function diaSemana_(d) {
  return parseInt(Utilities.formatDate(d, CONFIG.FUSO, 'u'), 10) % 7;
}

/** Soma dias mantendo o mesmo horário local no fuso configurado. */
function somarDias_(d, n) {
  const hora = Utilities.formatDate(d, CONFIG.FUSO, 'HH:mm:ss');
  const meioDia = Utilities.parseDate(Utilities.formatDate(d, CONFIG.FUSO, 'yyyy-MM-dd') + ' 12:00:00',
    CONFIG.FUSO, 'yyyy-MM-dd HH:mm:ss');
  const outroDia = Utilities.formatDate(new Date(meioDia.getTime() + n * 86400000), CONFIG.FUSO, 'yyyy-MM-dd');
  return Utilities.parseDate(outroDia + ' ' + hora, CONFIG.FUSO, 'yyyy-MM-dd HH:mm:ss');
}

/** Domingo da semana da data, à meia-noite local. */
function inicioDaSemana_(d) {
  const domingo = somarDias_(d, -diaSemana_(d));
  return Utilities.parseDate(Utilities.formatDate(domingo, CONFIG.FUSO, 'yyyy-MM-dd'), CONFIG.FUSO, 'yyyy-MM-dd');
}

function gerarHash_(texto) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8));
}

function tempoEsgotado_(inicioExecucao) {
  return Date.now() - inicioExecucao > 4.5 * 60 * 1000; // limite do Google é 6 minutos
}
