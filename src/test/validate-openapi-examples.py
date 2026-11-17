"""Validate every example of the public OpenAPI contract against the schema of its own request or response.

Also requires a request example for every request body and an example for every documented response with content,
so the public documentation never shows an operation without examples.
"""
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

METHODS = ("get", "post", "put", "patch", "delete")


def pointer(parts):
    return "/" + "/".join(str(p).replace("~", "~0").replace("/", "~1") for p in parts)


def deref(doc, node):
    seen = 0
    while isinstance(node, dict) and "$ref" in node and seen < 10:
        ref = node["$ref"]
        if not ref.startswith("#/"):
            raise ValueError(f"referência externa não suportada: {ref}")
        target = doc
        for part in ref[2:].split("/"):
            target = target[part.replace("~1", "/").replace("~0", "~")]
        node, seen = target, seen + 1
    return node


def main(path):
    doc = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    registry = Registry().with_resource("urn:oa", Resource.from_contents(doc, default_specification=DRAFT202012))
    errors, checked, operations = [], 0, 0

    def check(where, schema_path, examples):
        nonlocal checked
        if not examples:
            errors.append(f"{where}: sem exemplo")
            return
        validator = Draft202012Validator({"$ref": "urn:oa#" + pointer(schema_path)}, registry=registry, format_checker=FormatChecker())
        for name, example in examples.items():
            value = deref(doc, example).get("value")
            for error in validator.iter_errors(value):
                loc = "/".join(str(p) for p in error.absolute_path)
                errors.append(f"{where} exemplo {name} em '{loc}': {error.message[:200]}")
            checked += 1

    for route, item in doc["paths"].items():
        for method in METHODS:
            op = item.get(method)
            if not op:
                continue
            operations += 1
            base = ["paths", route, method]
            body = op.get("requestBody")
            if body:
                body = deref(doc, body)
                for media, content in body["content"].items():
                    check(f"{method.upper()} {route} corpo", base + ["requestBody", "content", media, "schema"], content.get("examples"))
            for status, response in op["responses"].items():
                if "$ref" in response:
                    if deref(doc, response).get("content"):
                        errors.append(f"{method.upper()} {route} {status}: resposta sem exemplo")
                    continue
                for media, content in (response.get("content") or {}).items():
                    check(f"{method.upper()} {route} {status}", base + ["responses", status, "content", media, "schema"], content.get("examples"))
    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        raise SystemExit(f"{len(errors)} problema(s) nos exemplos.")
    print(f"EXEMPLOS OK — {operations} operações, {checked} exemplos válidos pelo esquema.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "docs/api/openapi.yaml")
