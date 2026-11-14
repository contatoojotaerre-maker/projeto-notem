import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const validator = 'src/test/validate-openapi.py';

describe('Contrato OpenAPI 3.1', () => {
  it('valida a especificação pública completa com OpenAPIV31SpecValidator', () => {
    const result = execFileSync('python3', [validator], { encoding: 'utf8' });
    expect(result).toContain('OpenAPI 3.1.0 válido — 0 erros');
  });

  it('recusa YAML legível com propriedade inválida em uma resposta OpenAPI', () => {
    const folder = mkdtempSync(join(tmpdir(), 'notem-openapi-'));
    try {
      const path = join(folder, 'invalid.yaml');
      writeFileSync(path, `openapi: 3.1.0
info: {title: Contrato inválido de controle, version: "1.0.0"}
paths:
  /notas:
    post:
      responses:
        "409": {description: IDEMPOTENCIA_CONFLITO, ID_EXTERNO_DUPLICADO ou configuração alterada}
`);
      expect(() => execFileSync('python3', [validator, path], { stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});