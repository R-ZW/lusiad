"""Render the AVAL-BASE SQL template for this copy of the scenario."""

import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    project = args.project.resolve()
    if not (project / ".git").is_dir():
        parser.error("AVAL-BASE must contain its original Git history")

    text = (directory / "aval-base-template.sql").read_text(encoding="utf-8")
    rendered = text.replace("__PROJECT_PATH__", project.as_posix())
    rendered = rendered.replace("__TEMP_PATH__", (project.parent / "temp" / "1").as_posix())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8")
    print(f"SQL preparado em {args.output}")
    print("Importe somente em uma instância MySQL descartável dedicada ao cenário.")


if __name__ == "__main__":
    main()
