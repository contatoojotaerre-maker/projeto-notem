# notem-transmissor

Serviço isolado responsável apenas pela comunicação fiscal da notem (assinar e enviar ao governo).
Roda no Google Cloud Run, região southamerica-east1 (São Paulo).

Etapa atual: **prova de conectividade** (sem certificado, sem DPS, sem banco, sem segredos).
Endpoint: `GET /diagnostico` — exige autenticação do Google (serviço não público).
