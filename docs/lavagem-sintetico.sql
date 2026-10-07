-- ============================================================================
-- INSUMO SINTÉTICO — Módulo de Lavagem (SIG Frota / APEX)
-- Para uso no Hackathon MPF & AWS (lab isolado, dados fictícios).
-- Derivado do módulo real (FR_LAVAGEM, páginas APEX 10/45), porém:
--   - anonimizado e com dados 100% fictícios;
--   - veículo e posto simplificados (mock) para não arrastar as tabelas
--     FR_VEICULO/FR_MODELO/FR_MARCA/FR_POSTO/FR_UNIDADE_TRANSPORTE inteiras.
-- Objetivo: servir de entrada para o Kiro extrair regras e reimplementar em Java.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabela de apoio: tipos de lavagem
-- ---------------------------------------------------------------------------
CREATE TABLE FR_TIPO_LAVAGEM (
    ID_TIPO_LAVAGEM   NUMBER(3,0)     NOT NULL,
    DS_TIPO_LAVAGEM   VARCHAR2(255)   NOT NULL,
    CONSTRAINT FR_TIPO_LAVAGEM_PK PRIMARY KEY (ID_TIPO_LAVAGEM)
);

-- Trigger de PK (equivalente ao BI_FR_TIPO_LAVAGEM do sistema real)
CREATE SEQUENCE FR_TIPO_LAVAGEM_SEQ START WITH 4 INCREMENT BY 1 NOCACHE;

-- ---------------------------------------------------------------------------
-- 2. Mock de veículo (no sistema real é FK para FR_VEICULO)
--    Simplificado: só o necessário para a Lavagem funcionar.
-- ---------------------------------------------------------------------------
CREATE TABLE FR_VEICULO_MOCK (
    ID_VEICULO   NUMBER(19,0)   NOT NULL,
    DS_VEICULO   VARCHAR2(120)  NOT NULL,  -- ex.: "Fiat Cronos de placa ABC1D23"
    KM_ATUAL     NUMBER(10,0),             -- último odômetro conhecido (mock)
    CONSTRAINT FR_VEICULO_MOCK_PK PRIMARY KEY (ID_VEICULO)
);

-- ---------------------------------------------------------------------------
-- 3. Mock de posto conveniado (no sistema real é FK para FR_POSTO)
-- ---------------------------------------------------------------------------
CREATE TABLE FR_POSTO_MOCK (
    ID_POSTO   NUMBER(19,0)   NOT NULL,
    NM_POSTO   VARCHAR2(120)  NOT NULL,
    CONSTRAINT FR_POSTO_MOCK_PK PRIMARY KEY (ID_POSTO)
);

-- ---------------------------------------------------------------------------
-- 4. Tabela principal: FR_LAVAGEM (estrutura fiel ao sistema real)
--    Regras embutidas nas constraints:
--      - VL_LAVAGEM > 0  (CHECK)
--      - KM_LAVAGEM > 0  (CHECK)
--      - ID_TIPO_LAVAGEM, DT_LAVAGEM, KM_LAVAGEM, ID_VEICULO obrigatórios
-- ---------------------------------------------------------------------------
CREATE TABLE FR_LAVAGEM (
    ID_LAVAGEM             NUMBER(10,0)   NOT NULL,
    ID_TIPO_LAVAGEM        NUMBER(3,0)    NOT NULL,
    DT_LAVAGEM             DATE           NOT NULL,
    KM_LAVAGEM             NUMBER(6,0)    NOT NULL,
    VL_LAVAGEM             NUMBER(5,2),
    ID_VEICULO             NUMBER(19,0)   NOT NULL,
    DS_POSTO               VARCHAR2(255),   -- preenchido quando posto NÃO conveniado
    CNPJ_POSTO             VARCHAR2(18),    -- idem
    ID_POSTO               NUMBER(19,0),    -- preenchido quando posto conveniado
    ID_PESSOA_CADASTRADOR  NUMBER(19,0),
    DT_CADASTRO            DATE,
    CONSTRAINT FR_LAVAGEM_PK PRIMARY KEY (ID_LAVAGEM),
    CONSTRAINT FR_LAVAGEM_CK1 CHECK (VL_LAVAGEM > 0),
    CONSTRAINT FR_LAVAGEM_CK2 CHECK (KM_LAVAGEM > 0),
    CONSTRAINT FR_LAVAGEM_FK      FOREIGN KEY (ID_TIPO_LAVAGEM) REFERENCES FR_TIPO_LAVAGEM (ID_TIPO_LAVAGEM),
    CONSTRAINT FR_LAVAGEM_FK_VEIC FOREIGN KEY (ID_VEICULO)      REFERENCES FR_VEICULO_MOCK (ID_VEICULO),
    CONSTRAINT FR_LAVAGEM_FK_POST FOREIGN KEY (ID_POSTO)        REFERENCES FR_POSTO_MOCK (ID_POSTO)
);

CREATE SEQUENCE FR_LAVAGEM_SEQ START WITH 3397 INCREMENT BY 1 NOCACHE;

-- ---------------------------------------------------------------------------
-- 5. Dados fictícios
-- ---------------------------------------------------------------------------
INSERT INTO FR_TIPO_LAVAGEM (ID_TIPO_LAVAGEM, DS_TIPO_LAVAGEM) VALUES (1, 'Simples');
INSERT INTO FR_TIPO_LAVAGEM (ID_TIPO_LAVAGEM, DS_TIPO_LAVAGEM) VALUES (2, 'Completa');
INSERT INTO FR_TIPO_LAVAGEM (ID_TIPO_LAVAGEM, DS_TIPO_LAVAGEM) VALUES (3, 'Higienizacao interna');

INSERT INTO FR_VEICULO_MOCK (ID_VEICULO, DS_VEICULO, KM_ATUAL) VALUES (101, 'Fiat Cronos de placa ABC1D23', 45210);
INSERT INTO FR_VEICULO_MOCK (ID_VEICULO, DS_VEICULO, KM_ATUAL) VALUES (102, 'VW Voyage de placa DEF2G45',   88750);
INSERT INTO FR_VEICULO_MOCK (ID_VEICULO, DS_VEICULO, KM_ATUAL) VALUES (103, 'Chevrolet Onix de placa HIJ3K67', 12030);

INSERT INTO FR_POSTO_MOCK (ID_POSTO, NM_POSTO) VALUES (10, 'Auto Posto Central (conveniado)');
INSERT INTO FR_POSTO_MOCK (ID_POSTO, NM_POSTO) VALUES (11, 'Lava-Rapido Norte (conveniado)');

-- Lavagem em posto conveniado (tem ID_POSTO, sem DS_POSTO/CNPJ)
INSERT INTO FR_LAVAGEM (ID_LAVAGEM, ID_TIPO_LAVAGEM, DT_LAVAGEM, KM_LAVAGEM, VL_LAVAGEM, ID_VEICULO, DS_POSTO, CNPJ_POSTO, ID_POSTO, ID_PESSOA_CADASTRADOR, DT_CADASTRO)
VALUES (3397, 2, DATE '2026-09-01', 45000, 60.00, 101, NULL, NULL, 10, 9001, DATE '2026-09-01');

-- Lavagem em posto NÃO conveniado (tem DS_POSTO + CNPJ, sem ID_POSTO)
INSERT INTO FR_LAVAGEM (ID_LAVAGEM, ID_TIPO_LAVAGEM, DT_LAVAGEM, KM_LAVAGEM, VL_LAVAGEM, ID_VEICULO, DS_POSTO, CNPJ_POSTO, ID_POSTO, ID_PESSOA_CADASTRADOR, DT_CADASTRO)
VALUES (3398, 1, DATE '2026-09-03', 88800, 35.00, 102, 'Lava-Jato do Ze', '12.345.678/0001-90', NULL, 9001, DATE '2026-09-03');

-- Lavagem interna (na própria unidade): sem valor e sem posto
INSERT INTO FR_LAVAGEM (ID_LAVAGEM, ID_TIPO_LAVAGEM, DT_LAVAGEM, KM_LAVAGEM, VL_LAVAGEM, ID_VEICULO, DS_POSTO, CNPJ_POSTO, ID_POSTO, ID_PESSOA_CADASTRADOR, DT_CADASTRO)
VALUES (3399, 3, DATE '2026-09-05', 12050, NULL, 103, NULL, NULL, NULL, 9001, DATE '2026-09-05');

COMMIT;

-- ============================================================================
-- NOTA: as regras de negócio CONDICIONAIS (posto conveniado vs. não conveniado,
-- lavagem na própria unidade dispensando valor/posto) NÃO estão no DDL — elas
-- vivem no PL/SQL das validações da página APEX 45. Ver arquivo companheiro
-- "lavagem-gabarito-regras.md" para a lista completa a ser reimplementada em Java.
-- ============================================================================
