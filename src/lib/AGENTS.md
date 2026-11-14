# Fiscal XML architecture
- DPS issuance must use reserveValidatedDps before atomic number/row allocation: reject self-recipient, invalid approximate-tax/special-regime matrices and withholding without national recipient/address; omit zero discounts to avoid business rejections without consuming numbers.
- DPS tests fix only TSSerieDPS ^/$ literals in memory (official defect); ZIP stays intact. XML rejects DTD/entities and keeps decimal strings.
- Issuance uses an atomic durable key/snapshot/number/row RPC; ambiguous sends reconcile under database leases, never retransmit. Terminal transitions enqueue webhooks atomically; only API waitUntil triggers immediate delivery, otherwise the scheduler queue persists.
