# `Lusiad` – Demonstração

[🇺🇸 English](../en/demo.md) · **🇧🇷 Português (Brasil)**

### Nesta página

> [1. Antes da movimentação](#-1-antes-da-movimentação)<br>
> [2. Movimentar o método](#-2-movimentar-o-método)<br>
> [3. Comparar os commits](#-3-comparar-os-commits)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 🧩 1. Antes da movimentação

Em um projeto Java criado só para esta demonstração, `Exemplo.java` continha `iniciar()` antes de `encerrar()`. Na interface real, o usuário selecionou `encerrar()` no modelo e o arrastou para antes de `iniciar()`. O código Java passou a refletir a nova ordem. Em seguida, registrou o commit **Mover encerrar antes de iniciar**, abriu a mudança individual no histórico e comparou esse commit com **Preparar dois métodos**.

![Modelo Java e biblioteca antes do movimento: iniciar acima de encerrar](../assets/01-modelagem.png)
*1. Estado anterior: biblioteca, modelo e código de `Exemplo.java`.*

## ↕️ 2. Movimentar o método

![Modelo Java depois do movimento: encerrar acima de iniciar](../assets/02-movimento.png)
*2. A posição dos métodos mudou no modelo e no arquivo Java.*

## 🔍 3. Comparar os commits

![Comparação visual lado a lado entre os commits anterior e posterior](../assets/05-comparacao.png)
*3. A comparação de versões mostra os estados anterior e posterior.*

---

<table width="100%">
<tr>
<td align="left"><a href="manual.md">⬅️ Página anterior · Manual de uso</a></td>
<td align="center"><a href="index.md">2️⃣ Demonstração</a></td>
<td align="right"><a href="preparacao.md">Próxima página ➡️ Instalação</a></td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](../../README.pt-BR.md)**

- [🖥️ Manual de uso](manual.md)
- [🎬 Demonstração](demonstracao.md) 👈

**[⚙️ Instalação](preparacao.md)**

- [🔧 Guia de instalação](instalacao.md)
- [🚀 Primeiros passos](primeiros-passos.md)

**[📐 Projeto](projeto.md)**

- [📋 Requisitos](requisitos.md)
- [✏️ Prototipação](prototipacao.md)

**[💻 Implementação](indice-implementacao.md)**

- [🏗️ Arquitetura](arquitetura.md)
- [🔍 Elementos notáveis da implementação](implementacao.md)
