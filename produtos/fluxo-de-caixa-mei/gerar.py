#!/usr/bin/env python3
"""Gera a planilha "Fluxo de Caixa MEI" (versão limpa e versão demonstração)."""
import sys, random, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.chart import BarChart, LineChart, PieChart, Reference

TEAL, DARK, LIGHT, AMBER, INPUT = '0F766E', '134E4A', 'E6F4F1', 'F59E0B', 'FFF59D'
MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"-"'
PCT = '0.0%;[Red]-0.0%;"-"'
DATE = 'dd/mm/yyyy'
MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
REC = ['Vendas de produtos','Prestação de serviços','Comissões','Aluguéis recebidos','Reembolsos','Outras receitas']
DESP = ['Fornecedores / mercadorias','Aluguel','Energia, água e internet','Impostos (DAS MEI)','Marketing e publicidade','Transporte e combustível','Salários e pró-labore','Equipamentos e manutenção','Taxas bancárias e de cartão','Contador e serviços','Material de escritório','Outras despesas']
FORMAS = ['Pix','Dinheiro','Cartão de crédito','Cartão de débito','Boleto','Transferência']
FIRST, LAST = 5, 504

def f(bold=False, size=10, color='000000', italic=False): return Font(name='Arial', bold=bold, size=size, color=color, italic=italic)
def fill(c): return PatternFill('solid', start_color=c, end_color=c)
thin = Side(style='thin', color='CBD5D1'); BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

def titulo(ws, texto, sub=None, largura=9):
    ws['A1'] = texto; ws['A1'].font = f(True, 16, 'FFFFFF')
    for c in range(1, largura + 1): ws.cell(1, c).fill = fill(DARK); ws.cell(2, c).fill = fill(DARK)
    ws.row_dimensions[1].height = 30
    if sub: ws['A2'] = sub; ws['A2'].font = f(False, 10, 'CDE7E2', True)
    ws['A1'].alignment = Alignment(vertical='center')

def cab(ws, row, textos, col=1):
    for i, t in enumerate(textos):
        c = ws.cell(row, col + i, t); c.font = f(True, 10, 'FFFFFF'); c.fill = fill(TEAL)
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True); c.border = BORDER

def build(demo, saida):
    wb = Workbook()
    ca = wb.active; ca.title = 'Comece Aqui'
    pn = wb.create_sheet('Painel'); la = wb.create_sheet('Lançamentos'); rm = wb.create_sheet('Resumo Mensal')
    pc = wb.create_sheet('Por Categoria'); cf = wb.create_sheet('Configurações')
    for ws, cor in ((ca, AMBER), (pn, TEAL), (la, TEAL), (rm, TEAL), (pc, TEAL), (cf, '64748B')): ws.sheet_properties.tabColor = cor

    # ---------- Configurações ----------
    titulo(cf, 'Configurações', 'Preencha as células amarelas. Você pode renomear categorias e formas de pagamento.', 8)
    for r, (rot, val, fmt) in enumerate([('Nome da empresa', 'Minha Empresa MEI' if not demo else 'Padaria Doce Sabor (exemplo)', None),
                                         ('Ano de referência', 2026, '0'),
                                         ('Saldo inicial do caixa (R$)', 5000 if demo else 0, MONEY)], start=3):
        cf.cell(r, 2, rot).font = f(True)
        c = cf.cell(r, 3, val); c.font = f(color='0000FF'); c.fill = fill(INPUT); c.border = BORDER
        if fmt: c.number_format = fmt
    cf['D4'] = '← altere para o ano que você está controlando'; cf['D4'].font = f(False, 9, '64748B', True)
    cf['D5'] = '← dinheiro que você tinha em 1º de janeiro'; cf['D5'].font = f(False, 9, '64748B', True)
    cab(cf, 8, ['Categorias de receita'], 2); cab(cf, 8, ['Categorias de despesa'], 4); cab(cf, 8, ['Formas de pagamento'], 6)
    for i, v in enumerate(REC): c = cf.cell(9 + i, 2, v); c.font = f(color='0000FF'); c.fill = fill(INPUT); c.border = BORDER
    for i, v in enumerate(DESP): c = cf.cell(9 + i, 4, v); c.font = f(color='0000FF'); c.fill = fill(INPUT); c.border = BORDER
    for i, v in enumerate(FORMAS): c = cf.cell(9 + i, 6, v); c.font = f(color='0000FF'); c.fill = fill(INPUT); c.border = BORDER
    for col, w in zip('ABCDEFG', (3, 32, 30, 34, 4, 24, 4)): cf.column_dimensions[col].width = w
    cf['B23'] = 'Dica: ao renomear uma categoria aqui, ela muda em todas as abas. Lançamentos antigos com o nome antigo precisam ser corrigidos.'
    cf['B23'].font = f(False, 9, '64748B', True)
    wb.defined_names['Receitas'] = DefinedName('Receitas', attr_text="'Configurações'!$B$9:$B$14")
    wb.defined_names['Despesas'] = DefinedName('Despesas', attr_text="'Configurações'!$D$9:$D$20")
    wb.defined_names['Formas'] = DefinedName('Formas', attr_text="'Configurações'!$F$9:$F$14")

    # ---------- Lançamentos ----------
    titulo(la, 'Lançamentos', 'Registre cada entrada e saída. Tipo → Categoria muda sozinha. Pendente vencido fica em vermelho.', 9)
    cab(la, 4, ['Data', 'Tipo', 'Categoria', 'Descrição', 'Forma de pagamento', 'Valor (R$)', 'Status', 'Mês (auto)', 'Ano (auto)'])
    la.row_dimensions[4].height = 28
    for r in range(FIRST, LAST + 1):
        for c in range(1, 8):
            cell = la.cell(r, c); cell.font = f(color='0000FF'); cell.border = BORDER
        la.cell(r, 1).number_format = DATE; la.cell(r, 6).number_format = MONEY
        la.cell(r, 8, f'=IF($A{r}="","",MONTH($A{r}))').font = f(color='64748B')
        la.cell(r, 9, f'=IF($A{r}="","",YEAR($A{r}))').font = f(color='64748B')
        for c in (8, 9): la.cell(r, c).border = BORDER; la.cell(r, c).alignment = Alignment(horizontal='center')
    for col, w in zip('ABCDEFGHI', (13, 11, 30, 38, 20, 16, 12, 10, 10)): la.column_dimensions[col].width = w
    la.freeze_panes = 'A5'; la.auto_filter.ref = f'A4:I{LAST}'
    rng = f'{FIRST}:{LAST}'
    dv_d = DataValidation(type='date', operator='greaterThan', formula1='36526', allow_blank=True, showErrorMessage=True, errorTitle='Data inválida', error='Digite uma data, ex.: 15/03/2026')
    dv_t = DataValidation(type='list', formula1='"Receita,Despesa"', allow_blank=True, showErrorMessage=True, errorTitle='Tipo', error='Escolha Receita ou Despesa')
    dv_c = DataValidation(type='list', formula1=f'=INDIRECT($B{FIRST}&"s")', allow_blank=True, showErrorMessage=True, errorTitle='Categoria', error='Escolha primeiro o Tipo e depois uma categoria da lista')
    dv_f = DataValidation(type='list', formula1='=Formas', allow_blank=True)
    dv_v = DataValidation(type='decimal', operator='greaterThanOrEqual', formula1='0', allow_blank=True, showErrorMessage=True, errorTitle='Valor', error='Digite um valor positivo. O Tipo define se é entrada ou saída.')
    dv_s = DataValidation(type='list', formula1='"Pago,Pendente"', allow_blank=True, showErrorMessage=True, errorTitle='Status', error='Escolha Pago ou Pendente')
    for dv, col in ((dv_d, 'A'), (dv_t, 'B'), (dv_c, 'C'), (dv_f, 'E'), (dv_v, 'F'), (dv_s, 'G')):
        la.add_data_validation(dv); dv.add(f'{col}{FIRST}:{col}{LAST}')
    la.conditional_formatting.add(f'A{FIRST}:G{LAST}', FormulaRule(formula=[f'AND($G{FIRST}="Pendente",$A{FIRST}<>"",$A{FIRST}<TODAY())'], font=Font(name='Arial', color='C00000', bold=True), fill=fill('FDE2E2')))
    la.conditional_formatting.add(f'B{FIRST}:B{LAST}', FormulaRule(formula=[f'$B{FIRST}="Receita"'], font=Font(name='Arial', color='15803D', bold=True)))
    la.conditional_formatting.add(f'B{FIRST}:B{LAST}', FormulaRule(formula=[f'$B{FIRST}="Despesa"'], font=Font(name='Arial', color='B91C1C', bold=True)))

    if demo:
        random.seed(7); linhas = []
        for m in range(1, 12):
            linhas += [(dt.date(2026, m, 3), 'Receita', 'Vendas de produtos', 'Vendas da semana 1', 'Pix', random.randint(3800, 5200), 'Pago'),
                       (dt.date(2026, m, 10), 'Receita', 'Vendas de produtos', 'Vendas da semana 2', 'Cartão de crédito', random.randint(3600, 5000), 'Pago'),
                       (dt.date(2026, m, 18), 'Receita', 'Prestação de serviços', 'Encomendas de festas', 'Pix', random.randint(900, 1800), 'Pago'),
                       (dt.date(2026, m, 5), 'Despesa', 'Aluguel', 'Aluguel do ponto', 'Boleto', 1800, 'Pago'),
                       (dt.date(2026, m, 7), 'Despesa', 'Fornecedores / mercadorias', 'Farinha, açúcar e insumos', 'Transferência', random.randint(2400, 3300), 'Pago'),
                       (dt.date(2026, m, 15), 'Despesa', 'Energia, água e internet', 'Contas do mês', 'Boleto', random.randint(520, 700), 'Pago'),
                       (dt.date(2026, m, 20), 'Despesa', 'Impostos (DAS MEI)', 'DAS do mês', 'Boleto', 85, 'Pago')]
        linhas += [(dt.date(2026, 11, 25), 'Receita', 'Prestação de serviços', 'Buffet de confraternização', 'Pix', 2400, 'Pendente'),
                   (dt.date(2026, 11, 28), 'Despesa', 'Marketing e publicidade', 'Impulsionamento de posts', 'Cartão de crédito', 300, 'Pendente'),
                   (dt.date(2026, 12, 10), 'Despesa', 'Fornecedores / mercadorias', 'Pedido de fim de ano', 'Boleto', 3800, 'Pendente'),
                   (dt.date(2026, 12, 15), 'Receita', 'Vendas de produtos', 'Encomendas de Natal', 'Pix', 6500, 'Pendente')]
    else:
        linhas = [(dt.date(2026, 1, 5), 'Receita', 'Prestação de serviços', 'EXEMPLO: apague esta linha e comece a sua', 'Pix', 1500, 'Pago')]
    for i, row in enumerate(linhas):
        for c, v in enumerate(row, start=1): la.cell(FIRST + i, c, v)

    # ---------- Resumo Mensal ----------
    L = "'Lançamentos'!"; col = lambda c: f"{L}${c}${FIRST}:${c}${LAST}"; ANO = "'Configurações'!$C$4"
    titulo(rm, 'Resumo Mensal', 'Calculado automaticamente a partir dos Lançamentos. Receitas e despesas = só o que está “Pago”.', 9)
    cab(rm, 5, ['Mês', 'Nº', 'Receitas (R$)', 'Despesas (R$)', 'Resultado (R$)', 'Saldo acumulado (R$)', 'A receber (R$)', 'A pagar (R$)', 'Margem %'])
    rm.row_dimensions[5].height = 30
    for i, nome in enumerate(MESES):
        r = 6 + i
        rm.cell(r, 1, nome); rm.cell(r, 2, i + 1)
        base = lambda tipo, st: f'=SUMIFS({col("F")},{col("B")},"{tipo}",{col("G")},"{st}",{col("H")},$B{r},{col("I")},{ANO})'
        rm.cell(r, 3, base('Receita', 'Pago')); rm.cell(r, 4, base('Despesa', 'Pago'))
        rm.cell(r, 5, f'=C{r}-D{r}')
        rm.cell(r, 6, f"='Configurações'!$C$5+E{r}" if i == 0 else f'=F{r-1}+E{r}')
        rm.cell(r, 7, base('Receita', 'Pendente')); rm.cell(r, 8, base('Despesa', 'Pendente'))
        rm.cell(r, 9, f'=IF(C{r}=0,0,E{r}/C{r})')
    rm.cell(18, 1, 'TOTAL DO ANO'); 
    for c in (3, 4, 5, 7, 8): rm.cell(18, c, f'=SUM({chr(64 + c)}6:{chr(64 + c)}17)')
    rm.cell(18, 6, '=F17'); rm.cell(18, 9, '=IF(C18=0,0,E18/C18)')
    for r in range(6, 19):
        for c in range(1, 10):
            cell = rm.cell(r, c); cell.border = BORDER; cell.font = f(r == 18)
            if c in (3, 4, 5, 6, 7, 8): cell.number_format = MONEY
            if c == 9: cell.number_format = PCT
            if c == 2: cell.alignment = Alignment(horizontal='center'); cell.font = f(False, 9, '64748B')
            if r == 18: cell.fill = fill(LIGHT)
    for c, w in zip('ABCDEFGHI', (16, 6, 17, 17, 17, 20, 17, 17, 11)): rm.column_dimensions[c].width = w
    rm['A20'] = 'Saldo acumulado = saldo inicial (Configurações) + resultado de cada mês. “A receber/A pagar” são os lançamentos Pendentes.'
    rm['A20'].font = f(False, 9, '64748B', True); rm.freeze_panes = 'A6'

    # ---------- Por Categoria ----------
    titulo(pc, 'Por Categoria', 'Para onde vai o dinheiro e de onde ele vem (só lançamentos “Pago” do ano de referência).', 4)
    def bloco(top, titulo_b, tipo, itens, col_cfg):
        cab(pc, top, [titulo_b, 'Total do ano (R$)', '% do total'])
        for i in range(len(itens)):
            r = top + 1 + i
            pc.cell(r, 1, f"=IF('Configurações'!{col_cfg}{9 + i}=\"\",\"\",'Configurações'!{col_cfg}{9 + i})")
            pc.cell(r, 2, f'=IF($A{r}="",0,SUMIFS({col("F")},{col("B")},"{tipo}",{col("C")},$A{r},{col("G")},"Pago",{col("I")},{ANO}))')
            tot = top + 1 + len(itens)
            pc.cell(r, 3, f'=IF($B${tot}=0,0,B{r}/$B${tot})')
        tot = top + 1 + len(itens)
        pc.cell(tot, 1, 'TOTAL'); pc.cell(tot, 2, f'=SUM(B{top+1}:B{tot-1})'); pc.cell(tot, 3, f'=SUM(C{top+1}:C{tot-1})')
        for r in range(top + 1, tot + 1):
            for c in (1, 2, 3):
                cell = pc.cell(r, c); cell.border = BORDER; cell.font = f(r == tot)
                if c == 2: cell.number_format = MONEY
                if c == 3: cell.number_format = PCT
                if r == tot: cell.fill = fill(LIGHT)
    bloco(5, 'Receitas por categoria', 'Receita', REC, 'B')
    bloco(15, 'Despesas por categoria', 'Despesa', DESP, 'D')
    for c, w in zip('ABCD', (36, 20, 13, 4)): pc.column_dimensions[c].width = w

    # ---------- Painel ----------
    titulo(pn, 'Painel Financeiro', None, 9)
    pn['A1'] = "=\"Painel Financeiro · \"&'Configurações'!C3&\" · \"&'Configurações'!C4"
    pn['A2'] = 'VERSÃO DE DEMONSTRAÇÃO — todos os dados são fictícios' if demo else 'Atualiza sozinho conforme você preenche a aba Lançamentos.'
    pn['A2'].font = f(True if demo else False, 10, 'FDE68A' if demo else 'CDE7E2', not demo)
    cards = [('B', 'C', 'Receitas do ano', "='Resumo Mensal'!C18", MONEY), ('D', 'E', 'Despesas do ano', "='Resumo Mensal'!D18", MONEY),
             ('F', 'G', 'Resultado do ano', "='Resumo Mensal'!E18", MONEY), ('H', 'I', 'Saldo atual do caixa', "='Resumo Mensal'!F18", MONEY),
             ('B', 'C', 'A receber (pendente)', "='Resumo Mensal'!G18", MONEY), ('D', 'E', 'A pagar (pendente)', "='Resumo Mensal'!H18", MONEY),
             ('F', 'G', 'Margem de lucro', "='Resumo Mensal'!I18", PCT), ('H', 'I', 'Lançamentos registrados', "=COUNT('Lançamentos'!A5:A504)", '0')]
    for k, (c1, c2, rot, frm, fmt) in enumerate(cards):
        r = 4 if k < 4 else 7
        pn.merge_cells(f'{c1}{r}:{c2}{r}'); pn.merge_cells(f'{c1}{r+1}:{c2}{r+1}')
        a = pn[f'{c1}{r}']; a.value = rot; a.font = f(True, 9, '64748B'); a.alignment = Alignment(horizontal='center')
        b = pn[f'{c1}{r+1}']; b.value = frm; b.number_format = fmt; b.font = f(True, 16, DARK); b.alignment = Alignment(horizontal='center', vertical='center')
        for rr in (r, r + 1):
            for cc in (c1, c2): pn[f'{cc}{rr}'].fill = fill(LIGHT)
        pn.row_dimensions[r + 1].height = 30
    for c in 'BCDEFGHI': pn.column_dimensions[c].width = 15
    pn.column_dimensions['A'].width = 2
    ch = BarChart(); ch.type = 'col'; ch.title = 'Receitas x Despesas por mês'; ch.height = 8.5; ch.width = 11.4
    ch.add_data(Reference(rm, min_col=3, max_col=4, min_row=5, max_row=17), titles_from_data=True)
    ch.set_categories(Reference(rm, min_col=1, min_row=6, max_row=17))
    ch.series[0].graphicalProperties.solidFill = '15803D'; ch.series[1].graphicalProperties.solidFill = 'DC2626'
    ln = LineChart(); ln.title = 'Saldo acumulado do caixa'; ln.height = 8.5; ln.width = 11.4
    ln.add_data(Reference(rm, min_col=6, min_row=5, max_row=17), titles_from_data=True)
    ln.set_categories(Reference(rm, min_col=1, min_row=6, max_row=17)); ln.series[0].graphicalProperties.line.solidFill = TEAL; ln.series[0].graphicalProperties.line.width = 28000
    pie = PieChart(); pie.title = 'Despesas por categoria'; pie.height = 10.5; pie.width = 11.4
    pie.add_data(Reference(pc, min_col=2, min_row=15, max_row=27), titles_from_data=True); pie.set_categories(Reference(pc, min_col=1, min_row=16, max_row=27))
    for g in (ch, ln, pie):
        g.roundedCorners = False
        if g.legend: g.legend.overlay = False
        g.title.overlay = False
    for g in (ch, ln):
        g.x_axis.delete = False; g.y_axis.delete = False; g.y_axis.number_format = '#,##0'
    ch.legend.position = 'b'; ln.legend = None; pie.legend.position = 'b'
    pn.add_chart(ch, 'B10'); pn.add_chart(ln, 'F10'); pn.add_chart(pie, 'B28')
    pn['F29'] = 'Como ler este painel'; pn['F29'].font = f(True, 11, DARK)
    for i, t in enumerate(['• Saldo atual = saldo inicial + tudo que já foi pago.', '• “A receber” e “A pagar” mostram o que ainda está pendente.', '• Margem = resultado ÷ receitas.', '• Barras vermelhas acima das verdes = mês no vermelho.', '• Se o saldo (linha) cair por vários meses, reveja despesas.']):
        pn.cell(30 + i, 6, t).font = f(False, 10)
    pn.sheet_view.showGridLines = False

    # ---------- Comece Aqui ----------
    ca.sheet_view.showGridLines = False
    titulo(ca, 'Fluxo de Caixa MEI — Controle Financeiro Completo', 'Entradas, saídas, saldo e painel automático. Sem fórmulas para você mexer.', 8)
    if demo: ca['A2'] = 'VERSÃO DE DEMONSTRAÇÃO — dados fictícios. A versão que você compra vem limpa para preencher.'
    passos = ['1.  Abra a aba “Configurações” e preencha as células amarelas: nome da empresa, ano e saldo inicial do caixa.',
              '2.  (Opcional) Renomeie as categorias e formas de pagamento para o seu negócio.',
              '3.  Na aba “Lançamentos”, registre cada entrada e saída: data, tipo, categoria, descrição, forma, valor e status.',
              '4.  Marque “Pago” quando o dinheiro já entrou/saiu e “Pendente” para o que ainda vai receber ou pagar.',
              '5.  Veja tudo pronto no “Painel”, no “Resumo Mensal” e em “Por Categoria”. Eles se atualizam sozinhos.']
    ca['B4'] = 'Como usar em 5 passos'; ca['B4'].font = f(True, 13, DARK)
    for i, t in enumerate(passos): ca.cell(5 + i, 2, t).font = f(False, 11)
    ca['B11'] = 'Legenda das cores'; ca['B11'].font = f(True, 13, DARK)
    ca['B12'] = 'Célula amarela com letra azul'; ca['B12'].fill = fill(INPUT); ca['B12'].font = f(color='0000FF'); ca['C12'] = '→ você preenche'; ca['C12'].font = f()
    ca['B13'] = 'Célula branca com letra preta/cinza'; ca['B13'].font = f(); ca['C13'] = '→ fórmula automática (não apague)'; ca['C13'].font = f()
    ca['B14'] = 'Linha vermelha em Lançamentos'; ca['B14'].font = f(True, 10, 'C00000'); ca['B14'].fill = fill('FDE2E2'); ca['C14'] = '→ pendente com data já vencida'; ca['C14'].font = f()
    ca['B16'] = 'Dicas'; ca['B16'].font = f(True, 13, DARK)
    for i, t in enumerate(['• Lance todo dia (2 minutos). Quem deixa acumular perde o controle.', '• Valor sempre positivo: o “Tipo” (Receita/Despesa) define se entra ou sai.', '• O saldo atual só considera o que está “Pago”.', '• Comporta até 500 lançamentos por ano. Para mais, copie o arquivo para o ano seguinte.', '• Feito para controle simples de MEI e pequenos negócios. Não substitui o seu contador.']):
        ca.cell(17 + i, 2, t).font = f(False, 11)
    ca['B23'] = 'Suporte:'; ca['B23'].font = f(True, 11); ca['C23'] = '[coloque aqui seu e-mail ou WhatsApp]'; ca['C23'].font = f(False, 11, 'B45309'); ca['C23'].fill = fill(INPUT)
    ca.column_dimensions['A'].width = 3; ca.column_dimensions['B'].width = 40; ca.column_dimensions['C'].width = 60
    for c in 'DEFGH': ca.column_dimensions[c].width = 6
    wb.save(saida)

build(False, 'Fluxo-de-Caixa-MEI.xlsx')
build(True, 'Fluxo-de-Caixa-MEI-DEMO.xlsx')
print('ok')
