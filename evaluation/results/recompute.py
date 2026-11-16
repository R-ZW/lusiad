"""Recalculate published aggregate summaries without loading participant records."""

import csv
import statistics
from pathlib import Path


def weighted_scores(name):
    with (Path(__file__).parent / name).open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))
    return [float(row["pontuacao"]) for row in rows for _ in range(int(row["frequencia"]))]


for name in ("tarefas.csv", "sus.csv"):
    scores = weighted_scores(name)
    print(f"{name}: n={len(scores)}, média={statistics.mean(scores):.2f}, "
          f"mediana={statistics.median(scores):.2f}, intervalo={min(scores):g}–{max(scores):g}")
    if name == "sus.csv":
        print(f"desvio-padrão amostral SUS={statistics.stdev(scores):.2f}")

with (Path(__file__).parent / "itens.csv").open(encoding="utf-8", newline="") as file:
    grouped = {}
    for row in csv.DictReader(file):
        grouped.setdefault(row["item"], []).append((int(row["grau"]), int(row["frequencia"])))
for item, values in grouped.items():
    n = sum(f for _, f in values)
    mean = sum(g * f for g, f in values) / n if n else float("nan")
    print(f"{item}: válidas={n}, média={mean:.2f}, distribuição=" +
          ",".join(str(f) for _, f in values))

with (Path(__file__).parent / "intencoes_pareadas.csv").open(encoding="utf-8", newline="") as file:
    paired = {row["relacao"]: int(row["frequencia"]) for row in csv.DictReader(file)}
print("IU2 versus IU1:", paired, "total=", sum(paired.values()))
