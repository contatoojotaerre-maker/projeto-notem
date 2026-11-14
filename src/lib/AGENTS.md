# Fiscal XML architecture
- DPS issuance must use reserveValidatedDps before atomic number/row allocation: reject self-recipient, invalid approximate-tax/special-regime matrices and withholding without national recipient/address; omit zero discounts to avoid business rejections without consuming numbers.
- DPS tests fix only TSSerieDPS ^/$ literals in memory (official defect); ZIP stays intact. XML rejects DTD/entities and keeps decimal strings.
- Issuance uses an atomic durable key/snapshot/number/row RPC; ambiguous sends reconcile under database leases, never retransmit. Terminal transitions enqueue webhooks atomically; only API waitUntil triggers immediate delivery, otherwise the scheduler queue persists.
- New automatic series start at 900; explicit send-only E0014 allows five durable skips under leases with the same invoice/idempotency key, retaining each externally used number/XML/response to prevent reuse. Ambiguities never skip.
- API and panel share a server-only DANFSe renderer with embedded font/logo and authorized XML only, except current status and receipt preference, to prevent drift with live company records.
- NFS-e event requests (pedRegEvento) and the DPS subst group come from one builder module that enforces the official TSString/TSMotivo character set and E0812/E0042 issuer checks before any send, so invalid text never reaches the government.
