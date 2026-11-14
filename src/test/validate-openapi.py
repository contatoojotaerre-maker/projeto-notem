"""Validate the partner contract with the OpenAPI 3.1 specification validator."""
import sys
from pathlib import Path

import yaml
from openapi_spec_validator import OpenAPIV31SpecValidator


def validate(path):
    with path.open(encoding="utf-8") as source:
        specification = yaml.safe_load(source)
    if not isinstance(specification, dict) or specification.get("openapi") != "3.1.0":
        raise ValueError("A especificação deve declarar OpenAPI 3.1.0.")
    errors = list(OpenAPIV31SpecValidator(specification).iter_errors())
    if errors:
        for error in errors:
            location = "/".join(str(part) for part in error.absolute_path)
            print(f"{location}: {error.message}", file=sys.stderr)
        raise ValueError(f"OpenAPI 3.1 inválido: {len(errors)} erro(s).")
    print(f"{path.as_posix()}: OpenAPI 3.1.0 válido — 0 erros (openapi-spec-validator 0.7.2).")


if __name__ == "__main__":
    try:
        validate(Path(sys.argv[1] if len(sys.argv) > 1 else "docs/api/openapi.yaml"))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)