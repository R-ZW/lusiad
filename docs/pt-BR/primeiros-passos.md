# `Lusiad` – Primeiros passos

[🇺🇸 English](../en/first-steps.md) · **🇧🇷 Português (Brasil)**

### Nesta página

> [1. Criar um projeto](#-1-criar-um-projeto)<br>
> [2. Editar o modelo](#-2-editar-o-modelo)<br>
> [3. Registrar e consultar](#-3-registrar-e-consultar)<br>
> [Índice da documentação](#índice-da-documentação)

---

<a name="criar-um-projeto"></a>

## 📂 1. Criar um projeto

Inicie o plugin e o frontend seguindo o [guia de instalação](instalacao.md). Em uma pasta descartável, salve o exemplo abaixo como `Exemplo.java`.

```java
public class Exemplo {
  private int limite = 10;
}
```

Na tela de projetos, escolha **Novo projeto**, dê um nome e informe o caminho da pasta. Selecione o cadastro e clique em **Abrir projeto**. Abra **Commit**, à direita, e selecione **Inicializar repositório**. Isso grava a versão inicial no Git antes da primeira edição. [Cadastro do projeto](manual.md#projetos) · [Controles de commit](manual.md#commit)

<a name="editar-o-modelo"></a>

## 🧩 2. Editar o modelo

No explorador, dê duplo clique em `Exemplo.java`. Selecione o atributo `limite` no canvas e abra **Propriedades**. Em **Atributos**, mude o valor inicial de `10` para `20` e clique em **Salvar**. Confira o novo valor no código Java e a edição em **Histórico de mudanças → Mudanças não commitadas**. [Propriedades e confirmação de edições](manual.md#propriedades)

<a name="registrar-e-consultar"></a>

## 🕘 3. Registrar e consultar

Em **Commit**, informe um título como **Alterar o valor inicial do atributo** e selecione **Commit**. No **Histórico de mudanças**, expanda esse commit e abra a edição individual. Confira se `limite` vale `10` em **Antes** e `20` em **Depois**. Use **Comparar versões** para comparar o commit inicial com o novo commit no arquivo inteiro. [Histórico](manual.md#historico) · [Comparação de versões](manual.md#comparacao)

---

<table width="100%">
<tr>
<td align="left"><a href="instalacao.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">4️⃣ Primeiros passos</a></td>
<td align="right"><a href="projeto.md">Próxima página ➡️</a></td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](../../README.pt-BR.md)**

- [🖥️ Manual de uso](manual.md)

**[⚙️ Instalação](preparacao.md)**

- [🔧 Guia de instalação](instalacao.md)
- [🚀 Primeiros passos](primeiros-passos.md) 👈

**[📐 Projeto](projeto.md)**

- [📋 Requisitos](requisitos.md)
- [✏️ Prototipação](prototipacao.md)

**[💻 Implementação](implementacao.md)**

- [🏗️ Arquitetura](arquitetura.md)
- [📂 Estrutura de diretórios](estrutura-de-diretorios.md)
- [🧰 Tecnologias utilizadas](tecnologias-utilizadas.md)
- [🗃️ Modelo de dados](modelo-de-dados.md)
- [🔌 Referência da API](referencia-da-api.md)
- [🔀 Diagramas de interação](diagramas-de-interacao.md)
- [🧭 Decisões de projeto](decisoes-de-projeto.md)
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md)

**[📊 Avaliação](avaliacao.md)**

- [📋 Planejamento](avaliacao-planejamento.md)
- [🧪 Execução](avaliacao-execucao.md)
- [📈 Resultados](avaliacao-resultados.md)
- [💬 Discussão](avaliacao-discussao.md)
- [📂 Materiais e dados](avaliacao-dados.md)
- [🗂️ Arquivos da avaliação](../zenodo/)
