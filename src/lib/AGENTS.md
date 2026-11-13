# Fiscal XML architecture
- DPS issuance must use reserveValidatedDps before number allocation: reject self-recipient and invalid approximate-tax matrix, and omit zero discounts, preventing avoidable business rejections without consuming numbers.
- DPS tests fix only TSSerieDPS ^/$ literals in memory (official defect); ZIP stays intact. XML rejects DTD/entities and keeps decimal strings.
