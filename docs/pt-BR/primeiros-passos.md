# `Lusiad` – Primeiros passos

[🇺🇸 English](../en/first-steps.md) · **🇧🇷 Português (Brasil)**

Altere o bônus de um pequeno programa Java de `10` para `20` usando um bloco no canvas. Depois, localize essa edição no histórico e compare as duas versões salvas do arquivo.

### Nesta página

> [1. Preparar e abrir o exemplo](#criar-um-projeto)<br>
> [2. Salvar a versão inicial](#versao-inicial)<br>
> [3. Editar um bloco e conferir a mudança](#editar-o-modelo)<br>
> [4. Fazer o commit e consultar a edição](#registrar-e-consultar)<br>
> [5. Comparar as duas versões](#comparar-versoes)<br>
> [Índice da documentação](#índice-da-documentação)

---

<a name="criar-um-projeto"></a>
<a name="-1-criar-um-projeto"></a>

## 📂 1. Preparar e abrir o exemplo

Mantenha o IntelliJ aberto com a API do Lusiad ativa. Abra a interface web, normalmente em `http://localhost:3000`. Caso ainda precise iniciar os serviços, siga o [guia de instalação](instalacao.md#configuração).

Crie uma pasta chamada `lusiad-first-steps` fora de qualquer repositório Git existente. Salve o programa a seguir como `Score.java` na raiz dessa pasta. Ele soma o atributo `bonus` a uma pontuação base de `100`.

```java
public class Score {
  private static int bonus = 10;

  public static void main(String[] args) {
    System.out.println(100 + bonus);
  }
}
```

1. Em **Projetos**, clique em **Novo projeto** e informe `Primeiros passos` como nome. Em **Caminho**, informe o caminho completo de `lusiad-first-steps` ou use o seletor de pastas.
2. Clique em **Criar projeto**. O Lusiad abre a área de trabalho. Para reabri-la mais tarde, selecione o cadastro em **Projetos** e clique em **Abrir projeto**.
3. Abra o **Navegador de arquivos** na barra lateral esquerda e dê um duplo clique em `Score.java`. O canvas mostra o código Java com blocos para a classe, o atributo e o método. [Controles da área de trabalho](manual.md#ambiente-de-modelagem)

<a name="versao-inicial"></a>

## 💾 2. Salvar a versão inicial

Abra o **Menu de commit** na barra lateral direita e clique em **Inicializar repositório**. Aguarde a mensagem **Nenhuma mudança para commit**. A versão inicial contém `Score.java` com `bonus = 10` e será a base da comparação. Feche o menu para voltar ao canvas. Se a inicialização falhar, confira os [pré-requisitos do Git](instalacao.md#pré-requisitos).

<a name="editar-o-modelo"></a>
<a name="-2-editar-o-modelo"></a>

## 🧩 3. Editar um bloco e conferir a mudança

1. No canvas, selecione o bloco que contém `private static int bonus = 10;`. Se a classe ou outro elemento menor ficar selecionado, clique perto da borda do bloco do atributo.
2. Clique em **Expandir propriedades** ao lado do canvas. Em **Atributos**, localize **Valor inicial (opcional)** e troque `10` por `20`. Na aba **Código Java** do mesmo painel, você pode conferir a declaração proposta antes de salvá-la.
3. Clique em **Salvar**. O canvas deve mostrar `private static int bonus = 20;`. Abra o **Histórico de mudanças**, à direita, e expanda **Mudanças não commitadas**. A edição de `Score.java` deve aparecer na lista. Nesse momento, o arquivo em disco já contém o novo valor e a edição aguarda um commit. [Propriedades e confirmação de edições](manual.md#propriedades)

Se a execução Java estiver configurada, clique em **Executar código Java** acima do canvas. Após a edição, o exemplo imprime `120`. [Configuração e execução Java](manual.md#java)

<a name="registrar-e-consultar"></a>
<a name="-3-registrar-e-consultar"></a>

## 🕘 4. Fazer o commit e consultar a edição

1. Abra o **Menu de commit** e confira se `Score.java` aparece na lista de arquivos. Em **Título do commit**, escreva `Aumentar o bônus da pontuação` e clique em **Commit**.
2. Abra o **Histórico de mudanças**. Em **Versões salvas**, expanda **Aumentar o bônus da pontuação** e clique na edição de `Score.java`. Se o commit ainda não aparecer, clique em **Recarregar**.
3. Confira os dois lados da prévia. **Antes** deve mostrar `bonus = 10` e **Depois** deve mostrar `bonus = 20`. Clique em **Expandir**, na parte inferior do histórico, para abrir a visualização detalhada. [Histórico e detalhes da mudança](manual.md#historico)

<a name="comparar-versoes"></a>

## 🔍 5. Comparar as duas versões

1. Abra **Comparar versões** na barra lateral direita. Em **Base**, selecione o primeiro commit, criado na inicialização do repositório. Em **Alvo**, selecione **Aumentar o bônus da pontuação**.
2. Clique em **Comparar** e selecione `Score.java` na lista de arquivos. Abra **Git diff** para ver a linha removida da base (`-`) e a linha adicionada no alvo (`+`). Alterne para **Canvas** para localizar a mesma mudança no modelo.

```diff
-  private static int bonus = 10;
+  private static int bonus = 20;
```

O **Histórico de mudanças** mostra o estado imediatamente antes e depois de uma operação. **Comparar versões** mostra o conjunto de diferenças entre as duas referências escolhidas. [Comparação de versões](manual.md#comparacao)

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
