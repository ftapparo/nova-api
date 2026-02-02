CREATE OR ALTER PROCEDURE ACESSO_DISPOSITIVO (IDENTIFICADOR VARCHAR(20), DISPOSITIVO INTEGER, FT CHAR(4), SENTIDO CHAR(1))
RETURNS (
	IDENT CHAR(20),
	NUMDISPOSITIVO INTEGER,
	SEQPESSOA INTEGER,
	"NOME" CHAR(40),
	"SEXO" CHAR(1),
	FOTO BLOB,
	PERMITIDO CHAR(1),
	CLASSIPERM VARCHAR(4096),
	PANICO CHAR(1),
	MIDIA CHAR(3),
	TIPO CHAR(1),
	PROP CHAR(1),
	LOC CHAR(1),
	MOR CHAR(1),
	RESP CHAR(1),
	FAMILIAR CHAR(1),
	CLASSIFAUTORIZADA CHAR(1),
	AUTORIZACAOLANC CHAR(1),
	SEQCLASSIFICACAO INTEGER,
	SEQIDACESSO INTEGER,
	NRCARTAO CHAR(10),
	QUADRA CHAR(5),
	LOTE CHAR(5),
	AUTORIZACOES VARCHAR(128),
	DESCRICAO VARCHAR(20),
	"RG" CHAR(15),
	SEQCIRCULACAO INTEGER,
	PREENTRADA CHAR(1),
	DHENTRADA TIMESTAMP,
	DESCMIDIA CHAR(20),
	ACESSOAGORA CHAR(1),
	TICKET CHAR(12),
	CIRCSEQROTA INTEGER,
	CIRCFILTROROTA VARCHAR(1024),
	MOTORISTA CHAR(1),
	SEQVEICULO INTEGER,
	DATANASCIMENTO DATE,
	IDADE INTEGER,
	UNIDRESTR CHAR(1)
)
AS
declare variable VPROP char(1);
declare variable VLOC char(1);
declare variable VMOR char(1);
declare variable VRESP char(1);
declare variable V_WEEKDAY smallint;
declare variable V_ACDOM char(1);
declare variable V_ACSEG char(1);
declare variable V_ACTER char(1);
declare variable V_ACQUA char(1);
declare variable V_ACQUI char(1);
declare variable V_ACSEX char(1);
declare variable V_ACSAB char(1);
declare variable V_ACFERIADOS char(1);
declare variable V_ACDOMINI time;
declare variable V_ACDOMFIM time;
declare variable V_ACSEGINI time;
declare variable V_ACSEGFIM time;
declare variable V_ACTERINI time;
declare variable V_ACTERFIM time;
declare variable V_ACQUAINI time;
declare variable V_ACQUAFIM time;
declare variable V_ACQUIINI time;
declare variable V_ACQUIFIM time;
declare variable V_ACSEXINI time;
declare variable V_ACSEXFIM time;
declare variable V_ACSABINI time;
declare variable V_ACSABFIM time;
declare variable V_ACFERIADOSINI time;
declare variable V_ACFERIADOSFIM time;
declare variable V_SEMRESTRICOESHORARIO char(1);
declare variable OK char(1);
declare variable FERIADO integer;
declare variable CLASSIFPERMITIDAS char(255);
declare variable CLASSIF char(4);
declare variable CLASSIFCAD char(4);
declare variable VAUTORIZACOES varchar(10000);
declare variable VIDENT char(20);
declare variable CONTEMLETRAS char(1);
declare variable IX integer;
declare variable CARACTER char(1);
declare variable V_TICKET char(20);
declare variable STATUS char(1);
declare variable IDCARTAO char(20);
declare variable VULTCIRC integer;
declare variable ULTSEQCIRC integer;
declare variable VDATAHORAENT timestamp;
declare variable VDATAHORASAI timestamp;
declare variable V_IDENT integer;
declare variable CANCELADA char(1);
declare variable BLOQUEADA char(1);
declare variable FILTRO_UNIDADES varchar(2048);
declare variable FILTRO_QUADRAS varchar(2048);
declare variable FILTRO_LOTES varchar(2048);
declare variable F_QUADRA varchar(5);
declare variable F_LOTE varchar(5);
declare variable F_UNIDADE varchar(11);
declare variable FILTRO_VERIFICAR char(1);
declare variable FILTRO_PERMITIR char(1);
declare variable V_SUBPORTARIA char(1);
declare variable VAUTO char(1);
declare variable V_TEMPOVALIDADELEITURA integer;
declare variable V_QUADRA varchar(5);
declare variable V_LOTE varchar(5);
declare variable V_AUTORIZLANC varchar(10000);
declare variable V_AUTORIZPMLR varchar(10000);
declare variable VQTDVINCS integer;
declare variable DEPURAR char(1);
declare variable V_USARFILTRODISP char(1);
declare variable V_FILTRODISP varchar(1024);
declare variable V_FILTRODISPPERMITIR char(1);
declare variable V_BUSCADISP varchar(8);
declare variable V_FILTRODISPPER char(1);
declare variable V_DHSAI timestamp;
declare variable V_TAG char(1);
declare variable VCLASSIF_FAMILIAR integer;
declare variable V_ACDOM2 char(1);
declare variable V_ACSEG2 char(1);
declare variable V_ACTER2 char(1);
declare variable V_ACQUA2 char(1);
declare variable V_ACQUI2 char(1);
declare variable V_ACSEX2 char(1);
declare variable V_ACSAB2 char(1);
declare variable V_ACFERIADOS2 char(1);
declare variable V_ACDOMINI2 time;
declare variable V_ACDOMFIM2 time;
declare variable V_ACSEGINI2 time;
declare variable V_ACSEGFIM2 time;
declare variable V_ACTERINI2 time;
declare variable V_ACTERFIM2 time;
declare variable V_ACQUAINI2 time;
declare variable V_ACQUAFIM2 time;
declare variable V_ACQUIINI2 time;
declare variable V_ACQUIFIM2 time;
declare variable V_ACSEXINI2 time;
declare variable V_ACSEXFIM2 time;
declare variable V_ACSABINI2 time;
declare variable V_ACSABFIM2 time;
declare variable V_ACFERIADOSINI2 time;
declare variable V_ACFERIADOSFIM2 time;
declare variable V_TOLERANCIA char(1);
declare variable V_ADIENT integer;
declare variable V_ADISAI integer;
declare variable V_ATRENT integer;
declare variable V_ATRSAI integer;
declare variable V_TIPOACESSO char(1);
declare variable V_ACIMAHORARIO char(1);
declare variable V_DATAHORA1 timestamp;
declare variable V_DATAHORA2 timestamp;
declare variable V_STATUSCIRC char(1);
declare variable V_ATIVARTOLERANCIA char(1);
declare variable V_CODCLASSVISIT integer;
declare variable V_CODCLASSSERV integer;
declare variable V_CODCLASSENT integer;
declare variable V_MULTIPLO integer;
declare variable VANTIPASSCLASSIF char(1);
declare variable VDTHRAPASSBACK1 timestamp;
declare variable VDTHRAPASSBACK2 timestamp;
declare variable V_FILTROROTA varchar(1024);
declare variable V_SEQROTA integer;
declare variable QTDAUTORIZACOES integer;
declare variable V_PRIMEIROTURNO char(1);
declare variable V_PRIMEIROTURNOINI time;
declare variable V_PRIMEIROTURNOFIM time;
declare variable V_SEGUNDOTURNO char(1);
declare variable V_SEGUNDOTURNOINI time;
declare variable V_SEGUNDOTURNOFIM time;
declare variable V_FERIADOS integer;
declare variable SEQCLASSIFCAD integer;
declare variable V_TIPOCARTAO char(1);
declare variable V_ULTIMA char(1);
declare variable V_STATUSULTIMA char(1);
declare variable V_SEQUNIDADE integer;
declare variable V_UNIDADEMSG varchar(11);
declare variable V_QTDVAGAS integer;
declare variable V_HABAUTFERIADOS char(1);
declare variable V_HABAUT2TURNO char(1);
declare variable ULTIMACIRC timestamp;
declare variable FUNCIONARIO char(1);
declare variable FERIASBLOQACESSO char(1);
declare variable FERIASINIDIA smallint;
declare variable FERIASINIMES smallint;
declare variable FERIASFIMDIA smallint;
declare variable FERIASFIMMES smallint;
declare variable ANO char(4);
declare variable FERIASINICIO char(10);
declare variable FERIASFINAL char(10);
declare variable QRCODE char(1);
declare variable QRCODELIDO varchar(20);
declare variable QRC_HORAINICIAL timestamp;
declare variable QRC_HORAFINAL timestamp;
declare variable QRC_SEQPREAUTORIZACAO integer;
declare variable QRC_TIPOACESSO char(1);
declare variable QRC_ATIVO char(1);
declare variable QRC_VALIDADE integer;
declare variable QRC_VISITANTE char(1);
declare variable QRC_SERVICO char(1);
declare variable QRC_ENTREGA char(1);
declare variable UNIDRESTR_NAOABRIR char(1);
declare variable MENORIDADE_NAOABRIR char(1);
declare variable UNIDADE_COM_RESTR char(1);
declare variable COM_RESTRICOES char(1);
declare variable CVISUAL_ATIVAR char(1);
declare variable V_STATUS varchar(50);
declare variable V_IDACESSO varchar(1);
begin
  V_TIPOCARTAO = ''; DEPURAR = 'N'; V_ULTIMA = 'S'; FUNCIONARIO = 'N'; FERIASBLOQACESSO = 'N'; FERIASINIDIA = 0; FERIASINIMES = 0; FERIASFIMDIA = 0; FERIASFIMMES = 0; UNIDADE_COM_RESTR = 'S'; COM_RESTRICOES = 'S';
  QRCODE = 'N';
  /* se for tag.. */
  if (substring(IDENTIFICADOR from 1 for 1) = 'Y') then
  begin
    V_TAG = 'S';
    IDENTIFICADOR = substring(IDENTIFICADOR from 2 for 19);
  end
  else
    V_TAG = 'N';
  /* se for qrcode */
  QRCODELIDO = trim(IDENTIFICADOR);
  if (((char_length(QRCODELIDO) = 14) and
      (substring(QRCODELIDO from 1 for 1) = 'A') and
      (substring(QRCODELIDO from 14 for 1) = 'F')) or
     ((char_length(QRCODELIDO) = 14) and
      (substring(QRCODELIDO from 1 for 3) = '898') and
      (substring(QRCODELIDO from 12 for 3) = '787'))) then
  begin
    QRCODE = 'S';
    IDENT = IDENTIFICADOR;
  end
  /*Traz classificação de Familiares*/
  select first 1 "CF_Empresa".CODCLASSFAMILIARES, "CF_Empresa".CODCLASSVISIT, "CF_Empresa".CODCLASSSERV,
                 "CF_Empresa".CODCLASSENT, "CF_Empresa".HABAUTFERIADOS, "CF_Empresa".HABAUT2TURNO
  from "CF_Empresa"
  into :VCLASSIF_FAMILIAR, V_CODCLASSVISIT, V_CODCLASSSERV, V_CODCLASSENT, V_HABAUTFERIADOS, V_HABAUT2TURNO;
  /* leitura dos filtros do dispositivo */
  select DISPACESSO.CLASSIFICACOES, trim(DISPACESSO.FILTROUNIDADES), trim(DISPACESSO.FILTROQUADRAS),
         trim(DISPACESSO.FILTROLOTES), DISPACESSO.SUBPORTARIA, DISPACESSO.TEMPOVALIDADELEITURA,
         coalesce(DISPACESSO.UNIDRESTR_NAOABRIR, 'N'),
         coalesce(DISPACESSO.MENORIDADE_NAOABRIR,'N'),
         DISPACESSO.CVISUAL_ATIVAR
  from DISPACESSO
  where DISPACESSO.NUMDISPOSITIVO = :DISPOSITIVO
  into :CLASSIFPERMITIDAS, :FILTRO_UNIDADES, :FILTRO_QUADRAS, :FILTRO_LOTES,
       :V_SUBPORTARIA, :V_TEMPOVALIDADELEITURA, :UNIDRESTR_NAOABRIR, :MENORIDADE_NAOABRIR,
       :CVISUAL_ATIVAR;
  /* inicializacoes */
  if (V_TEMPOVALIDADELEITURA = 0) then
    V_TEMPOVALIDADELEITURA = 10;

  V_BUSCADISP = '#' || trim(cast(:DISPOSITIVO as varchar(6))) || '/';
  V_USARFILTRODISP = 'N'; V_FILTRODISP = ''; V_FILTRODISPPERMITIR = 'S'; FILTRO_PERMITIR = '?';

  if ((FILTRO_UNIDADES = '') and
      (FILTRO_QUADRAS = '') and
      (FILTRO_LOTES = '')) then
    FILTRO_VERIFICAR = 'N';
  else
    FILTRO_VERIFICAR = 'S';

  AUTORIZACOES = ''; VAUTORIZACOES = ''; V_AUTORIZLANC = ''; V_AUTORIZPMLR = ''; CANCELADA = 'N'; BLOQUEADA = 'N';PROP = 'N'; LOC = 'N'; MOR = 'N'; RESP = 'N'; MIDIA = ''; TIPO = '';
  DESCMIDIA = ''; PREENTRADA = 'N'; PERMITIDO = 'N';CLASSIFAUTORIZADA = 'N'; PANICO = 'N'; AUTORIZACAOLANC = 'N'; NUMDISPOSITIVO = DISPOSITIVO; SEQCIRCULACAO = 0; CIRCFILTROROTA = '';
  IDENTIFICADOR = trim(IDENTIFICADOR);
  V_TICKET = '0' || substring(IDENTIFICADOR from 1 for 11);

  if (char_length(IDENTIFICADOR) > 10) then
    IDCARTAO = '-1';
  else
    IDCARTAO = IDENTIFICADOR;
  CONTEMLETRAS = 'N';
  if (QRCODE = 'N') then
  begin
    if (IDENTIFICADOR is null) then
      IDENTIFICADOR = '';
    else
    begin
      IX = 1;
      while (IX <= char_length(IDENTIFICADOR)) do
      begin
        CARACTER = cast(substring(IDENTIFICADOR from IX for 1) as char(1));
        if (CARACTER between 'A' and 'P') then
          CONTEMLETRAS = 'S';
        IX = IX + 1;
      end
    end
    IDENT = IDENTIFICADOR;
    if (CONTEMLETRAS = 'S') then
      IDENT = '999999999';
    else
      IDENT = IDENTIFICADOR;
  end
  SEQPESSOA = 0;
  /*--------------------------------------------------------------------------*/
  /*                 T R A T A M E N T O    D E    Q R C O D E                */
  /*--------------------------------------------------------------------------*/
  if (QRCODE = 'S') then
  begin
    if ( (substring(QRCODELIDO from 1 for 1) = 'A') and (substring(QRCODELIDO from 14 for 1) = 'F')) then
    begin
      select first 1 coalesce(QRCODEATIVO, 'N'), coalesce(INTERVALOQRCODE, 10), coalesce(QRC_ACC_VISITANTE, 'S'),
                     coalesce(QRC_ACC_SERVICO, 'S'), coalesce(QRC_ACC_ENTREGA, 'S')
      from REST_CFG
      into :QRC_ATIVO, :QRC_VALIDADE, :QRC_VISITANTE, :QRC_SERVICO, :QRC_ENTREGA;
      /* ignora se qrcode estiver desativado na configuração */
      if (QRC_ATIVO <> 'S') then
      begin
        PERMITIDO = 'N';
        suspend;
        exit;
      end
      QRC_VALIDADE = QRC_VALIDADE + 2; -- tempo de validade + 2 segundos
      QRC_SEQPREAUTORIZACAO = 0;  PANICO = 'N'; TIPO = 'Q'; MIDIA = 'QRC'; DESCMIDIA = 'QRCode';  VPROP = 'N';  VLOC = 'N'; VMOR = 'N'; VRESP = 'N'; CLASSIFAUTORIZADA = 'N';
      /* busca e valida qrcode */
      select REST_QRCODE.SEQPESSOA, REST_QRCODE.SEQPREAUTORIZACAO, REST_QRCODE.PANICO
      from REST_QRCODE
      where REST_QRCODE.QRCODE = :QRCODELIDO and
            ((REST_QRCODE.SEQPREAUTORIZACAO <> 0) or (REST_QRCODE.SEQPREAUTORIZACAO = 0) and
            (datediff(second from REST_QRCODE.DH to current_timestamp) <= :QRC_VALIDADE))
      into :SEQPESSOA, :QRC_SEQPREAUTORIZACAO, :PANICO;
      /* ignora se a pessoa nao tiver cadastrado e sem convite */
      if ((SEQPESSOA = 0) and
          (QRC_SEQPREAUTORIZACAO = 0)) then
      begin
        PERMITIDO = 'N';
        suspend;
        exit;
      end
      /*-------------- qrcode com pre autorizacao -------------*/
      if (QRC_SEQPREAUTORIZACAO <> 0) then
      begin
        SEQPESSOA = 0;
        select REST_PREAUTORIZACOES.SEQPESSOA, REST_PREAUTORIZACOES.TIPOACESSO, REST_PEDIDOS.HORAINICIAL,
               REST_PEDIDOS.HORAFINAL, REST_PEDIDOS.QUADRA, REST_PEDIDOS.LOTE
        from REST_PREAUTORIZACOES
        inner join REST_PEDIDOS on REST_PREAUTORIZACOES.SEQPEDIDO = REST_PEDIDOS.SEQPEDIDO
        where REST_PREAUTORIZACOES.SEQUENCIA = :QRC_SEQPREAUTORIZACAO
        into :SEQPESSOA, :QRC_TIPOACESSO, :QRC_HORAINICIAL, :QRC_HORAFINAL, :QUADRA, :LOTE;
        /* mesmo que houver um convite, se a pessoa não estiver cadastrada, será
           obrigatório a passagem pelo porteiro para cadastramento da pessoa */
        if (SEQPESSOA = 0) then
        begin
          PERMITIDO = 'N';
          suspend;
          exit;
        end
        /* se acesso visitante, ignorar não estiver autorizado */
        if ((QRC_TIPOACESSO = 'V') and
            (QRC_VISITANTE <> 'S')) then
        begin
          PERMITIDO = 'N';
          suspend;
          exit;
        end
        /* se acesso serviço, ignorar não estiver autorizado */
        if ((QRC_TIPOACESSO = 'S') and
            (QRC_SERVICO <> 'S')) then
        begin
          PERMITIDO = 'N';
          suspend;
          exit;
        end
        /* se acesso entrega, ignorar não estiver autorizado */
        if ((QRC_TIPOACESSO = 'S') and
            (QRC_ENTREGA <> 'S')) then
        begin
          PERMITIDO = 'N';
          suspend;
          exit;
        end
        /* descartar se a hora atual estiver fora da período autorizado */
        if (not(current_timestamp between QRC_HORAINICIAL and QRC_HORAFINAL)) then
        begin
          PERMITIDO = 'N';
          suspend;
          exit;
        end
        PERMITIDO = 'S';
      end
    end
    /*----------- se for uma pessoa associado.. -----------*/
    if ( (substring(QRCODELIDO from 1 for 3) = '898') and (substring(QRCODELIDO from 12 for 3) = '787') ) then
    begin
      SEQPESSOA = substring(QRCODELIDO from 4 for 8);
      QRC_SEQPREAUTORIZACAO = 0;
      PANICO = 'N';
      TIPO = 'Q';
      MIDIA = 'QRC';
      DESCMIDIA = 'QRCode';
      VPROP = 'N';  VLOC = 'N'; VMOR = 'N'; VRESP = 'N';
      CLASSIFAUTORIZADA = 'N';
    end
    select PESSOAS.NOME, PESSOAS.SEXO, PESSOASCLASSIFICACAO.SEQUENCIA, PESSOASCLASSIFICACAO.ACESSOAUTORIZADO,
           PESSOASCLASSIFICACAO.DESCRICAO, PESSOAS.RG, coalesce(PESSOASCLASSIFICACAO.FUNCIONARIO, 'N'),
           PESSOAS.FERIASBLOQACESSO, PESSOAS.FERIASINIDIA, PESSOAS.FERIASINIMES, PESSOAS.FERIASFIMDIA,
           PESSOAS.FERIASFIMMES, PESSOAS.DATANASCIMENTO
    from PESSOAS
    inner join PESSOASCLASSIFICACAO on PESSOASCLASSIFICACAO.SEQUENCIA = PESSOAS.CLASSIFICACAO
    where PESSOAS.SEQUENCIA = :SEQPESSOA
    into :NOME, :SEXO, :SEQCLASSIFICACAO, :CLASSIFAUTORIZADA, :DESCRICAO, :RG, :FUNCIONARIO, :FERIASBLOQACESSO,
         :FERIASINIDIA, :FERIASINIMES, :FERIASFIMDIA, :FERIASFIMMES, :DATANASCIMENTO;
    if (trim(NOME) = '') then
    begin
      PERMITIDO = 'N';
      suspend;
      exit;
    end
    /* verifica vinculos da pessoa */
    for select PESSOASVINC.PROP, PESSOASVINC.LOC, PESSOASVINC.MOR, PESSOASVINC.RESPONSAVEL, PESSOASVINC.AP,
               trim(UNIDADES.QUADRA), trim(UNIDADES.LOTE), trim(UNIDADES.QUADRA) || '-' || trim(UNIDADES.LOTE),
               UNIDADES.COM_RESTRICOES
        from PESSOASVINC
        inner join UNIDADES on PESSOASVINC.SEQUNIDADE = UNIDADES.SEQUENCIA
        where PESSOASVINC.SEQPESSOA = :SEQPESSOA
        into :VPROP, :VLOC, :VMOR, :VRESP, :VAUTO, :F_QUADRA, :F_LOTE, :F_UNIDADE, :COM_RESTRICOES
    do
    begin
      MOR = VMOR; LOC = VLOC; PROP = VPROP;  RESP = VRESP;
      if (COM_RESTRICOES = 'N') then
        UNIDADE_COM_RESTR = 'N';
      if (CLASSIFAUTORIZADA = 'S') then
        PERMITIDO = 'S';
      if ((MOR = 'S') or (PROP = 'S') or (LOC = 'S') or (RESP = 'S')) then
        PERMITIDO = 'S';
      /* aplicar filtros de quadras, lotes ou unidades se estiver configurado */
      if ((VPROP = 'S') or (VLOC = 'S') or (VMOR = 'S') or (VAUTO = 'S') or (VRESP = 'S')) then
      begin
        if (FILTRO_QUADRAS <> '') then
        begin
          if (position(F_QUADRA, FILTRO_QUADRAS) > 0) then
            FILTRO_PERMITIR = 'S';
          else
          if (FILTRO_PERMITIR <> 'S') then
            FILTRO_PERMITIR = 'N';
        end
        if (FILTRO_LOTES <> '') then
        begin
          if (position(F_LOTE, FILTRO_LOTES) > 0) then
            FILTRO_PERMITIR = 'S';
          else
          if (FILTRO_PERMITIR <> 'S') then
            FILTRO_PERMITIR = 'N';
        end
        if (FILTRO_UNIDADES <> '') then
        begin
          if (position(F_UNIDADE, FILTRO_UNIDADES) > 0) then
            FILTRO_PERMITIR = 'S';
          else
          if (FILTRO_PERMITIR <> 'S') then
            FILTRO_PERMITIR = 'N';
        end
      end
      if (FILTRO_PERMITIR = 'N') then
      begin
        VPROP = 'N';  VLOC = 'N';  VMOR = 'N'; VRESP = 'N'; PROP = 'N';
        LOC = 'N'; MOR = 'N'; RESP = 'N';
      end
    end
    --end
  end

  /*--------------------------------------------------------------------------*/
  /*                       FIM DO TRATAMENTO DE QRCODE                        */
  /*--------------------------------------------------------------------------*/

  if (QRCODE = 'N') then
  begin
    /* le idacesso e verifica se eh morador, locatario, proprietario ou classificacao autorizada */
    for select IDACESSO.PANICO, IDACESSO.TIPO, IDACESSO.SEQPESSOA, IDACESSO.SEQUENCIA, PESSOAS.NOME, PESSOAS.SEXO,
               PESSOASCLASSIFICACAO.SEQUENCIA, PESSOASCLASSIFICACAO.ACESSOAUTORIZADO, PESSOASCLASSIFICACAO.DESCRICAO,
               PESSOAS.RG, coalesce(PESSOASCLASSIFICACAO.FUNCIONARIO, 'N'), PESSOAS.FERIASBLOQACESSO,
               PESSOAS.FERIASINIDIA, PESSOAS.FERIASINIMES, PESSOAS.FERIASFIMDIA, PESSOAS.FERIASFIMMES,
               PESSOAS.DATANASCIMENTO, IDACESSO.VEICULO
        from IDACESSO
        inner join PESSOAS on PESSOAS.SEQUENCIA = IDACESSO.SEQPESSOA
        inner join PESSOASCLASSIFICACAO on PESSOASCLASSIFICACAO.SEQUENCIA = PESSOAS.CLASSIFICACAO
        where (cast(IDACESSO.ID as varchar(20)) = cast(:IDENT as varchar(20))) or (IDACESSO.ID2 = :IDENTIFICADOR)
        into :PANICO, :TIPO, :SEQPESSOA, :SEQIDACESSO, :NOME, :SEXO, :SEQCLASSIFICACAO, :CLASSIFAUTORIZADA, :DESCRICAO,
             :RG, :FUNCIONARIO, :FERIASBLOQACESSO, :FERIASINIDIA, :FERIASINIMES, :FERIASFIMDIA, :FERIASFIMMES,
             :DATANASCIMENTO, :SEQVEICULO
    do
    begin
      if ((V_TAG = 'N') or ((V_TAG = 'S') and
          (TIPO = 'Y'))) then
      begin
        if (TIPO in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J')) then
          MIDIA = 'BIO';
        if (TIPO = 'P') then
          MIDIA = 'PRX';
        if (TIPO = 'T') then
          MIDIA = 'KBD';
        if (TIPO = 'Y') then
          MIDIA = 'TAG';
        if (TIPO = 'L') then
          MIDIA = 'LIN';
        VPROP = 'N';
        VLOC = 'N';
        VMOR = 'N';
        VRESP = 'N';
        if (CLASSIFAUTORIZADA = 'S') then
          PERMITIDO = 'S';
        for select PESSOASVINC.PROP, PESSOASVINC.LOC, PESSOASVINC.MOR, PESSOASVINC.RESPONSAVEL, PESSOASVINC.AP,
                   trim(UNIDADES.QUADRA), trim(UNIDADES.LOTE), trim(UNIDADES.QUADRA) || '-' || trim(UNIDADES.LOTE), UNIDADES.COM_RESTRICOES
            from PESSOASVINC
            inner join UNIDADES on PESSOASVINC.SEQUNIDADE = UNIDADES.SEQUENCIA
            where PESSOASVINC.SEQPESSOA = :SEQPESSOA
            into :VPROP, :VLOC, :VMOR, :VRESP, :VAUTO, :F_QUADRA, :F_LOTE, :F_UNIDADE, :COM_RESTRICOES
        do
        begin
          if  (COM_RESTRICOES = 'N') then
            UNIDADE_COM_RESTR = 'N';
          if (VPROP = 'S') then
          begin
            PROP = 'S';
            PERMITIDO = 'S';
          end
          if (VLOC = 'S') then
          begin
            LOC = 'S';
            PERMITIDO = 'S';
          end
          if (VMOR = 'S') then
          begin
            MOR = 'S';
            PERMITIDO = 'S';
          end
          if (VRESP = 'S') then
          begin
            RESP = 'S';
            PERMITIDO = 'S';
          end
          /* se configurado filtro de quadras, lotes ou unidades, verificar para mor/prop/loc */
          if ((VPROP = 'S') or (VLOC = 'S') or (VMOR = 'S') or (VAUTO = 'S') or (VRESP = 'S')) then
          begin
            if (FILTRO_QUADRAS <> '') then
            begin
              if (position(F_QUADRA, FILTRO_QUADRAS) > 0) then
                FILTRO_PERMITIR = 'S';
              else
              if (FILTRO_PERMITIR <> 'S') then
                FILTRO_PERMITIR = 'N';
            end
            if (FILTRO_LOTES <> '') then
            begin
              if (position(F_LOTE, FILTRO_LOTES) > 0) then
                FILTRO_PERMITIR = 'S';
              else
              if (FILTRO_PERMITIR <> 'S') then
                FILTRO_PERMITIR = 'N';
            end
            if (FILTRO_UNIDADES <> '') then
            begin
              if (position(F_UNIDADE, FILTRO_UNIDADES) > 0) then
                FILTRO_PERMITIR = 'S';
              else
              if (FILTRO_PERMITIR <> 'S') then
                FILTRO_PERMITIR = 'N';
            end
          end
          if (FILTRO_PERMITIR = 'N') then
          begin
            VPROP = 'N';
            VLOC = 'N';
            VMOR = 'N';
            VRESP = 'N';
            PROP = 'N';
            LOC = 'N';
            MOR = 'N';
            RESP = 'N';
          end
        end
      end
    end
  end
  /* se nao encontrou o id em idacesso entao
    verifica se eh cartao barras ou proximidade na tabela cartoes */
  if ((PERMITIDO = 'N') and
      (MIDIA = '') and
      (CONTEMLETRAS <> 'S') and
      (V_TAG <> 'S')) then
  begin
    if ((char_length(trim(IDENTIFICADOR))) < 9) then
      IDENTIFICADOR = lpad(trim(IDENTIFICADOR), 9, '0');
    if ((char_length(IDENTIFICADOR)) > 9) then
      IDENTIFICADOR = substring(IDENTIFICADOR from 1 for 9);
    select first 1
                   case
                     when CARTOES.MIDIA = 'P' then 'PRX'
                     else 'BAR'
                   end,
                   CARTOES.TIPO, CARTOES.PESSOA, PESSOAS.CLASSIFICACAO, PESSOASCLASSIFICACAO.ACESSOAUTORIZADO,
                   CARTOES.NRCARTAO, PESSOAS.NOME, PESSOAS.SEXO, PESSOASCLASSIFICACAO.DESCRICAO, PESSOAS.RG,
                   CARTOES.CANCELADA, CARTOES.BLOQUEADA, PESSOASCLASSIFICACAO.FAMILIARES, PESSOAS.PROP, PESSOAS.LOC,
                   PESSOAS.MOR, PESSOAS.RESP, CARTOES.TIPO, coalesce(PESSOASCLASSIFICACAO.FUNCIONARIO, 'N'),
                   PESSOAS.FERIASBLOQACESSO, PESSOAS.FERIASINIDIA, PESSOAS.FERIASINIMES, PESSOAS.FERIASFIMDIA,
                   PESSOAS.FERIASFIMMES, PESSOAS.DATANASCIMENTO
    from CARTOES
    inner join PESSOAS on PESSOAS.SEQUENCIA = CARTOES.PESSOA
    inner join PESSOASCLASSIFICACAO on PESSOAS.CLASSIFICACAO = PESSOASCLASSIFICACAO.SEQUENCIA
    where cast(CARTOES.NRCARTAO as varchar(20)) = :IDENTIFICADOR
    into :MIDIA, :TIPO, :SEQPESSOA, :SEQCLASSIFICACAO, :CLASSIFAUTORIZADA, :NRCARTAO, :NOME, :SEXO, :DESCRICAO, :RG,
         :CANCELADA, :BLOQUEADA, :FAMILIAR, :PROP, :LOC, :MOR, :RESP, :V_TIPOCARTAO, :FUNCIONARIO, :FERIASBLOQACESSO,
         :FERIASINIDIA, :FERIASINIMES, :FERIASFIMDIA, :FERIASFIMMES, :DATANASCIMENTO;
    /*---------------------------------------------------------------------------*/
    if (IDCARTAO <> '-1') then
      select first 1 CIRCULACAO.SEQUENCIA, CIRCULACAO.STATUS, CIRCULACAO.DATAHORAENT, ROTAS.FILTRODISP,
                     CIRCULACAO.ROTA, CIRCULACAO.VEICULO, CIRCULACAO.MOTORISTA
      from CIRCULACAO
      left join ROTAS on ROTAS.SEQUENCIA = coalesce(CIRCULACAO.ROTA, 0)
      where (CIRCULACAO.CARTAO = :IDCARTAO) and
            (CIRCULACAO.DATAHORASAI is null) and
            (CIRCULACAO.ULTIMA = 'S')
      order by 1 desc
      into :SEQCIRCULACAO, :STATUS, :DHENTRADA, :CIRCFILTROROTA, :CIRCSEQROTA, :SEQVEICULO, :MOTORISTA;
    /*---------------------------------------------------------------------------*/
  end
  if (CLASSIFAUTORIZADA = 'S') then
    PERMITIDO = 'S';/* S */
  /* se for subportaria e houver filtro o filtro tera prioridade sobre a classificacao autorizada */
  if ((V_SUBPORTARIA = 'S') and
      (FILTRO_PERMITIR = 'N')) then
    PERMITIDO = 'N';
  /* se for cartao barras/proximidade evs (entrega/visitante/servico).. */
  if ((PERMITIDO = 'N') and
      (MIDIA = '') and
      (V_TAG <> 'S')) then
  begin
    select first (1) CIRCULACAO.SEQUENCIA, CIRCULACAO.STATUS, CIRCULACAO.DATAHORAENT, CIRCULACAO.PESSOA, CARTOES.TIPO,
                     case
                       when CARTOES.MIDIA = 'P' then 'PRX'
                       else 'BAR'
                     end,
                     'S', PESSOAS.NOME, PESSOAS.SEXO, PESSOAS.RG, PESSOASCLASSIFICACAO.DESCRICAO, CIRCULACAO.CARTAO,
                     PESSOAS.CLASSIFICACAO, PESSOASCLASSIFICACAO.FAMILIARES, ROTAS.FILTRODISP, CIRCULACAO.ROTA,
                     CARTOES.TIPO, coalesce(PESSOASCLASSIFICACAO.FUNCIONARIO, 'N'), PESSOAS.FERIASBLOQACESSO,
                     PESSOAS.FERIASINIDIA, PESSOAS.FERIASINIMES, PESSOAS.FERIASFIMDIA, PESSOAS.FERIASFIMMES,
                     PESSOAS.DATANASCIMENTO, CIRCULACAO.VEICULO, CIRCULACAO.MOTORISTA
    from CIRCULACAO
    inner join PESSOAS on PESSOAS.SEQUENCIA = CIRCULACAO.PESSOA
    inner join PESSOASCLASSIFICACAO on PESSOASCLASSIFICACAO.SEQUENCIA = PESSOAS.CLASSIFICACAO
    inner join CARTOES on CIRCULACAO.CARTAO = CARTOES.NRCARTAO
    left join ROTAS on ROTAS.SEQUENCIA = coalesce(CIRCULACAO.ROTA, 0)
    where (CIRCULACAO.CARTAO = :IDCARTAO) and
          (CIRCULACAO.DATAHORASAI is null) and
          (CIRCULACAO.SEQUENCIA = (select max(B.SEQUENCIA)
                                   from CIRCULACAO B
                                   where (B.CARTAO = :IDCARTAO) and
                                         (B.STATUS <> 'B') and
                                         (B.STATUS <> 'C'))) and
          (CIRCULACAO.STATUS <> 'B') and
          (CIRCULACAO.STATUS <> 'C')
    order by 1 desc
    into :SEQCIRCULACAO, :STATUS, :DHENTRADA, :SEQPESSOA, :TIPO, :MIDIA, :PERMITIDO, :NOME, :SEXO, :RG, :DESCRICAO,
         :NRCARTAO, :SEQCLASSIFICACAO, :FAMILIAR, :CIRCFILTROROTA, :CIRCSEQROTA, :V_TIPOCARTAO, :FUNCIONARIO,
         :FERIASBLOQACESSO, :FERIASINIDIA, :FERIASINIMES, :FERIASFIMDIA, :FERIASFIMMES, :DATANASCIMENTO,
         :SEQVEICULO, :MOTORISTA;
    if (SEQCIRCULACAO <> 0) then
    begin
      select DESTINO
      from DESTINOS(:SEQCIRCULACAO)
      into :AUTORIZACOES;
    end
    if (STATUS = 'P') then
      PREENTRADA = 'S';
    else
      PREENTRADA = 'N';
    if (V_TIPOCARTAO = 'P') then
      PREENTRADA = 'N';
    if (PREENTRADA = 'S') then
    begin
      select max(CIRCULACAO.SEQUENCIA)
      from CIRCULACAO
      where (CIRCULACAO.PESSOA = :SEQPESSOA) and
            (CIRCULACAO.STATUS <> 'B') and
            (CIRCULACAO.STATUS <> 'C')
      into :VULTCIRC;
      if (VULTCIRC > SEQCIRCULACAO) then
        PERMITIDO = 'N';
    end
  end
  /* se for ticket.. */
  if ((PERMITIDO = 'N') and
      (MIDIA = '') and
      (V_TAG <> 'S')) then
  begin
    select first 1 CIRCULACAO.SEQUENCIA, CIRCULACAO.STATUS, CIRCULACAO.DATAHORAENT, CIRCULACAO.PESSOA, 'Z', 'Tic', 'S',
                   PESSOAS.NOME, PESSOAS.SEXO, PESSOAS.RG, PESSOASCLASSIFICACAO.DESCRICAO, CIRCULACAO.TICKET,
                   CIRCULACAO.DATAHORASAI, PESSOAS.CLASSIFICACAO, CIRCULACAO.TIPOACESSO,
                   PESSOASCLASSIFICACAO.FAMILIARES, ROTAS.FILTRODISP, CIRCULACAO.ROTA, CIRCULACAO.ULTIMA,
                   coalesce(PESSOASCLASSIFICACAO.FUNCIONARIO, 'N'), PESSOAS.FERIASBLOQACESSO, PESSOAS.FERIASINIDIA,
                   PESSOAS.FERIASINIMES, PESSOAS.FERIASFIMDIA, PESSOAS.FERIASFIMMES, PESSOAS.DATANASCIMENTO,
                   CIRCULACAO.VEICULO, CIRCULACAO.MOTORISTA
    from CIRCULACAO
    inner join PESSOAS on PESSOAS.SEQUENCIA = CIRCULACAO.PESSOA
    inner join PESSOASCLASSIFICACAO on PESSOASCLASSIFICACAO.SEQUENCIA = PESSOAS.CLASSIFICACAO
    left join ROTAS on ROTAS.SEQUENCIA = coalesce(CIRCULACAO.ROTA, 0)
    where (CIRCULACAO.TICKET = :V_TICKET) and
          (CIRCULACAO.STATUS <> 'B') and
          (CIRCULACAO.STATUS <> 'C')
    order by CIRCULACAO.SEQUENCIA desc
    into :SEQCIRCULACAO, :STATUS, :DHENTRADA, :SEQPESSOA, :TIPO, :MIDIA, :PERMITIDO, :NOME, :SEXO, :RG, :DESCRICAO,
         :TICKET, :V_DHSAI, :SEQCLASSIFICACAO, :V_TIPOACESSO, :FAMILIAR, :CIRCFILTROROTA, :CIRCSEQROTA, :V_ULTIMA,
         :FUNCIONARIO, :FERIASBLOQACESSO, :FERIASINIDIA, :FERIASINIMES, :FERIASFIMDIA, :FERIASFIMMES, :DATANASCIMENTO,
         :SEQVEICULO, :MOTORISTA;
    if (SEQCIRCULACAO <> 0) then
    begin
      IDENTIFICADOR = V_TICKET;
      select CIRCULACAO.SEQUENCIA
      from CIRCULACAO
      where (CIRCULACAO.PESSOA = :SEQPESSOA) and
            (CIRCULACAO.ULTIMA = 'S')
      into :VULTCIRC;
      if (VULTCIRC > SEQCIRCULACAO) then
        PERMITIDO = 'N';
      if (V_DHSAI is null) then
        select trim(DESTINO)
        from DESTINOS(:SEQCIRCULACAO)
        into :V_AUTORIZLANC;
      else
        PERMITIDO = 'N';
      SEQCLASSIFCAD = SEQCLASSIFICACAO;
      if (V_TIPOACESSO = 'V') then
        SEQCLASSIFICACAO = V_CODCLASSVISIT;
      if (V_TIPOACESSO = 'S') then
        SEQCLASSIFICACAO = V_CODCLASSSERV;
      if (V_TIPOACESSO = 'E') then
        SEQCLASSIFICACAO = V_CODCLASSENT;
    end
    if (STATUS = 'P') then
      PREENTRADA = 'S';
    else
      PREENTRADA = 'N';
    if (PREENTRADA = 'S') then
    begin
      if (SENTIDO = 'S') then
        PERMITIDO = 'N';
    end
  end

  /* verifica grade de autorizacoes */
  if ((SEQPESSOA > 0) and
      (V_DHSAI is null)) then
  begin
    V_WEEKDAY = extract(weekday from current_date);
    V_FILTRODISPPER = 'N';
    for select ACDOM, ACDOMINI, ACDOMFIM, ACSEG, ACSEGINI, ACSEGFIM, ACTER, ACTERINI, ACTERFIM, ACQUA, ACQUAINI,
               ACQUAFIM, ACQUI, ACQUIINI, ACQUIFIM, ACSEX, ACSEXINI, ACSEXFIM, ACSAB, ACSABINI, ACSABFIM, ACFERIADOS,
               ACFERIADOSINI, ACFERIADOSFIM, SEMRESTRICOESHORARIO, AUTORIZACOES.QUADRA, AUTORIZACOES.LOTE,
               AUTORIZACOES.USARFILTRODISP, AUTORIZACOES.FILTRODISP, ACDOM2, ACDOMINI2, ACDOMFIM2, ACSEG2, ACSEGINI2,
               ACSEGFIM2, ACTER2, ACTERINI2, ACTERFIM2, ACQUA2, ACQUAINI2, ACQUAFIM2, ACQUI2, ACQUIINI2, ACQUIFIM2,
               ACSEX2, ACSEXINI2, ACSEXFIM2, ACSAB2, ACSABINI2, ACSABFIM2, ACFERIADOS2, ACFERIADOSINI2, ACFERIADOSFIM2,
               PESSOASCLASSIFICACAO.ATIVARTOLERANCIA, PESSOASCLASSIFICACAO.ADIMINENT, PESSOASCLASSIFICACAO.ADIMINSAI,
               PESSOASCLASSIFICACAO.ATRMINENT, PESSOASCLASSIFICACAO.ATRMINSAI, PESSOASCLASSIFICACAO.FAMILIARES,
               ROTAS.FILTRODISP, AUTORIZACOES.SEQROTA, coalesce(PESSOASCLASSIFICACAO.FUNCIONARIO, 'N'),
               PESSOAS.FERIASBLOQACESSO, PESSOAS.FERIASINIDIA, PESSOAS.FERIASINIMES, PESSOAS.FERIASFIMDIA,
               PESSOAS.FERIASFIMMES, UNIDADES.COM_RESTRICOES, PESSOAS.DATANASCIMENTO, sta.descricao
        from AUTORIZACOES
        inner join UNIDADES on AUTORIZACOES.QUADRA = UNIDADES.QUADRA and
              AUTORIZACOES.LOTE = UNIDADES.LOTE and
              UNIDADES.BLOQUEAR <> 'S'
        left outer join unidadesstatus sta on sta.sequencia = unidades.status
        inner join PESSOAS on PESSOAS.SEQUENCIA = AUTORIZACOES.PESSOA
        inner join PESSOASCLASSIFICACAO on PESSOASCLASSIFICACAO.SEQUENCIA = PESSOAS.CLASSIFICACAO
        left join ROTAS on ROTAS.SEQUENCIA = coalesce(AUTORIZACOES.SEQROTA, 0)
        where AUTORIZACOES.PESSOA = :SEQPESSOA and
              ((select CHECA_RESPONSAVEL.PERMITIDO
                from CHECA_RESPONSAVEL(AUTORIZACOES.RESPONSAVEL, AUTORIZACOES.QUADRA, AUTORIZACOES.LOTE, 0)) = 'S') and
              AUTORIZACOES.CANCELADO = 'N' and
              ((current_date between AUTORIZACOES.VALIDADEINI and AUTORIZACOES.VALIDADEFIM) or (AUTORIZACOES.PERMANENTE = 'S')) and
              UNIDADES.BLOQUEAR is not null and
              UNIDADES.BLOQUEAR <> 'S'
        into :V_ACDOM, :V_ACDOMINI, :V_ACDOMFIM, :V_ACSEG, :V_ACSEGINI, :V_ACSEGFIM, :V_ACTER, :V_ACTERINI, :V_ACTERFIM,
             :V_ACQUA, :V_ACQUAINI, :V_ACQUAFIM, :V_ACQUI, :V_ACQUIINI, :V_ACQUIFIM, :V_ACSEX, :V_ACSEXINI, :V_ACSEXFIM,
             :V_ACSAB, :V_ACSABINI, :V_ACSABFIM, :V_ACFERIADOS, :V_ACFERIADOSINI, :V_ACFERIADOSFIM,
             :V_SEMRESTRICOESHORARIO, :V_QUADRA, :V_LOTE, :V_USARFILTRODISP, :V_FILTRODISP, :V_ACDOM2, :V_ACDOMINI2,
             :V_ACDOMFIM2, :V_ACSEG2, :V_ACSEGINI2, :V_ACSEGFIM2, :V_ACTER2, :V_ACTERINI2, :V_ACTERFIM2, :V_ACQUA2,
             :V_ACQUAINI2, :V_ACQUAFIM2, :V_ACQUI2, :V_ACQUIINI2, :V_ACQUIFIM2, :V_ACSEX2, :V_ACSEXINI2, :V_ACSEXFIM2,
             :V_ACSAB2, :V_ACSABINI2, :V_ACSABFIM2, :V_ACFERIADOS2, :V_ACFERIADOSINI2, :V_ACFERIADOSFIM2, :V_TOLERANCIA,
             :V_ADIENT, :V_ADISAI, :V_ATRENT, :V_ATRSAI, :FAMILIAR, :V_FILTROROTA, :V_SEQROTA, :FUNCIONARIO,
             :FERIASBLOQACESSO, :FERIASINIDIA, :FERIASINIMES, :FERIASFIMDIA, :FERIASFIMMES, :COM_RESTRICOES, :DATANASCIMENTO, :V_STATUS
    do
    begin
      if (COM_RESTRICOES = 'N') then
        UNIDADE_COM_RESTR = 'N';
      if (V_SEMRESTRICOESHORARIO = 'S') then
      begin
        if (V_USARFILTRODISP = 'S') then
        begin
          if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
            PERMITIDO = 'S';
        end
        else
        begin
          if ((V_SEQROTA is null) or (V_SEQROTA = 0)) then
            PERMITIDO = 'S';
          else
          begin
            if (position(:V_BUSCADISP, :V_FILTROROTA) > 0) then
              PERMITIDO = 'S';
          end
        end
        if ((position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZPMLR) = 0) and
            (position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZLANC) = 0)) then
          V_AUTORIZLANC = trim(V_AUTORIZLANC) || ' ' || trim(V_QUADRA) || '-' || trim(V_LOTE) || ' (' || trim(v_status) || ')';
      end
      else
      begin
        if ((PREENTRADA = 'N') and
            (SEQCIRCULACAO = 0)) then
        begin
          if (V_TOLERANCIA = 'S') then
          begin
            V_PRIMEIROTURNO = null; V_PRIMEIROTURNOINI = null;V_PRIMEIROTURNOFIM = null; V_SEGUNDOTURNO = null; V_SEGUNDOTURNOINI = null; V_SEGUNDOTURNOFIM = null;

            if ((V_HABAUTFERIADOS = 'S') and
                ((V_ACFERIADOS = 'S') or (V_ACFERIADOS2 = 'S'))) then
            begin
              select count(*)
              from FERIADOS
              where (FERIADOS.DATAFERIADO = current_date)
              into :V_FERIADOS;

              if (V_FERIADOS > 0) then
                V_WEEKDAY = 99;
            end

            --SE FOR FERIADO
            if (V_WEEKDAY = 99) then
            begin
              V_PRIMEIROTURNO = V_ACFERIADOS;
              V_PRIMEIROTURNOINI = V_ACFERIADOSINI;
              V_PRIMEIROTURNOFIM = V_ACFERIADOSFIM;
              V_SEGUNDOTURNO = V_ACFERIADOS2;
              V_SEGUNDOTURNOINI = V_ACFERIADOSINI2;
              V_SEGUNDOTURNOFIM = V_ACFERIADOSFIM2;
            end

            --SE FOR DOMINGO
            else
            if (V_WEEKDAY = 0) then
            begin
              V_PRIMEIROTURNO = V_ACDOM;
              V_PRIMEIROTURNOINI = V_ACDOMINI;
              V_PRIMEIROTURNOFIM = V_ACDOMFIM;
              V_SEGUNDOTURNO = V_ACDOM2;
              V_SEGUNDOTURNOINI = V_ACDOMINI2;
              V_SEGUNDOTURNOFIM = V_ACDOMFIM2;
            end

            --SE FOR SEGUNDA
            else
            if (V_WEEKDAY = 1) then
            begin
              V_PRIMEIROTURNO = V_ACSEG;
              V_PRIMEIROTURNOINI = V_ACSEGINI;
              V_PRIMEIROTURNOFIM = V_ACSEGFIM;
              V_SEGUNDOTURNO = V_ACSEG2;
              V_SEGUNDOTURNOINI = V_ACSEGINI2;
              V_SEGUNDOTURNOFIM = V_ACSEGFIM2;
            end

            --SE FOR TERÇA
            else
            if (V_WEEKDAY = 2) then
            begin
              V_PRIMEIROTURNO = V_ACTER;
              V_PRIMEIROTURNOINI = V_ACTERINI;
              V_PRIMEIROTURNOFIM = V_ACTERFIM;
              V_SEGUNDOTURNO = V_ACTER2;
              V_SEGUNDOTURNOINI = V_ACTERINI2;
              V_SEGUNDOTURNOFIM = V_ACTERFIM2;
            end

            --SE FOR QUARTA
            else
            if (V_WEEKDAY = 3) then
            begin
              V_PRIMEIROTURNO = V_ACQUA;
              V_PRIMEIROTURNOINI = V_ACQUAINI;
              V_PRIMEIROTURNOFIM = V_ACQUAFIM;
              V_SEGUNDOTURNO = V_ACQUA2;
              V_SEGUNDOTURNOINI = V_ACQUAINI2;
              V_SEGUNDOTURNOFIM = V_ACQUAFIM2;
            end

            --SE FOR QUINTA
            else
            if (V_WEEKDAY = 4) then
            begin
              V_PRIMEIROTURNO = V_ACQUI;
              V_PRIMEIROTURNOINI = V_ACQUIINI;
              V_PRIMEIROTURNOFIM = V_ACQUIFIM;
              V_SEGUNDOTURNO = V_ACQUI2;
              V_SEGUNDOTURNOINI = V_ACQUIINI2;
              V_SEGUNDOTURNOFIM = V_ACQUIFIM2;
            end

            --SE FOR SEXTA
            else
            if (V_WEEKDAY = 5) then
            begin
              V_PRIMEIROTURNO = V_ACSEX;
              V_PRIMEIROTURNOINI = V_ACSEXINI;
              V_PRIMEIROTURNOFIM = V_ACSEXFIM;
              V_SEGUNDOTURNO = V_ACSEX2;
              V_SEGUNDOTURNOINI = V_ACSEXINI2;
              V_SEGUNDOTURNOFIM = V_ACSEXFIM2;
            end

            --SE FOR SABADO
            else
            if (V_WEEKDAY = 6) then
            begin
              V_PRIMEIROTURNO = V_ACSAB;
              V_PRIMEIROTURNOINI = V_ACSABINI;
              V_PRIMEIROTURNOFIM = V_ACSABFIM;
              V_SEGUNDOTURNO = V_ACSAB2;
              V_SEGUNDOTURNOINI = V_ACSABINI2;
              V_SEGUNDOTURNOFIM = V_ACSABFIM2;
            end

            --SE ESTIVER MARCADO PRIMEIRO TURNO
            if (V_PRIMEIROTURNO = 'S') then
            begin
              --SE A HORA 'AGORA' ESTA ENTRE OS PERIODOS PERMITIDOS PARA PRIMEIRO TURNO
              if ((current_time between(UDF_INCMINUTE(V_PRIMEIROTURNOINI, V_ADIENT * -1)) and (UDF_INCMINUTE(V_PRIMEIROTURNOINI, V_ATRENT))) or (current_time between(UDF_INCMINUTE(V_PRIMEIROTURNOFIM, V_ADISAI * -1)) and (UDF_INCMINUTE(V_PRIMEIROTURNOFIM, V_ATRSAI)))) then
              begin
                --SE TIVER FILTRODISP
                if (V_USARFILTRODISP = 'S') then
                begin
                  --SE EXISTIR O DISP DENTRO DO FILTRO
                  if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
                    --ACESSO PERMITIDO
                    PERMITIDO = 'S';
                end
                else
                  begin
                    --CASO NAO TENHA FILTRODISP, ACESSO PERMITIDO
                    if ((V_SEQROTA is null) or (V_SEQROTA = 0)) then
                      PERMITIDO = 'S';
                    else
                      begin
                        if (position(:V_BUSCADISP, :V_FILTROROTA) > 0) then
                          PERMITIDO = 'S';
                      end
                  end
                if ((position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZPMLR) = 0) and
                    (position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZLANC) = 0)) then
                  V_AUTORIZLANC = trim(V_AUTORIZLANC) || ' ' || trim(V_QUADRA) || '-' || trim(V_LOTE) || ' (' || trim(v_status) || ')';
              end
            end
            --SE ESTIVER MARCADO SEGUNDO TURNO
            if ((V_HABAUT2TURNO = 'S') and
                (V_SEGUNDOTURNO = 'S')) then
            begin
              --SE A HORA 'AGORA' ESTA ENTRE OS PERIODOS PERMITIDOS PARA DOMINGO SEGUNDO TURNO
              if ((current_time between(UDF_INCMINUTE(V_SEGUNDOTURNOINI, V_ADIENT * -1)) and (UDF_INCMINUTE(V_SEGUNDOTURNOINI, V_ATRENT))) or (current_time between(UDF_INCMINUTE(V_SEGUNDOTURNOFIM, V_ADISAI * -1)) and (UDF_INCMINUTE(V_SEGUNDOTURNOFIM, V_ATRSAI)))) then
              begin
                --SE TIVER FILTRODISP
                if (V_USARFILTRODISP = 'S') then
                begin
                  --SE EXISTIR O DISP DENTRO DO FILTRO
                  if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
                    --ACESSO PERMITIDO
                    PERMITIDO = 'S';
                end
                else
                  begin
                    --CASO NAO TENHA FILTRODISP, ACESSO PERMITIDO
                    if ((V_SEQROTA is null) or (V_SEQROTA = 0)) then
                      PERMITIDO = 'S';
                    else
                      begin
                        if (position(:V_BUSCADISP, :V_FILTROROTA) > 0) then
                          PERMITIDO = 'S';
                      end
                  end

                if ((position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZPMLR) = 0) and
                    (position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZLANC) = 0)) then
                  V_AUTORIZLANC = trim(V_AUTORIZLANC) || ' ' || trim(V_QUADRA) || '-' || trim(V_LOTE) || ' (' || trim(v_status) || ')';
              end
            end

          end
          else
          begin
            V_PRIMEIROTURNO = null;
            V_PRIMEIROTURNOINI = null;
            V_PRIMEIROTURNOFIM = null;
            V_SEGUNDOTURNO = null;
            V_SEGUNDOTURNOINI = null;
            V_SEGUNDOTURNOFIM = null;

            --SE FOR DOMINGO
            if (V_WEEKDAY = 0) then
            begin
              V_PRIMEIROTURNO = V_ACDOM;
              V_PRIMEIROTURNOINI = V_ACDOMINI;
              V_PRIMEIROTURNOFIM = V_ACDOMFIM;
              V_SEGUNDOTURNO = V_ACDOM2;
              V_SEGUNDOTURNOINI = V_ACDOMINI2;
              V_SEGUNDOTURNOFIM = V_ACDOMFIM2;
            end

            --SE FOR SEGUNDA
            else
            if (V_WEEKDAY = 1) then
            begin
              V_PRIMEIROTURNO = V_ACSEG;
              V_PRIMEIROTURNOINI = V_ACSEGINI;
              V_PRIMEIROTURNOFIM = V_ACSEGFIM;
              V_SEGUNDOTURNO = V_ACSEG2;
              V_SEGUNDOTURNOINI = V_ACSEGINI2;
              V_SEGUNDOTURNOFIM = V_ACSEGFIM2;
            end

            --SE FOR TERÇA
            else
            if (V_WEEKDAY = 2) then
            begin
              V_PRIMEIROTURNO = V_ACTER;
              V_PRIMEIROTURNOINI = V_ACTERINI;
              V_PRIMEIROTURNOFIM = V_ACTERFIM;
              V_SEGUNDOTURNO = V_ACTER2;
              V_SEGUNDOTURNOINI = V_ACTERINI2;
              V_SEGUNDOTURNOFIM = V_ACTERFIM2;
            end

            --SE FOR QUARTA
            else
            if (V_WEEKDAY = 3) then
            begin
              V_PRIMEIROTURNO = V_ACQUA;
              V_PRIMEIROTURNOINI = V_ACQUAINI;
              V_PRIMEIROTURNOFIM = V_ACQUAFIM;
              V_SEGUNDOTURNO = V_ACQUA2;
              V_SEGUNDOTURNOINI = V_ACQUAINI2;
              V_SEGUNDOTURNOFIM = V_ACQUAFIM2;
            end

            --SE FOR QUINTA
            else
            if (V_WEEKDAY = 4) then
            begin
              V_PRIMEIROTURNO = V_ACQUI;
              V_PRIMEIROTURNOINI = V_ACQUIINI;
              V_PRIMEIROTURNOFIM = V_ACQUIFIM;
              V_SEGUNDOTURNO = V_ACQUI2;
              V_SEGUNDOTURNOINI = V_ACQUIINI2;
              V_SEGUNDOTURNOFIM = V_ACQUIFIM2;
            end

            --SE FOR SEXTA
            else
            if (V_WEEKDAY = 5) then
            begin
              V_PRIMEIROTURNO = V_ACSEX;
              V_PRIMEIROTURNOINI = V_ACSEXINI;
              V_PRIMEIROTURNOFIM = V_ACSEXFIM;
              V_SEGUNDOTURNO = V_ACSEX2;
              V_SEGUNDOTURNOINI = V_ACSEXINI2;
              V_SEGUNDOTURNOFIM = V_ACSEXFIM2;
            end

            --SE FOR SABADO
            else
            if (V_WEEKDAY = 6) then
            begin
              V_PRIMEIROTURNO = V_ACSAB;
              V_PRIMEIROTURNOINI = V_ACSABINI;
              V_PRIMEIROTURNOFIM = V_ACSABFIM;
              V_SEGUNDOTURNO = V_ACSAB2;
              V_SEGUNDOTURNOINI = V_ACSABINI2;
              V_SEGUNDOTURNOFIM = V_ACSABFIM2;
            end

            --SE ESTIVER MARCADO PRIMEIRO TURNO
            if (V_PRIMEIROTURNO = 'S') then
            begin
              --SE A HORA 'AGORA' ESTA DENTRO DO HORARIO PARA PRIMEIRO TURNO
              if ((current_time >= UDF_INCMINUTE(V_PRIMEIROTURNOINI, V_ADIENT * -1)) and
                  (current_time <= UDF_INCMINUTE(V_PRIMEIROTURNOFIM, V_ATRSAI))) then
              begin
                --SE TIVER FILTRODISP
                if (V_USARFILTRODISP = 'S') then
                begin
                  --SE EXISTIR O DISP DENTRO DO FILTRO
                  if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
                    --ACESSO PERMITIDO
                    PERMITIDO = 'S';
                end
                else
                  begin
                    --CASO NAO TENHA FILTRODISP, ACESSO PERMITIDO
                    if ((V_SEQROTA is null) or (V_SEQROTA = 0)) then
                      PERMITIDO = 'S';
                    else
                      begin
                        if (position(:V_BUSCADISP, :V_FILTROROTA) > 0) then
                          PERMITIDO = 'S';
                      end
                  end

                if ((position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZPMLR) = 0) and
                    (position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZLANC) = 0)) then
                  V_AUTORIZLANC = trim(V_AUTORIZLANC) || ' ' || trim(V_QUADRA) || '-' || trim(V_LOTE) || ' (' || trim(v_status) || ')';
              end
            end
            --SE ESTIVER MARCADO SEGUNDO TURNO
            if ((V_HABAUT2TURNO = 'S') and
                (V_SEGUNDOTURNO = 'S')) then
            begin
              --SE A HORA 'AGORA' ESTA DENTRO DO HORARIO PARA SEGUNDO TURNO
              if ((current_time >= UDF_INCMINUTE(V_SEGUNDOTURNOINI, V_ADIENT * -1)) and
                  (current_time <= UDF_INCMINUTE(V_SEGUNDOTURNOFIM, V_ATRSAI))) then
              begin
                --SE TIVER FILTRODISP
                if (V_USARFILTRODISP = 'S') then
                begin
                  --SE EXISTIR O DISP DENTRO DO FILTRO
                  if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
                    --ACESSO PERMITIDO
                    PERMITIDO = 'S';
                end
                else
                  begin
                    --CASO NAO TENHA FILTRODISP, ACESSO PERMITIDO
                    if ((V_SEQROTA is null) or (V_SEQROTA = 0)) then
                      PERMITIDO = 'S';
                    else
                      begin
                        if (position(:V_BUSCADISP, :V_FILTROROTA) > 0) then
                          PERMITIDO = 'S';
                      end
                  end

                if ((position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZPMLR) = 0) and
                    (position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZLANC) = 0)) then
                  V_AUTORIZLANC = trim(V_AUTORIZLANC) || ' ' || trim(V_QUADRA) || '-' || trim(V_LOTE) || ' (' || trim(v_status) || ')';
              end
            end

          end
        end
        else
        begin
          if (V_USARFILTRODISP = 'S') then
          begin
            if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
              PERMITIDO = 'S';
          end
          else
            PERMITIDO = 'S';
          if ((position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZPMLR) = 0) and
              (position(trim(V_QUADRA) || '-' || trim(V_LOTE), V_AUTORIZLANC) = 0)) then
            V_AUTORIZLANC = trim(V_AUTORIZLANC) || ' ' || trim(V_QUADRA) || '-' || trim(V_LOTE) || ' (' || trim(v_status) || ')';
        end
      end
    end
    if ((PERMITIDO = 'S') and
        (trim(V_AUTORIZLANC) <> '')) then
      AUTORIZACAOLANC = 'S';
  end
  /* verifica se o cartao cancelado ou bloqueado */
  if ((CANCELADA = 'S') or (BLOQUEADA = 'S')) then
  begin
    PERMITIDO = 'N';
    MIDIA = 'BAR';
  end
  /* se pessoa localizada */
  if (SEQPESSOA <> 0) then
  begin
    /* identifica uma quadra e lote qdo for mor/prop/loc/resp */
    V_AUTORIZPMLR = '';
    for select UNIDADES.QUADRA, UNIDADES.LOTE, sta.descricao, UNIDADES.COM_RESTRICOES, PESSOAS.DATANASCIMENTO
        from UNIDADES
        inner join PESSOASVINC on PESSOASVINC.SEQUNIDADE = UNIDADES.SEQUENCIA
        inner join PESSOAS on PESSOAS.SEQUENCIA = PESSOASVINC.SEQPESSOA
        left outer join unidadesstatus sta on sta.sequencia = unidades.status
        where PESSOASVINC.SEQPESSOA = :SEQPESSOA and
              (PESSOASVINC.PROP = 'S' or PESSOASVINC.LOC = 'S' or PESSOASVINC.MOR = 'S' or PESSOASVINC.RESPONSAVEL = 'S' or PESSOAS.CLASSIFICACAO = :VCLASSIF_FAMILIAR)
        order by PESSOASVINC.MOR desc, PESSOASVINC.LOC desc, PESSOASVINC.PROP desc
        into :V_QUADRA, :V_LOTE, :V_STATUS, :COM_RESTRICOES, :DATANASCIMENTO
    do
    begin
      if (COM_RESTRICOES = 'N') then
        UNIDADE_COM_RESTR = 'N';
      if (V_AUTORIZPMLR = '') then
      begin
        QUADRA = trim(V_QUADRA);
        LOTE = trim(V_LOTE);
      end
      if ((position(trim(V_QUADRA) || '-' || trim(V_LOTE), trim(V_AUTORIZPMLR)) = 0) and
          (position(trim(V_QUADRA) || '-' || trim(V_LOTE), trim(V_AUTORIZLANC)) = 0)) then
        V_AUTORIZPMLR = trim(V_AUTORIZPMLR) || ' ' || trim(V_QUADRA) || '-' || trim(V_LOTE) || ' (' || trim(v_status) || ')';
    end
    /* carrega a foto qdo for solicitado */
    if (FT = 'FOTO') then
      select PESSOAS.FOTO
      from PESSOAS
      where PESSOAS.SEQUENCIA = :SEQPESSOA
      into :FOTO;
  end
  /* se permitido em todos quisitos entao verifica se esta permitido para este dispositivo */
  if (PERMITIDO = 'S') then
  begin
    /* levanta todas unidades que ele tem autorizacao para
     executar os filtros de unidades */
    if ((MOR <> 'S') and
        (PROP <> 'S') and
        (LOC <> 'S') and
        (RESP <> 'S')) then
    begin
      for select trim(UNIDADES.QUADRA), trim(UNIDADES.LOTE), trim(UNIDADES.QUADRA) || '-' || trim(UNIDADES.LOTE),
                 AUTORIZACOES.USARFILTRODISP, AUTORIZACOES.FILTRODISP, UNIDADES.COM_RESTRICOES
          from AUTORIZACOES
          inner join UNIDADES on UNIDADES.QUADRA = AUTORIZACOES.QUADRA and
                UNIDADES.LOTE = AUTORIZACOES.LOTE
          left join PESSOAS on AUTORIZACOES.RESPONSAVEL = PESSOAS.SEQUENCIA
          where PESSOA = :SEQPESSOA and
                AUTORIZACOES.CANCELADO = 'N' and
                ((select CHECA_RESPONSAVEL.PERMITIDO
                  from CHECA_RESPONSAVEL(AUTORIZACOES.RESPONSAVEL, AUTORIZACOES.QUADRA, AUTORIZACOES.LOTE, 0)) = 'S') and
                ((current_date between AUTORIZACOES.VALIDADEINI and AUTORIZACOES.VALIDADEFIM) or (AUTORIZACOES.PERMANENTE = 'S'))
          order by AUTORIZACOES.QUADRA, AUTORIZACOES.LOTE
          into :F_QUADRA, :F_LOTE, :F_UNIDADE, :V_USARFILTRODISP, :V_FILTRODISP, :COM_RESTRICOES
      do
      begin
        if (COM_RESTRICOES = 'N') then
          UNIDADE_COM_RESTR = 'N';
        if (FILTRO_QUADRAS <> '') then
        begin
          if (UDF_POS(F_QUADRA, FILTRO_QUADRAS) > 0) then
            FILTRO_PERMITIR = 'S';
          else
          if (FILTRO_PERMITIR <> 'S') then
            FILTRO_PERMITIR = 'N';
        end
        if (FILTRO_LOTES <> '') then
        begin
          if (UDF_POS(F_LOTE, FILTRO_LOTES) > 0) then
            FILTRO_PERMITIR = 'S';
          else
          if (FILTRO_PERMITIR <> 'S') then
            FILTRO_PERMITIR = 'N';
        end
        if (FILTRO_UNIDADES <> '') then
        begin
          if (UDF_POS(F_UNIDADE, FILTRO_UNIDADES) > 0) then
            FILTRO_PERMITIR = 'S';
          else
          if (FILTRO_PERMITIR <> 'S') then
            FILTRO_PERMITIR = 'N';
        end
        if (V_USARFILTRODISP = 'S') then
          if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
            V_FILTRODISPPER = 'S';
        if (V_USARFILTRODISP = 'S') then
          if (position(:V_BUSCADISP, :V_FILTRODISP) > 0) then
            V_FILTRODISPPER = 'S';
      end
      VAUTORIZACOES = trim(trim(AUTORIZACOES) || ' ' || trim(VAUTORIZACOES));
      if (char_length(VAUTORIZACOES) > 128) then
        VAUTORIZACOES = substring(VAUTORIZACOES from 1 for 126) || '..';
      AUTORIZACOES = VAUTORIZACOES;
    end
  end
  if (MIDIA = 'QRC') then
    DESCMIDIA = 'QRCode';
  else
  if (MIDIA = 'BAR') then
    DESCMIDIA = 'Codigo de Barras';
  else
  if (upper(MIDIA) = 'TIC') then
    DESCMIDIA = 'Ticket';
  else
  if (MIDIA = 'PRX') then
    DESCMIDIA = 'Proximidade';
  else
  if (MIDIA = 'BIO') then
    DESCMIDIA = 'Biometria';
  else
  if (MIDIA = 'KBD') then
    DESCMIDIA = 'Teclado';
  else
  if (MIDIA = 'TAG') then
    DESCMIDIA = 'TAG';
  else
  if (MIDIA = 'LIN') then
    DESCMIDIA = 'LIN';
  else
    DESCMIDIA = 'Midia Indefinida';
  ACESSOAGORA = 'N';
  ULTSEQCIRC = 0;
  select first 1 CIRCULACAO.SEQUENCIA, DATAHORAENT, DATAHORASAI
  from CIRCULACAO
  where (CIRCULACAO.PESSOA = :SEQPESSOA) and
        (CIRCULACAO.ULTIMA = 'S')
  into :ULTSEQCIRC, :VDATAHORAENT, :VDATAHORASAI;
  if (ULTSEQCIRC > 0) then
  begin
    if ((VDATAHORAENT is not null) and
        (VDATAHORAENT <= current_timestamp) and
        (datediff(second from :VDATAHORAENT to current_timestamp) < :V_TEMPOVALIDADELEITURA)) then
      ACESSOAGORA = 'S';
    if ((VDATAHORASAI is not null) and
        (VDATAHORASAI <= current_timestamp) and
        (datediff(second from :VDATAHORASAI to current_timestamp) < :V_TEMPOVALIDADELEITURA)) then
      ACESSOAGORA = 'S';
  end
  ULTSEQCIRC = 0;
  select first 1 CIRCULACAODISP.SEQUENCIA, CIRCULACAODISP.DATAHORA
  from CIRCULACAODISP
  where (CIRCULACAODISP.PESSOA = :SEQPESSOA)
  order by CIRCULACAODISP.SEQUENCIA desc
  into :ULTSEQCIRC, :ULTIMACIRC;
  if ((ULTSEQCIRC > 0) and
      (ULTIMACIRC <= current_timestamp) and
      (datediff(second from :ULTIMACIRC to current_timestamp) < :V_TEMPOVALIDADELEITURA)) then
    ACESSOAGORA = 'S';
  ULTSEQCIRC = 0;
  ULTIMACIRC = current_timestamp;
  select first 1 CIRCULACAOSUB.SEQUENCIA, CIRCULACAOSUB.DATAHORA
  from CIRCULACAOSUB
  where (CIRCULACAOSUB.SEQPESSOA = :SEQPESSOA)
  order by CIRCULACAOSUB.SEQUENCIA desc
  into :ULTSEQCIRC, :ULTIMACIRC;
  if ((ULTSEQCIRC > 0) and
      (datediff(second from :ULTIMACIRC to current_timestamp) < :V_TEMPOVALIDADELEITURA)) then
    ACESSOAGORA = 'S';
  /* pega os destinos se for visitante (externo), servico ou entrega */
  if ((FILTRO_VERIFICAR = 'S') and
      ((FILTRO_PERMITIR = '?') or (FILTRO_PERMITIR = 'N')) and
      (SEQCIRCULACAO <> 0)) then
  begin
    AUTORIZACOES = '';
    VAUTORIZACOES = '';
    for select trim(UNIDADES.QUADRA), trim(UNIDADES.LOTE), trim(UNIDADES.QUADRA) || '-' || trim(UNIDADES.LOTE) || ' ', :COM_RESTRICOES
        from CIRCULACAODEST
        inner join UNIDADES on CIRCULACAODEST.SEQUNIDADE = UNIDADES.SEQUENCIA
        where CIRCULACAODEST.SEQCIRCULACAO = :SEQCIRCULACAO
        into :F_QUADRA, :F_LOTE, :F_UNIDADE, :COM_RESTRICOES
    do
    begin
      if (COM_RESTRICOES = 'N') then
        UNIDADE_COM_RESTR = 'N';
      VAUTORIZACOES = trim(VAUTORIZACOES) || ' ' || F_UNIDADE;
      if (FILTRO_QUADRAS <> '') then
      begin
        if (UDF_POS(F_QUADRA, FILTRO_QUADRAS) > 0) then
          FILTRO_PERMITIR = 'S';
        else
        if (FILTRO_PERMITIR <> 'S') then
          FILTRO_PERMITIR = 'N';
      end
      if (FILTRO_LOTES <> '') then
      begin
        if (UDF_POS(F_LOTE, FILTRO_LOTES) > 0) then
          FILTRO_PERMITIR = 'S';
        else
        if (FILTRO_PERMITIR <> 'S') then
          FILTRO_PERMITIR = 'N';
      end
      if (FILTRO_UNIDADES <> '') then
      begin
        if (UDF_POS(F_UNIDADE, FILTRO_UNIDADES) > 0) then
          FILTRO_PERMITIR = 'S';
        else
        if (FILTRO_PERMITIR <> 'S') then
          FILTRO_PERMITIR = 'N';
      end
    end
    if (char_length(VAUTORIZACOES) > 128) then
      VAUTORIZACOES = substring(VAUTORIZACOES from 1 for 126) || '..';
    AUTORIZACOES = VAUTORIZACOES;
  end
  /* aplica o filtro se houver */
  if ((FILTRO_VERIFICAR = 'S') and
      (FILTRO_PERMITIR = 'N')) then
  begin
    PERMITIDO = 'N';
    MOR = 'N';
    PROP = 'N';
    LOC = 'N';
  end
  if ((FILTRO_VERIFICAR = 'S') and
      (FILTRO_PERMITIR = 'S')) then
    PERMITIDO = 'S';
  AUTORIZACOES = substring((trim(V_AUTORIZPMLR) || ' ' || trim(V_AUTORIZLANC)) from 1 for 128);
  if ((CLASSIFAUTORIZADA = 'S') and
      (PERMITIDO = 'S')) then
  begin
    select count(*)
    from PESSOASVINC QTDVINC
    where QTDVINC.SEQPESSOA = :SEQPESSOA
    into :VQTDVINCS;
    if (VQTDVINCS = 0) then
      PERMITIDO = 'N';
  end
  if (PERMITIDO = 'S') then
    IDENT = IDENTIFICADOR;
  /*---Verifica se o ticket ja foi dado baixa 1 vez e bloqueia novas baixas---*/
  if ((PERMITIDO = 'S') and
      (MIDIA = 'BAR') and
      (PREENTRADA = 'N')) then
  begin
    V_DATAHORA1 = null;
    V_DATAHORA2 = null;

    select count(*)
    from TICKETVALIDADE
    where NRTICKET = :V_TICKET and
          TIPOENTRADA = 'M' and
          (current_timestamp between TICKETVALIDADE.VALIDADE_DE and TICKETVALIDADE.VALIDADE_ATE)
    into :V_MULTIPLO;

    if (V_MULTIPLO = 0) then
    begin
      select CIRCULACAO.DATAHORASAI, CIRCULACAO.STATUS
      from CIRCULACAO
      where (CIRCULACAO.TICKET = :V_TICKET) and
            (CIRCULACAO.ULTIMA = 'S')
      into :V_DATAHORA1, :V_STATUSCIRC;
      select CIRCULACAO.DATAHORASAI
      from CIRCULACAO
      where (CIRCULACAO.PESSOA = :SEQPESSOA) and
            (CIRCULACAO.ULTIMA = 'S')
      into :V_DATAHORA2;

      if (V_DATAHORA2 > V_DATAHORA1) then
        PERMITIDO = 'N';

      if ((V_STATUSCIRC = 'S') and
          (V_DATAHORA1 = V_DATAHORA2)) then
        PERMITIDO = 'N';
    end
  end

  /*---------------------------------------------------------------------------*/
  if (MIDIA = 'TAG') then
  begin
    select IDACESSO.TIPOUSO
    from IDACESSO
    where (IDACESSO.ID2 = :IDENTIFICADOR)
    into :V_IDACESSO;

    if (V_IDACESSO = 'B') then
      PERMITIDO = 'N';
      suspend;
      exit;
  end

  /*---------------------------------------------------------------------------*/
  if ((PERMITIDO = 'S') and
      (PREENTRADA = 'N')) then
  begin
    V_ATIVARTOLERANCIA = '';

    select PESSOASCLASSIFICACAO.ATIVARTOLERANCIA, coalesce(PESSOASCLASSIFICACAO.FUNCIONARIO, 'N')
    from PESSOASCLASSIFICACAO
    where PESSOASCLASSIFICACAO.SEQUENCIA = :SEQCLASSIFICACAO
    into :V_ATIVARTOLERANCIA, :FUNCIONARIO;

    if ((trim(V_ATIVARTOLERANCIA) = 'S') and
        (V_CODCLASSVISIT <> :SEQCLASSIFICACAO) and
        (V_CODCLASSSERV <> :SEQCLASSIFICACAO) and
        (V_CODCLASSENT <> :SEQCLASSIFICACAO)) then
    begin
      V_TIPOACESSO = '';

      select CIRCULACAO.TIPOACESSO
      from CIRCULACAO
      where CIRCULACAO.SEQUENCIA = :SEQCIRCULACAO
      into :V_TIPOACESSO;

      V_ACIMAHORARIO = '';

      if (trim(TIPO) = 'S') then
      begin
        select ACIMAHORARIO.ACIMA
        from ACIMAHORARIO(:SEQPESSOA, :TIPO)
        into :V_ACIMAHORARIO;
      end
      else
      if (trim(V_TIPOACESSO) <> '') then
      begin
        select ACIMAHORARIO.ACIMA
        from ACIMAHORARIO(:SEQPESSOA, :V_TIPOACESSO)
        into :V_ACIMAHORARIO;
      end

      if (V_ACIMAHORARIO = 'S') then
        PERMITIDO = 'N';
    end
  end
  /*---------------------------------------------------------------------------*/
  if (PERMITIDO = 'S') then
  begin
    if ((CLASSIFPERMITIDAS is null) or (CLASSIFPERMITIDAS = '')) then
      PERMITIDO = 'N';
    else
    begin
      CLASSIF = lpad(trim(cast(SEQCLASSIFICACAO as varchar(4))), 4, '0');
      CLASSIFCAD = lpad(trim(cast(SEQCLASSIFCAD as varchar(4))), 4, '0');
      if (CLASSIFCAD is null) then
        CLASSIFCAD = '9999';
      if ((position(CLASSIF, CLASSIFPERMITIDAS) = 0) and
          (position(CLASSIFCAD, CLASSIFPERMITIDAS) = 0)) then
        PERMITIDO = 'N';
    end
  end
  /*---------------------------------------------------------------------------*/

  if ((SENTIDO = 'X') and
      (SEQCIRCULACAO = 0)) then
  begin
    select first (1) CIRCULACAO.SEQUENCIA, ROTAS.FILTRODISP, CIRCULACAO.ROTA
    from CIRCULACAO
    left join ROTAS on ROTAS.SEQUENCIA = coalesce(CIRCULACAO.ROTA, 0)
    where (CIRCULACAO.PESSOA = :SEQPESSOA) and
          (CIRCULACAO.DATAHORASAI is null) and
          (CIRCULACAO.ULTIMA = 'S')
    into :SEQCIRCULACAO, :CIRCFILTROROTA, :CIRCSEQROTA;
  end

  if ((SEQCIRCULACAO is not null) and
      (SEQCIRCULACAO <> 0) and
      (CIRCSEQROTA is not null)) then
  begin
    if (position(:V_BUSCADISP, :CIRCFILTROROTA) = 0) then
      PERMITIDO = 'N';
  end

  /*(INICIO ROTAPORUNIDADE) Caso a pessoa esteja autorizada mas exista verificação de rota por unidade*/
  if ((PERMITIDO = 'S') and
      ((select first (1) coalesce("CF_Empresa".USARROTAUNID, 'N')
        from "CF_Empresa") = 'S')) then
  begin
    PERMITIDO = 'N';
    /*Verifica primeiro os vinculos da pessoa*/
    if (PERMITIDO = 'N') then
    begin
      for select PESSOASVINC.SEQUNIDADE
          from PESSOASVINC
          where (PESSOASVINC.SEQPESSOA = :SEQPESSOA) and
                ('S' in (PESSOASVINC.PROP, PESSOASVINC.PROPTIT, PESSOASVINC.LOC, PESSOASVINC.LOCTIT, PESSOASVINC.MOR, PESSOASVINC.RESPONSAVEL))
          into :V_SEQUNIDADE
      do
      begin
        if (PERMITIDO = 'N') then
        begin
          select CONFIRMA_ROTA.PERMITIDO
          from CONFIRMA_ROTA(:V_SEQUNIDADE, :DISPOSITIVO)
          into :PERMITIDO;
        end
      end
    end
    /*****************************************/
    /*Caso ainda não esteja permitido, verifica as Autorizações da Pessoa*/
    if (PERMITIDO = 'N') then
    begin
      for select UNIDADES.SEQUENCIA, COM_RESTRICOES
          from AUTORIZACOES
          inner join UNIDADES on ((UNIDADES.QUADRA = AUTORIZACOES.QUADRA) and
                (UNIDADES.LOTE = AUTORIZACOES.LOTE))
          where AUTORIZACOES.PESSOA = :SEQPESSOA and
                (AUTORIZACOES.CANCELADO = 'N') and
                ((AUTORIZACOES.PERMANENTE = 'S') or (current_date between AUTORIZACOES.VALIDADEINI and AUTORIZACOES.VALIDADEFIM))
          into :V_SEQUNIDADE, :COM_RESTRICOES
      do
      begin
        if (PERMITIDO = 'N') then
        begin
          select CONFIRMA_ROTA.PERMITIDO
          from CONFIRMA_ROTA(:V_SEQUNIDADE, :DISPOSITIVO)
          into :PERMITIDO;
        end
        if (COM_RESTRICOES = 'N') then
          UNIDADE_COM_RESTR = 'N';
      end
    end
    /*********************************************/
    /*Caso ainda não esteja permitido, verifica as unidades de destino*/
    if ((PERMITIDO = 'N') and
        (coalesce(SEQCIRCULACAO, 0) > 0)) then
    begin
      for select CIRCULACAODEST.SEQUNIDADE
          from CIRCULACAODEST
          where CIRCULACAODEST.SEQCIRCULACAO = :SEQCIRCULACAO
          into :V_SEQUNIDADE
      do
      begin
        if (PERMITIDO = 'N') then
        begin
          select CONFIRMA_ROTA.PERMITIDO
          from CONFIRMA_ROTA(:V_SEQUNIDADE, :DISPOSITIVO)
          into :PERMITIDO;
        end
      end
    end
    /******************************************************************/
  end
  /* verifica bloqueio para funcionario em ferias */
  if ((PERMITIDO = 'S') and(FUNCIONARIO = 'S') and(FERIASBLOQACESSO = 'S') and(PROP <> 'S') and(LOC <> 'S') and(MOR <> 'S') and(VRESP <> 'S')) then
  begin
    ANO = cast(extract(year from current_timestamp) as char(4));
    FERIASINICIO = ANO || '-' || substring(cast((FERIASINIMES + 100) as char(3)) from 2 for 2) || '-' || substring(cast((FERIASINIDIA + 100) as char(3)) from 2 for 2);
    if (FERIASINIMES > FERIASFIMMES) then
      ANO = cast(extract(year from current_timestamp) + 1 as char(4));
    FERIASFINAL = ANO || '-' || substring(cast((FERIASFIMMES + 100) as char(3)) from 2 for 2) || '-' || substring(cast((FERIASFIMDIA + 100) as char(3)) from 2 for 2);
    if ((cast(current_timestamp as date) >= cast(FERIASINICIO as date)) and
        (cast(current_timestamp as date) <= cast(FERIASFINAL as date))) then
    begin
      PERMITIDO = 'N';
      CLASSIPERM = '{FERIAS}';
    end
  end

  idade=datediff(year from datanascimento to current_date);
  if ((extract(month from datanascimento) > extract(month from current_date)) or
     ((extract(month from datanascimento) = extract(month from current_date) and
       extract(day from datanascimento) > extract(day from current_date)))) then
    idade = idade - 1;
  if (idade < 0) then
    idade = 999;
  UNIDRESTR='N';
 if ((Permitido = 'S') and (Menoridade_NaoAbrir = 'S') and (idade < 16) and (SENTIDO <> 'E')) then
  begin
    post_event('MENORIDADE'||cast(dispositivo as varchar(5)));
    if (CVISUAL_ATIVAR <> 'S') then
      PERMITIDO = 'N';
  end
  if ((Permitido = 'S') and (UnidRestr_NaoAbrir = 'S') and (unidade_com_restr = 'S')) then
  begin
    post_event('UNIDRESTR'||cast(dispositivo as varchar(5)));
    if (CVISUAL_ATIVAR <> 'S') then
      PERMITIDO = 'N';
    UNIDRESTR = 'S';
  end
  suspend;
end