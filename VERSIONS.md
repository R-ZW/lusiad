# Revisões e proveniência

| Componente | Revisão fonte da cópia | Evidência |
| --- | --- | --- |
| Plugin e API local | `851120de39bf0b90987d939db0d4f2407db04111` | HEAD de `lusiad-backend` na preparação. |
| Interface web | `d2f9326a2041374541aa4e8781d79767e184c884` | HEAD de `lusiad-frontend` na preparação. |

Os dois commits são de 8 de novembro de 2026, primeiro dia das sessões principais. Isso indica candidatas plausíveis para a versão avaliada. A confirmação requer confrontar os registros de execução ou o próprio autor. A release será identificada por tag e conterá seu próprio manifesto de hashes. O ZIP `lusiad-1.0-SNAPSHOT.zip` encontrado no backend foi gerado em outubro e não representa esta revisão.

Não há licença autoral selecionada para o conjunto. Após a decisão, adicionar um `LICENSE` na raiz e conferir a compatibilidade dos avisos das dependências, incluindo `lusiad-backend/src/main/resources/licenses/`.

## Candidata de distribuição

Os arquivos em `release/` foram construídos a partir das cópias dos commits acima. A cópia do backend substitui o fornecedor genérico `YourCompany` por `Lusiad` no descritor do plugin; a cópia do frontend ajusta caminhos ilustrativos e um manual interno. A revisão demonstrada na interface em 15/11/2026 foi o par de commits de origem acima, por meio dos serviços já em execução; o teste dos ZIPs é uma verificação separada. O cenário AVAL-BASE reescreveu apenas autoria e hashes dos três commits, mantendo suas árvores, e atualizou as referências SQL. Consulte o manifesto da candidata para hashes dos arquivos.
