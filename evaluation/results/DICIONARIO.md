# Dicionário dos resultados públicos

Cada linha representa uma **frequência agregada**, sem identificador individual.

| Arquivo | Colunas | Interpretação |
| --- | --- | --- |
| `perfil.csv` | `variavel`, `categoria`, `frequencia` | Número de participantes em cada categoria de uma variável de perfil. Variáveis isoladas não podem ser cruzadas. |
| `tarefas.csv` | `pontuacao`, `frequencia` | Distribuição de 0 a 10 respostas factuais compatíveis com o solicitado nas tarefas T3–T5. Não mede autonomia nem conclusão integral da tarefa. |
| `sus.csv` | `pontuacao`, `frequencia` | Distribuição da pontuação SUS convencional (0–100), com inversão dos itens pares. |
| `itens.csv` | `item`, `grau`, `frequencia` | Frequência dos cinco graus de concordância por item (SUS01–SUS10, UP1–UP3, IU1–IU2). Ausências e “Não consigo avaliar” não entram nos cinco graus. |
| `intencoes_pareadas.csv` | `relacao`, `frequencia` | Comparação de IU2 e IU1 apenas para participantes com as duas respostas válidas; categorias: maior, iguais, menor. |

As contagens podem ser conferidas com `python -X utf8 recompute.py`. A origem restrita inclui as respostas completas dos formulários, comentários livres e transcrições. Essas fontes não integram o pacote público. A nota das tarefas foi conferida manualmente com tolerância a variações de escrita que mantêm o conteúdo solicitado.
